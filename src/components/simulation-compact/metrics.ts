import type { SimulationParams, SimulationResults } from '@/types'
import { buildPlanInsightMetrics } from '@/lib/simulation/planInsights'

/**
 * The four KPI-strip numbers of design 1b, derived once per result set so the
 * strip, the compare view and the sparkline history all read the same values.
 */
export interface CompactKpis {
  successRate: number
  /**
   * Age the median run's wealth lasts to; `null` means it outlives the plan
   * horizon (rendered "90+").
   */
  lastsToMedian: number | null
  /** Age by which the worst decile of runs has depleted; `null` = never. */
  lastsToP10: number | null
  /** First-year portfolio withdrawal, annual (net of pensions already paying). */
  firstYearWithdrawal: number
  firstYearWithdrawalMonthly: number
  medianEndWealth: number
  p10EndWealth: number
  /** Bridge geometry for the bottom strip. */
  bridgeYears: number
  firstPensionAge: number
}

/**
 * First age at which at least `fraction` of runs have run out of money.
 * `depletionByAge` is cumulative, so this is a simple scan.
 */
function depletionAgeAt(results: SimulationResults, fraction: number): number | null {
  const byAge = results.depletionByAge
  if (!byAge) return null
  for (let i = 0; i < byAge.length; i++) {
    if (byAge[i] >= fraction) return results.ages[i]
  }
  return null
}

export function buildCompactKpis(
  params: SimulationParams,
  results: SimulationResults,
  options: { displayReal?: boolean } = {}
): CompactKpis {
  const insight = buildPlanInsightMetrics(params, results, options)
  const percentiles =
    (options.displayReal ? results.assetPercentilesReal : undefined) ?? results.assetPercentiles
  const horizon = results.ages.length - 1

  return {
    successRate: results.successRate,
    lastsToMedian: depletionAgeAt(results, 0.5),
    lastsToP10: depletionAgeAt(results, 0.1),
    firstYearWithdrawal: insight.firstYearPortfolioNeed,
    firstYearWithdrawalMonthly: insight.firstYearPortfolioNeed / 12,
    medianEndWealth: percentiles.p50[horizon] ?? 0,
    p10EndWealth: percentiles.p10[horizon] ?? 0,
    bridgeYears: insight.bridgeYears,
    firstPensionAge: insight.firstPensionAge,
  }
}
