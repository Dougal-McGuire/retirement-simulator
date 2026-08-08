import type { CashFlow, CustomExpense, SimulationParams, SimulationResults } from '@/types'
import { calculateCombinedExpenses, netAnnualPension } from '@/lib/simulation/engine'
import { cashFlowsEqual } from '@/lib/simulation/cashFlows'

export type PlanHealth = 'strong' | 'watch' | 'strained'

export type PlanInsightMetrics = {
  health: PlanHealth
  annualSpending: number
  monthlySpending: number
  pensionAnnual: number
  /** Same pension after the Besteuerungsanteil × income-tax rate haircut. */
  pensionAnnualNet: number
  bridgeYears: number
  retirementMedianAssets: number
  horizonMedianAssets: number
  firstYearPortfolioNeed: number
  firstYearWithdrawalRate: number | null
  realReturn: number
}

const comparableNumericParamKeys = [
  'currentAge',
  'retirementAge',
  'legalRetirementAge',
  'endAge',
  'currentAssets',
  'annualSavings',
  'annualSavingsGrowthRate',
  'monthlyPension',
  'averageROI',
  'roiVolatility',
  'averageInflation',
  'inflationVolatility',
  'capitalGainsTax',
  'taxAllowanceAnnual',
  'equityFundExemption',
  'pensionTaxablePortion',
  'pensionTaxRate',
  'legacyTargetReal',
  'equityAllocationStart',
  'equityAllocationEnd',
  'bondReturn',
  'bondVolatility',
  'dsWithdrawalRate',
  'dsCeilingRate',
  'dsFloorRate',
  'spendingFloorReal',
  'simulationRuns',
] as const satisfies readonly (keyof SimulationParams)[]

const scaleExpenses = (expenses: CustomExpense[], multiplier: number) =>
  expenses.map((expense) => ({
    ...expense,
    amount: Math.max(0, Math.round(expense.amount * multiplier)),
  }))

/**
 * "Spend 10% less" means every recurring expense, not only the ones the legacy
 * array can express — a windowed care-cost flow is spending too. One-off
 * expenses are left alone: a roof repair does not get 10% cheaper by choosing
 * to live more modestly.
 */
const scaleExpenseFlows = (flows: CashFlow[], multiplier: number) =>
  flows.map((flow) =>
    flow.kind === 'expense' && flow.frequency !== 'once'
      ? { ...flow, amount: Math.max(0, Math.round(flow.amount * multiplier)) }
      : flow
  )

export function areSimulationParamsEqual(
  currentParams: SimulationParams,
  resultParams: SimulationParams
): boolean {
  if (currentParams.withdrawalStrategy !== resultParams.withdrawalStrategy) {
    return false
  }

  if (
    currentParams.marketModel !== resultParams.marketModel ||
    currentParams.glidePathEnabled !== resultParams.glidePathEnabled ||
    currentParams.householdType !== resultParams.householdType
  ) {
    return false
  }

  if (comparableNumericParamKeys.some((key) => currentParams[key] !== resultParams[key])) {
    return false
  }

  if (currentParams.oneTimeIncomes.length !== resultParams.oneTimeIncomes.length) {
    return false
  }

  if (
    currentParams.oneTimeIncomes.some((income, index) => {
      const resultIncome = resultParams.oneTimeIncomes[index]
      return (
        income.age !== resultIncome.age ||
        income.amount !== resultIncome.amount ||
        income.name !== resultIncome.name
      )
    })
  ) {
    return false
  }

  // Windowed / one-off / nominally fixed flows have no counterpart in the two
  // legacy arrays, so results computed before one was added must go stale too.
  if (!cashFlowsEqual(currentParams.cashFlows ?? [], resultParams.cashFlows ?? [])) {
    return false
  }

  if (currentParams.customExpenses.length !== resultParams.customExpenses.length) {
    return false
  }

  return !currentParams.customExpenses.some((expense, index) => {
    const resultExpense = resultParams.customExpenses[index]
    return (
      expense.id !== resultExpense.id ||
      expense.name !== resultExpense.name ||
      expense.amount !== resultExpense.amount ||
      expense.interval !== resultExpense.interval
    )
  })
}

export function getPlanHealth(successRate: number): PlanHealth {
  if (successRate >= 90) return 'strong'
  if (successRate >= 75) return 'watch'
  return 'strained'
}

export function buildPlanInsightMetrics(
  params: SimulationParams,
  results: SimulationResults | null,
  options: { displayReal?: boolean } = {}
): PlanInsightMetrics {
  // Display-only: picks which pre-computed asset series the euro figures read
  // from. Ratios (withdrawal rate, real return) and base-year amounts such as
  // the expense total are already unit-free or already in today's euros.
  const assetPercentiles =
    (options.displayReal ? results?.assetPercentilesReal : undefined) ?? results?.assetPercentiles
  const combinedExpenses = calculateCombinedExpenses(params.customExpenses)
  const pensionAnnual = params.monthlyPension * 12
  // What the pension is actually worth to the plan: the engine funds spending
  // out of the after-tax pension, so the withdrawal need shown here must too.
  const pensionAnnualNet = netAnnualPension(params)
  const retirementIndex = results
    ? Math.max(
        0,
        results.ages.findIndex((age) => age >= params.retirementAge)
      )
    : -1
  const safeRetirementIndex = retirementIndex === -1 ? 0 : retirementIndex
  const horizonIndex = results ? Math.max(0, results.ages.length - 1) : 0
  const retirementMedianAssets = assetPercentiles?.p50[safeRetirementIndex] ?? params.currentAssets
  const horizonMedianAssets = assetPercentiles?.p50[horizonIndex] ?? params.currentAssets
  const firstYearPension = params.retirementAge >= params.legalRetirementAge ? pensionAnnualNet : 0
  const firstYearPortfolioNeed = Math.max(0, combinedExpenses.combinedAnnual - firstYearPension)
  const firstYearWithdrawalRate =
    retirementMedianAssets > 0 ? firstYearPortfolioNeed / retirementMedianAssets : null
  const realReturn = (1 + params.averageROI) / (1 + params.averageInflation) - 1

  return {
    health: getPlanHealth(results?.successRate ?? 0),
    annualSpending: combinedExpenses.combinedAnnual,
    monthlySpending: combinedExpenses.combinedMonthly,
    pensionAnnual,
    pensionAnnualNet,
    bridgeYears: Math.max(0, params.legalRetirementAge - params.retirementAge),
    retirementMedianAssets,
    horizonMedianAssets,
    firstYearPortfolioNeed,
    firstYearWithdrawalRate,
    realReturn,
  }
}

/**
 * Stress levers run at the plan's own run count — the same `effectiveRuns` the
 * dashboard hero was measured at.
 *
 * They used to run at `clamp(runs / 2, 150, 500)` for responsiveness, with a
 * separately re-measured baseline to keep the deltas honest. That made the
 * panel quote a baseline of its own (94.4 %) underneath a hero reading 95.2 %,
 * which is indefensible however carefully the delta was computed: two numbers
 * describing one plan must be one number. Common random numbers make the
 * lever runs a strict re-use of the hero's scenario set, so the baseline is now
 * literally the hero's result — no second run, and nothing left to disagree.
 */
export function scenarioPreviewRuns(params: SimulationParams): number {
  return params.simulationRuns
}

/**
 * The unchanged plan at the levers' run count. Identical to `params` now that
 * the levers no longer reduce the count; kept as the single place that would
 * have to change if they ever do again.
 */
export function buildScenarioBaselineParams(params: SimulationParams): SimulationParams {
  return { ...params, simulationRuns: scenarioPreviewRuns(params) }
}

export function buildScenarioParams(params: SimulationParams) {
  const previewRuns = scenarioPreviewRuns(params)
  const maxRetirementAge = Math.max(params.currentAge, params.endAge - 1)

  return [
    {
      id: 'laterRetirement',
      params: {
        ...params,
        retirementAge: Math.min(maxRetirementAge, params.retirementAge + 2),
        simulationRuns: previewRuns,
      },
    },
    {
      id: 'moreSavings',
      params: {
        ...params,
        annualSavings: Math.round(params.annualSavings * 1.1),
        simulationRuns: previewRuns,
      },
    },
    {
      id: 'lowerSpending',
      params: {
        ...params,
        customExpenses: scaleExpenses(params.customExpenses, 0.9),
        cashFlows: scaleExpenseFlows(params.cashFlows ?? [], 0.9),
        simulationRuns: previewRuns,
      },
    },
  ] as const
}
