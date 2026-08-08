import type { CustomExpense, SimulationParams, SimulationResults } from '@/types'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'

export type PlanHealth = 'strong' | 'watch' | 'strained'

export type PlanInsightMetrics = {
  health: PlanHealth
  annualSpending: number
  monthlySpending: number
  pensionAnnual: number
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
  'dsWithdrawalRate',
  'dsCeilingRate',
  'dsFloorRate',
  'simulationRuns',
] as const satisfies readonly (keyof SimulationParams)[]

const scaleExpenses = (expenses: CustomExpense[], multiplier: number) =>
  expenses.map((expense) => ({
    ...expense,
    amount: Math.max(0, Math.round(expense.amount * multiplier)),
  }))

export function areSimulationParamsEqual(
  currentParams: SimulationParams,
  resultParams: SimulationParams
): boolean {
  if (currentParams.withdrawalStrategy !== resultParams.withdrawalStrategy) {
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
  const firstYearPension = params.retirementAge >= params.legalRetirementAge ? pensionAnnual : 0
  const firstYearPortfolioNeed = Math.max(0, combinedExpenses.combinedAnnual - firstYearPension)
  const firstYearWithdrawalRate =
    retirementMedianAssets > 0 ? firstYearPortfolioNeed / retirementMedianAssets : null
  const realReturn = (1 + params.averageROI) / (1 + params.averageInflation) - 1

  return {
    health: getPlanHealth(results?.successRate ?? 0),
    annualSpending: combinedExpenses.combinedAnnual,
    monthlySpending: combinedExpenses.combinedMonthly,
    pensionAnnual,
    bridgeYears: Math.max(0, params.legalRetirementAge - params.retirementAge),
    retirementMedianAssets,
    horizonMedianAssets,
    firstYearPortfolioNeed,
    firstYearWithdrawalRate,
    realReturn,
  }
}

/**
 * Stress levers run at a reduced count so they stay responsive while the user
 * drags sliders. That is only safe if whatever they are compared against was
 * measured at the *same* count — see `buildScenarioBaselineParams`.
 */
export function scenarioPreviewRuns(params: SimulationParams): number {
  return Math.max(150, Math.min(500, Math.round(params.simulationRuns * 0.5)))
}

/**
 * The unchanged plan, re-measured at the levers' preview run count.
 *
 * Comparing a 250-run lever against the dashboard's 500-run headline mixes a
 * real effect with Monte Carlo sampling error, which is how a lever that can
 * only help ("spend 10% less") ends up displaying a negative delta. Running the
 * baseline at the same count makes the difference pure signal: the engine
 * reuses one fixed scenario set across parameter changes, so the two runs see
 * the same market paths and everything that is left is the lever itself.
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
        simulationRuns: previewRuns,
      },
    },
  ] as const
}
