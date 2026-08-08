import type { SimulationParams, SimulationResults, WithdrawalStrategy } from '@/types'
import { GK_CAPITAL_PRESERVATION_CUT, GK_PROSPERITY_RAISE } from '@/lib/simulation/engine'
import { buildCashFlowSeries } from '@/lib/simulation/cashFlows'

/**
 * The spending corridor: what a withdrawal strategy *promises*, next to what
 * the simulation actually produced.
 *
 * The percentile band is sampled — it is the distribution of outcomes over
 * hundreds of market paths. The floor and ceiling paths are not: they are
 * derived analytically from the rule itself, so they answer a different and
 * much more useful question. "P10 spending at 80" is where the unlucky tenth of
 * futures landed; "the floor at 80" is the least the rule can *ever* pay out,
 * whatever the market does. One is a forecast, the other is a guarantee, and
 * the planner draws them together on purpose.
 *
 * Everything in this module is in **monthly** euros, matching
 * `SimulationResults.spendingPercentiles`, and the planned paths are quoted in
 * **today's** euros. Deflating them for the nominal view is the caller's job
 * (`plannedPathsAtDisplayUnit`), because only the results know the realised
 * price level.
 */

/** The one caveat the corridor cannot express on its own. */
export type CorridorGuaranteeCaveat = 'portfolioMustLast' | 'none'

export interface PlannedSpendingPaths {
  /**
   * Lowest monthly spending the rule can produce at each age, in today's euros.
   * `null` where the strategy defines no floor.
   */
  floor: Array<number | null>
  /** Highest monthly spending the rule can produce, same units. `null` if unbounded. */
  ceiling: Array<number | null>
  hasFloor: boolean
  hasCeiling: boolean
  /**
   * A floor is only money in the bank while there is a portfolio to pay it
   * from — every rule-based floor carries this caveat. `percentOfPortfolio`
   * without a floor carries none because it makes no promise at all.
   */
  caveat: CorridorGuaranteeCaveat
}

/**
 * The plan's own lifetime spending budget in today's euros per month.
 *
 * Read from the cash-flow series rather than `customExpenses`, so it is exactly
 * the number the engine puts into `baselineAnnualExpenseThisYear` — a windowed
 * or one-off flow is intentionally not part of it, in either place.
 */
export function baselineMonthlySpending(params: SimulationParams): number {
  const flows = buildCashFlowSeries(
    params.cashFlows ?? [],
    params.currentAge,
    Math.max(params.currentAge, params.endAge)
  )
  return flows.baselineMonthly + flows.baselineAnnual / 12
}

/** Per-year real growth factors of a strategy's lower and upper bound. */
function corridorFactors(params: SimulationParams): {
  floor: number | null
  ceiling: number | null
} {
  switch (params.withdrawalStrategy) {
    case 'fixedReal':
      // The budget, held constant in purchasing power. Floor and ceiling are
      // the same line, which is exactly the point of the strategy.
      return { floor: 1, ceiling: 1 }
    case 'vanguardDynamic':
      // Each year's spending is clamped to ±(floor|ceiling) around last year's
      // inflation-adjusted level, so in real terms the bounds compound.
      return { floor: 1 + params.dsFloorRate, ceiling: 1 + params.dsCeilingRate }
    case 'guytonKlinger':
      // Asymmetric on purpose, and this is the one place the corridor is an
      // assumption rather than an identity.
      //
      // The prosperity rule adds 10% *on top of* the inflation raise, so in
      // real terms it is exactly ×1.10. The capital-preservation rule instead
      // cuts 10% off last year's **nominal** withdrawal and skips the raise, so
      // in real terms it is ×0.90/(1+π) — it depends on the inflation the path
      // actually realises. The corridor uses the plan's central inflation
      // assumption, which is exact when `inflationVolatility` is 0 and a very
      // close approximation otherwise. That is also the honest headline: a
      // Guyton-Klinger floor erodes, where a Vanguard floor does not.
      return {
        floor: (1 - GK_CAPITAL_PRESERVATION_CUT) / (1 + Math.max(-0.99, params.averageInflation)),
        ceiling: 1 + GK_PROSPERITY_RAISE,
      }
    case 'percentOfPortfolio':
      // Unbounded above (a bull market has no ceiling) and bounded below only
      // by the explicit real floor, handled by the caller.
      return { floor: null, ceiling: null }
    default:
      return { floor: null, ceiling: null }
  }
}

/**
 * The floor and ceiling the active strategy defines, per age, in today's euros
 * per month. Pure: no sampling, no results needed.
 *
 * Ages before retirement carry `null` — a rule that has not started yet
 * promises nothing, and drawing a flat line through the accumulation years
 * would suggest otherwise.
 */
export function buildPlannedSpendingPaths(
  params: SimulationParams,
  ages: readonly number[]
): PlannedSpendingPaths {
  const retirementAge = Math.max(params.currentAge, params.retirementAge)
  const baseline = baselineMonthlySpending(params)
  const { floor: floorFactor, ceiling: ceilingFactor } = corridorFactors(params)
  const explicitFloor =
    params.withdrawalStrategy === 'percentOfPortfolio'
      ? Math.max(0, params.spendingFloorReal) / 12
      : 0

  const floor: Array<number | null> = []
  const ceiling: Array<number | null> = []

  ages.forEach((age) => {
    if (age < retirementAge) {
      floor.push(null)
      ceiling.push(null)
      return
    }

    // Year 0 of retirement spends the budget under every memory-carrying rule,
    // so the corridor opens there and widens by one factor per year after it.
    const yearsIn = age - retirementAge

    if (explicitFloor > 0) floor.push(explicitFloor)
    else if (floorFactor === null) floor.push(null)
    else floor.push(baseline * Math.pow(floorFactor, yearsIn))

    if (ceilingFactor === null) ceiling.push(null)
    else ceiling.push(baseline * Math.pow(ceilingFactor, yearsIn))
  })

  const hasFloor = floor.some((value) => value !== null && value > 0)
  const hasCeiling = ceiling.some((value) => value !== null && value > 0)

  return {
    floor,
    ceiling,
    hasFloor,
    hasCeiling,
    caveat: hasFloor ? 'portfolioMustLast' : 'none',
  }
}

/**
 * Re-prices the planned paths into the unit the charts are drawing in.
 *
 * In real mode they are already right. In nominal mode a floor quoted in
 * today's euros has to grow with the median realised price level, otherwise the
 * "guarantee" would sink through a nominal band it is supposed to sit under.
 */
export function plannedPathsAtDisplayUnit(
  paths: PlannedSpendingPaths,
  inflationIndexP50: readonly number[] | undefined,
  displayReal: boolean
): PlannedSpendingPaths {
  if (displayReal || !inflationIndexP50) return paths

  const scale = (values: Array<number | null>) =>
    values.map((value, index) => (value === null ? null : value * (inflationIndexP50[index] ?? 1)))

  return { ...paths, floor: scale(paths.floor), ceiling: scale(paths.ceiling) }
}

export interface SpendingCorridorPoint {
  age: number
  spending_p10: number
  spending_p50: number
  spending_p90: number
  spending_band_lower: number
  spending_band_height: number
  floor: number | null
  ceiling: number | null
}

export interface StrategyOutcomeMetrics {
  successRate: number
  /**
   * First retirement year's median spending, monthly, in today's euros. The
   * number a user recognises as "what I get to spend".
   */
  firstYearMonthlySpending: number
  /** Sum of the median real spending path over the retirement years, annualised. */
  medianLifetimeSpending: number
  /**
   * The rule's promised minimum at `referenceAge`, monthly, today's euros.
   * `null` when the strategy promises nothing.
   */
  guaranteedFloor: number | null
  /**
   * P90 ÷ P10 of real spending at `referenceAge`. 1.0 = the strategy delivers
   * the same income in every future; 2.0 = the lucky decile spends twice what
   * the unlucky one does. The stability half of the stability↔success trade.
   */
  volatilityRatio: number | null
  /** The age both `guaranteedFloor` and `volatilityRatio` are measured at. */
  referenceAge: number
}

/**
 * A single, stable age to compare strategies at.
 *
 * 80 is far enough into retirement for the rules to have visibly diverged and
 * early enough to be inside almost every plan's horizon; plans that end sooner
 * fall back to their last year.
 */
export function corridorReferenceAge(params: SimulationParams): number {
  const retirement = Math.max(params.currentAge, params.retirementAge)
  return Math.min(Math.max(retirement, 80), Math.max(retirement, params.endAge))
}

const realSpendingAt = (results: SimulationResults) =>
  results.spendingPercentilesReal ?? results.spendingPercentiles

/**
 * Everything the planner reports about one strategy, derived from one run.
 *
 * Deliberately reads the *real* spending series: comparing a nominal euro at 60
 * with a nominal euro at 90 is how a plan looks like it is spending more every
 * year while its purchasing power falls.
 */
export function summarizeStrategyOutcome(
  params: SimulationParams,
  results: SimulationResults
): StrategyOutcomeMetrics {
  const spending = realSpendingAt(results)
  const referenceAge = corridorReferenceAge(params)
  const retirementAge = Math.max(params.currentAge, params.retirementAge)

  const referenceIndex = results.ages.findIndex((age) => age >= referenceAge)
  const firstRetirementIndex = results.ages.findIndex((age) => age >= retirementAge)

  const firstYearMonthlySpending =
    firstRetirementIndex === -1 ? 0 : (spending.p50[firstRetirementIndex] ?? 0)

  const medianLifetimeSpending =
    firstRetirementIndex === -1
      ? 0
      : spending.p50.slice(firstRetirementIndex).reduce((total, monthly) => total + monthly * 12, 0)

  const paths = buildPlannedSpendingPaths(params, results.ages)
  const guaranteedFloor = referenceIndex === -1 ? null : (paths.floor[referenceIndex] ?? null)

  const p10 = referenceIndex === -1 ? 0 : (spending.p10[referenceIndex] ?? 0)
  const p90 = referenceIndex === -1 ? 0 : (spending.p90[referenceIndex] ?? 0)
  const volatilityRatio = p10 > 0 ? p90 / p10 : null

  return {
    successRate: results.successRate,
    firstYearMonthlySpending,
    medianLifetimeSpending,
    guaranteedFloor,
    volatilityRatio,
    referenceAge,
  }
}

/**
 * The corridor chart's data: the retirement slice of the spending band with the
 * planned floor/ceiling laid over it, in whichever unit the dashboard shows.
 */
export function buildSpendingCorridor(
  params: SimulationParams,
  results: SimulationResults,
  displayReal: boolean
): { points: SpendingCorridorPoint[]; paths: PlannedSpendingPaths } {
  const canShowReal = Boolean(results.spendingPercentilesReal)
  const real = displayReal && canShowReal
  const spending = (real && results.spendingPercentilesReal) || results.spendingPercentiles

  const paths = plannedPathsAtDisplayUnit(
    buildPlannedSpendingPaths(params, results.ages),
    results.inflationIndexP50,
    real
  )

  const retirementAge = Math.max(params.currentAge, params.retirementAge)
  const points: SpendingCorridorPoint[] = []

  results.ages.forEach((age, index) => {
    if (age < retirementAge) return
    const p10 = spending.p10[index] ?? 0
    const p90 = spending.p90[index] ?? 0
    points.push({
      age,
      spending_p10: p10,
      spending_p50: spending.p50[index] ?? 0,
      spending_p90: p90,
      spending_band_lower: p10,
      spending_band_height: Math.max(0, p90 - p10),
      floor: paths.floor[index] ?? null,
      ceiling: paths.ceiling[index] ?? null,
    })
  })

  return { points, paths }
}

/** The four strategies, in picker order. */
export const PLANNER_STRATEGIES: readonly WithdrawalStrategy[] = [
  'fixedReal',
  'vanguardDynamic',
  'guytonKlinger',
  'percentOfPortfolio',
]
