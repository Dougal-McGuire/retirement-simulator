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

const scaleExpenses = (expenses: CustomExpense[], multiplier: number) =>
  expenses.map((expense) => ({
    ...expense,
    amount: Math.max(0, Math.round(expense.amount * multiplier)),
  }))

export function getPlanHealth(successRate: number): PlanHealth {
  if (successRate >= 90) return 'strong'
  if (successRate >= 75) return 'watch'
  return 'strained'
}

export function buildPlanInsightMetrics(
  params: SimulationParams,
  results: SimulationResults | null
): PlanInsightMetrics {
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
  const retirementMedianAssets =
    results?.assetPercentiles.p50[safeRetirementIndex] ?? params.currentAssets
  const horizonMedianAssets = results?.assetPercentiles.p50[horizonIndex] ?? params.currentAssets
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

export function buildScenarioParams(params: SimulationParams) {
  const previewRuns = Math.max(150, Math.min(500, Math.round(params.simulationRuns * 0.5)))
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
