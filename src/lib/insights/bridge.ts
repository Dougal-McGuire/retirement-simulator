import type { SimulationParams, SimulationResults } from '@/types'
import { defaultPdfConfig } from '@/lib/pdf-generator/utils/config'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { firstPensionAge } from '@/lib/simulation/cashFlows'

/**
 * Which euro the bridge need is stated in — the same two units as the
 * dashboard's Nominal / Heutige € switch.
 */
export type BridgeUnit = 'nominal' | 'real'

export type BridgeAnalysis = {
  startAge: number
  endAge: number
  yearsInBridge: number
  /** The age the first pension starts — what the bridge has to reach. */
  pensionAge: number
  /** The unit `cashNeedEUR` is stated in. */
  unit: BridgeUnit
  /**
   * Cash need across the bridge years, unrounded, in `unit`:
   * - `'real'`: today's purchasing power. The budget is inflation-linked, so
   *   every bridge year costs today's budget: budget × years.
   * - `'nominal'`: euros of each bridge year. Each year costs the budget times
   *   the expected price level of that year relative to today.
   */
  cashNeedEUR: number
  cashBucketYears: number
  cashBucketSharePct: number
  portfolioSharePct: number
}

export type BridgeAnalysisOptions = {
  unit: BridgeUnit
  /**
   * The run the figures belong to. In nominal mode its median realised price
   * level (`inflationIndexP50`) prices each bridge year, so the need agrees
   * with the nominal charts. Without a usable index the plan's average
   * inflation is compounded from today instead. Ignored in real mode.
   */
  results?: Pick<SimulationResults, 'ages' | 'inflationIndexP50'>
}

/**
 * Price level of each bridge age relative to today (the plan's first year).
 * Taken entirely from the run's median index when it covers every bridge age,
 * otherwise entirely from the compounded average inflation — never mixed.
 */
function priceLevels(
  params: SimulationParams,
  bridgeAges: readonly number[],
  results: BridgeAnalysisOptions['results']
): number[] {
  const index = results?.inflationIndexP50
  if (results && index && index.length === results.ages.length) {
    const levels = bridgeAges.map((age) => index[results.ages.indexOf(age)])
    if (levels.every((level) => Number.isFinite(level) && level > 0)) return levels
  }
  return bridgeAges.map((age) =>
    Math.pow(1 + params.averageInflation, Math.max(0, age - params.currentAge))
  )
}

export function computeBridgeAnalysis(
  params: SimulationParams,
  options: BridgeAnalysisOptions
): BridgeAnalysis {
  const { unit } = options
  const totalYearlyExpenses = calculateCombinedExpenses(params.customExpenses).combinedAnnual
  const startAge = Math.max(params.retirementAge, params.currentAge)
  // The bridge ends when the first pension pays, which may be years before
  // the statutory age (a Versorgungswerk at 63, say).
  const pensionAge = firstPensionAge(params.cashFlows ?? [], params.legalRetirementAge)
  const endAge = Math.max(pensionAge - 1, startAge - 1)
  const yearsInBridge = Math.max(0, endAge - startAge + 1)

  const bridgeAges = Array.from({ length: yearsInBridge }, (_, i) => startAge + i)
  const levels =
    unit === 'nominal' ? priceLevels(params, bridgeAges, options.results) : bridgeAges.map(() => 1)
  const yearNeeds = levels.map((level) => Math.max(0, totalYearlyExpenses * level))
  const cashNeedEUR = yearNeeds.reduce((sum, need) => sum + need, 0)

  const cashBucketYears = defaultPdfConfig.bridge_cash_bucket_years as number
  let cashBucketSharePct = 0
  if (yearsInBridge > 0 && cashNeedEUR > 0) {
    const bucketSum = yearNeeds
      .slice(0, Math.min(cashBucketYears, yearsInBridge))
      .reduce((sum, need) => sum + need, 0)
    cashBucketSharePct = Math.round((bucketSum / cashNeedEUR) * 100)
  }
  const portfolioSharePct =
    yearsInBridge > 0 && cashNeedEUR > 0 ? Math.max(0, 100 - cashBucketSharePct) : 0

  return {
    startAge,
    endAge,
    yearsInBridge,
    pensionAge,
    unit,
    cashNeedEUR,
    cashBucketYears,
    cashBucketSharePct,
    portfolioSharePct,
  }
}
