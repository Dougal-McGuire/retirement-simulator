import {
  AnnualCashFlow,
  DEFAULT_CAPITAL_GAINS_TAX,
  SimulationParams,
  SimulationResults,
  PercentileData,
  isWithdrawalStrategy,
  isMarketModel,
  isHouseholdType,
} from '@/types'
import {
  HISTORICAL_MARKET_YEARS,
  type HistoricalMarketYear,
} from '@/lib/simulation/data/historicalMarket'
import { DEFAULT_PATH_SEED, effectiveRunCount } from '@/lib/simulation/context'
import {
  type CashFlowSeries,
  type PensionContext,
  buildCashFlowSeries,
  cashFlowSignature,
  netPensionAnnualAtAge,
  projectCustomExpenses,
  projectOneTimeIncomes,
  reconcileCashFlows,
  statutoryPensionMonthly,
} from '@/lib/simulation/cashFlows'

/**
 * Uniform [0,1) source. Defaults to `Math.random` so callers that do not care
 * about reproducibility keep the previous behaviour.
 */
export type RandomSource = () => number

/**
 * Small, fast, well-distributed PRNG (mulberry32). Used to make a simulation
 * run deterministic for a given set of parameters: the same inputs always
 * produce the same headline numbers instead of jittering by ±1-2pp per mount.
 */
export function mulberry32(seed: number): RandomSource {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * FNV-1a hash of a string, returned as an unsigned 32-bit integer.
 */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Base seed of the market-path scenario set.
 *
 * The engine deliberately does NOT derive its seed from the parameters. Every
 * run index owns a fixed stream of standard-normal draws, so:
 *
 * - identical parameters always produce bit-identical results,
 * - run `k` sees the same standard normals no matter how many runs are
 *   requested, which makes a 1 200-run comparison a strict prefix of a
 *   5 000-run dashboard sample instead of an unrelated re-roll,
 * - changing any parameter (retirement age, savings, even ROI/volatility)
 *   re-uses the same underlying scenarios and only changes how they are
 *   transformed. Nudging a slider therefore moves the success rate smoothly
 *   instead of re-rolling the whole Monte Carlo and jittering by ±1pp.
 *
 * This is the classic "common random numbers" variance-reduction setup: it is
 * what makes side-by-side plan comparisons and stress levers meaningful.
 */
export { DEFAULT_PATH_SEED } from '@/lib/simulation/context'

/**
 * splitmix32-style avalanche. Turns (baseSeed, runIndex) into a well-separated
 * 32-bit seed so neighbouring run indices do not produce correlated streams.
 */
export function mixSeed(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0
  return (h ^ (h >>> 15)) >>> 0
}

/**
 * Stable identity hash of the simulation inputs. Used to tell parameter sets
 * apart (caching, staleness checks, tests); it is intentionally *not* the RNG
 * seed — see {@link DEFAULT_PATH_SEED}.
 */
export function hashSimulationParams(params: SimulationParams): number {
  const shape = {
    currentAge: params.currentAge,
    retirementAge: params.retirementAge,
    legalRetirementAge: params.legalRetirementAge,
    endAge: params.endAge,
    currentAssets: params.currentAssets,
    annualSavings: params.annualSavings,
    annualSavingsGrowthRate: params.annualSavingsGrowthRate,
    monthlyPension: params.monthlyPension,
    averageROI: params.averageROI,
    roiVolatility: params.roiVolatility,
    averageInflation: params.averageInflation,
    inflationVolatility: params.inflationVolatility,
    capitalGainsTax: params.capitalGainsTax,
    taxAllowanceAnnual: params.taxAllowanceAnnual,
    householdType: params.householdType,
    equityFundExemption: params.equityFundExemption,
    pensionTaxablePortion: params.pensionTaxablePortion,
    pensionTaxRate: params.pensionTaxRate,
    legacyTargetReal: params.legacyTargetReal,
    marketModel: params.marketModel,
    glidePathEnabled: params.glidePathEnabled,
    equityAllocationStart: params.equityAllocationStart,
    equityAllocationEnd: params.equityAllocationEnd,
    bondReturn: params.bondReturn,
    bondVolatility: params.bondVolatility,
    withdrawalStrategy: params.withdrawalStrategy,
    dsWithdrawalRate: params.dsWithdrawalRate,
    dsCeilingRate: params.dsCeilingRate,
    dsFloorRate: params.dsFloorRate,
    spendingFloorReal: params.spendingFloorReal,
    simulationRuns: params.simulationRuns,
    customExpenses: (params.customExpenses ?? []).map((expense) => [
      expense.interval,
      expense.amount,
    ]),
    oneTimeIncomes: (params.oneTimeIncomes ?? []).map((income) => [income.age, income.amount]),
    // Sorted, so reordering the list in the editor is not a model change.
    cashFlows: cashFlowSignature(params.cashFlows ?? []),
  }
  return hashString(JSON.stringify(shape))
}

/**
 * Box-Muller transform for generating normally distributed random numbers
 * @param mean - The mean of the normal distribution
 * @param stdDev - The standard deviation of the normal distribution
 * @param random - Uniform [0,1) source (defaults to Math.random)
 * @returns A normally distributed random number
 */
export function boxMullerTransform(
  mean: number,
  stdDev: number,
  random: RandomSource = Math.random
): number {
  return mean + stdDev * sampleStandardNormal(random)
}

/**
 * Sample a standard normal random variate using Box-Muller.
 */
export function sampleStandardNormal(random: RandomSource = Math.random): number {
  let u = 0,
    v = 0
  while (u === 0) u = random() // Converting [0,1) to (0,1)
  while (v === 0) v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Compute (mu, sigma) of a lognormal factor X = 1 + r given arithmetic mean m = E[r] and stdev s = SD[r].
 * For lognormal Y ~ logN(mu, sigma^2): E[Y] = exp(mu + sigma^2/2), Var[Y] = (exp(sigma^2)-1)exp(2mu+sigma^2).
 * Here Y = 1 + r with E[Y] = 1 + m and SD[Y] = s.
 */
export function lognormalParamsFromArithmetic(
  mean: number,
  stdev: number
): { mu: number; sigma: number } {
  const A = 1 + mean
  const variance = stdev * stdev
  const sigma2 = Math.log(1 + variance / (A * A))
  const sigma = Math.sqrt(Math.max(0, sigma2))
  const mu = Math.log(A) - 0.5 * sigma2
  return { mu, sigma }
}

/**
 * Sample a multiplicative lognormal factor given arithmetic mean and stdev of r where X = 1 + r.
 * Returns X such that r = X - 1.
 */
export function sampleLognormalFactorFromArithmetic(
  mean: number,
  stdev: number,
  random: RandomSource = Math.random
): number {
  const params = lognormalParamsFromArithmetic(mean, stdev)
  return sampleLognormalFactor(params, random)
}

export type LognormalParams = ReturnType<typeof lognormalParamsFromArithmetic>

/**
 * Sampling parameters per year offset (index 0 = the plan's first year).
 * Entries are all identical while the plan uses one flat set of market
 * assumptions; the per-age shape is what the allocation glide path varies (and
 * what any future term structure — "the first decade is bad" — would use).
 */
export type SimulationDistributions = {
  roi: LognormalParams[]
  inflation: LognormalParams[]
}

/**
 * The seam between "how a year's market outcome is produced" and "what the
 * portfolio does with it". Monte Carlo sampling is one implementation; a
 * historical-sequence or bootstrap mode can drop in here without touching the
 * cashflow logic, because it receives the year offset and run index.
 */
export type MarketSampler = {
  nextGrowthFactor: (yearIndex: number, run: number, random: RandomSource) => number
  nextInflationFactor: (yearIndex: number, run: number, random: RandomSource) => number
}

/**
 * Default sampler: independent lognormal draws per year from the per-age
 * distribution table. Consumes exactly one standard normal per call, growth
 * before inflation, which is the RNG contract the golden master pins down.
 */
export function createMonteCarloSampler(distributions: SimulationDistributions): MarketSampler {
  const at = (table: LognormalParams[], yearIndex: number) =>
    table[Math.min(yearIndex, table.length - 1)]

  return {
    nextGrowthFactor: (yearIndex, _run, random) =>
      sampleLognormalFactor(at(distributions.roi, yearIndex), random),
    nextInflationFactor: (yearIndex, _run, random) =>
      sampleLognormalFactor(at(distributions.inflation, yearIndex), random),
  }
}

function sampleLognormalFactor(
  { mu, sigma }: LognormalParams,
  random: RandomSource = Math.random
): number {
  const z = sampleStandardNormal(random)
  return Math.exp(mu + sigma * z)
}

/**
 * Equity share per year offset (index 0 = the plan's first year).
 *
 * Linear from `equityAllocationStart` to `equityAllocationEnd` across the
 * accumulation years, then held flat at the end allocation for the whole of
 * retirement — the standard "target date" shape. With the glide path off the
 * portfolio is 100% equity, which is what the flat single-asset model has
 * always been.
 */
export function buildEquityGlidePath(params: SimulationParams, yearCount: number): number[] {
  const weights = new Array<number>(Math.max(0, yearCount))
  if (!params.glidePathEnabled) return weights.fill(1)

  const start = params.equityAllocationStart
  const end = params.equityAllocationEnd
  const yearsToRetirement = Math.max(0, params.retirementAge - params.currentAge)

  for (let i = 0; i < weights.length; i++) {
    if (yearsToRetirement <= 0 || i >= yearsToRetirement) {
      weights[i] = end
      continue
    }
    weights[i] = start + (end - start) * (i / yearsToRetirement)
  }

  return weights
}

/**
 * Arithmetic mean and stdev of a two-asset portfolio held at equity weight `w`.
 *
 * Deliberately assumes ZERO correlation between the equity and bond sleeves:
 * `sd = sqrt(w²σe² + (1−w)²σb²)`. The realised stock/bond correlation swings
 * between about −0.5 and +0.5 depending on whether inflation or growth is
 * driving markets, so no single constant is defensible; zero sits in the middle
 * and keeps the parameter count honest. The consequence is that a blended
 * portfolio looks slightly *less* risky here than a positively correlated one
 * would — the historical market model exists partly to sanity-check that.
 */
export function blendPortfolioMoments(
  equityWeight: number,
  equityMean: number,
  equityStdev: number,
  bondMean: number,
  bondStdev: number
): { mean: number; stdev: number } {
  const w = clamp(equityWeight, 0, 1)
  const bondWeight = 1 - w
  const mean = w * equityMean + bondWeight * bondMean
  const variance =
    w * w * equityStdev * equityStdev + bondWeight * bondWeight * bondStdev * bondStdev
  return { mean, stdev: Math.sqrt(Math.max(0, variance)) }
}

/**
 * Per-year sampling parameters for a plan.
 *
 * With the glide path off every entry is the same object, which is exactly what
 * the flat model produced before the feature existed (bit-identical results).
 * With it on, each year offset gets the blend implied by that year's equity
 * share.
 */
export function buildSimulationDistributions(
  params: SimulationParams,
  yearCount: number
): SimulationDistributions {
  const inflationParams = lognormalParamsFromArithmetic(
    params.averageInflation,
    params.inflationVolatility
  )
  const inflation = new Array<LognormalParams>(yearCount).fill(inflationParams)

  if (!params.glidePathEnabled) {
    const roiParams = lognormalParamsFromArithmetic(params.averageROI, params.roiVolatility)
    return { roi: new Array<LognormalParams>(yearCount).fill(roiParams), inflation }
  }

  const weights = buildEquityGlidePath(params, yearCount)
  const roi = weights.map((weight) => {
    const { mean, stdev } = blendPortfolioMoments(
      weight,
      params.averageROI,
      params.roiVolatility,
      params.bondReturn,
      params.bondVolatility
    )
    return lognormalParamsFromArithmetic(mean, stdev)
  })

  return { roi, inflation }
}

/**
 * Historical sampler: replays a real return series instead of drawing from a
 * distribution. Run `k` starts in the k-th year of the series and walks forward,
 * wrapping around at the end so every start year yields a full-horizon path
 * (the alternative — dropping start years too close to the end — throws away
 * the most interesting sequences, which all sit in the last 30 years).
 *
 * Consumes no randomness at all: the result is a deterministic function of the
 * parameters, and `successRate` is literally the share of start years the plan
 * would have survived.
 *
 * The glide path still applies, blending each year's ACTUAL equity and bond
 * returns at that year's allocation. With the glide path off the weights are
 * all 1, i.e. an all-equity portfolio.
 */
export function createHistoricalSampler(
  equityWeights: number[],
  series: readonly HistoricalMarketYear[] = HISTORICAL_MARKET_YEARS
): MarketSampler {
  const length = series.length
  const weightAt = (yearIndex: number) =>
    equityWeights.length === 0 ? 1 : equityWeights[Math.min(yearIndex, equityWeights.length - 1)]
  const rowAt = (yearIndex: number, run: number) => series[(run + yearIndex) % length]

  return {
    nextGrowthFactor: (yearIndex, run) => {
      const row = rowAt(yearIndex, run)
      const w = weightAt(yearIndex)
      const blended = w * row.equityReturn + (1 - w) * row.bondReturn
      return Math.max(0, 1 + blended)
    },
    nextInflationFactor: (yearIndex, run) => Math.max(0, 1 + rowAt(yearIndex, run).inflation),
  }
}

/**
 * Calculate percentiles from a sorted array
 * @param arr - Array of numbers
 * @param percentile - Percentile to calculate (0-100; values outside this range are clamped)
 * @returns The value at the given percentile
 */
export function calculatePercentile(arr: number[], percentile: number): number {
  const sorted = arr.slice().sort((a, b) => a - b)
  return calculatePercentileFromSortedArray(sorted, percentile)
}

function calculatePercentileFromSortedArray(sorted: number[], percentile: number): number {
  if (sorted.length === 0) {
    return 0
  }

  const boundedPercentile = normalizePercentile(percentile)
  const index = (boundedPercentile / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)

  if (lower === upper) {
    return sorted[lower]
  } else {
    return sorted[lower] * (upper - index) + sorted[upper] * (index - lower)
  }
}

function normalizePercentile(percentile: number): number {
  if (percentile === Number.POSITIVE_INFINITY) {
    return 100
  }

  if (!Number.isFinite(percentile)) {
    return 0
  }

  return Math.min(100, Math.max(0, percentile))
}

/**
 * Calculate percentiles for each age across all simulation runs
 * @param data - 2D array where data[run][age] contains the value for that run and age
 * @param percentiles - Array of percentiles to calculate
 * @returns Object containing arrays of percentile values for each age
 */
export function calculatePercentiles(data: number[][]): PercentileData {
  const ageCount = data[0]?.length || 0
  const sortedValuesAtAge = new Array<number>(data.length)
  const result: PercentileData = {
    p10: [],
    p20: [],
    p50: [],
    p80: [],
    p90: [],
  }

  for (let ageIndex = 0; ageIndex < ageCount; ageIndex++) {
    for (let runIndex = 0; runIndex < data.length; runIndex++) {
      sortedValuesAtAge[runIndex] = data[runIndex][ageIndex]
    }
    sortedValuesAtAge.sort((a, b) => a - b)

    result.p10.push(calculatePercentileFromSortedArray(sortedValuesAtAge, 10))
    result.p20.push(calculatePercentileFromSortedArray(sortedValuesAtAge, 20))
    result.p50.push(calculatePercentileFromSortedArray(sortedValuesAtAge, 50))
    result.p80.push(calculatePercentileFromSortedArray(sortedValuesAtAge, 80))
    result.p90.push(calculatePercentileFromSortedArray(sortedValuesAtAge, 90))
  }

  return result
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const sanitizeFiniteNumber = (value: unknown, fallback: number): number => {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

const normalizeWithdrawalStrategy = (value: unknown): SimulationParams['withdrawalStrategy'] =>
  isWithdrawalStrategy(value) ? value : 'vanguardDynamic'

const normalizeMarketModel = (value: unknown): SimulationParams['marketModel'] =>
  isMarketModel(value) ? value : 'monteCarlo'

const normalizeHouseholdType = (value: unknown): SimulationParams['householdType'] =>
  isHouseholdType(value) ? value : 'single'

/**
 * Guyton-Klinger guardrails, as constants rather than parameters.
 *
 * The published rules use ±20% bands around the initial withdrawal rate and
 * ±10% spending adjustments. Exposing four more sliders would let a user build
 * a "Guyton-Klinger" that is nothing of the sort, so the bands stay fixed and
 * only the initial rate (`dsWithdrawalRate`) is the user's to choose.
 */
export const GK_UPPER_GUARDRAIL = 1.2
export const GK_LOWER_GUARDRAIL = 0.8
export const GK_CAPITAL_PRESERVATION_CUT = 0.1
export const GK_PROSPERITY_RAISE = 0.1

/**
 * A year counts as unfunded once its shortfall exceeds this share of the
 * spending requested for it. See `docs/specs/2026-11-09-withdrawal-rules-with-income.md`:
 * 1 % is small enough that no household would call the year a failure
 * (€50 a month on a €5,000 budget) and large enough to absorb rounding between
 * an indexed pension and an indexed budget that are meant to be equal.
 */
export const UNFUNDED_SPENDING_TOLERANCE = 0.01

/**
 * Vanguard dynamic spending. The rule governs what the *portfolio* pays:
 * what the household can afford this year is its other income plus
 * `withdrawalRate` of the portfolio, and the two guardrails limit how far
 * spending may move from last year's inflation-adjusted level to get there.
 *
 *   affordable = nonPortfolioIncome + withdrawalRate × portfolio
 *   spending   = clamp(affordable, prev × π × (1 + floorRate), prev × π × (1 + ceilingRate))
 */
export function calculateVanguardDynamicAnnualSpending({
  priorYearPortfolioValue,
  previousAnnualSpending,
  inflationFactor,
  withdrawalRate,
  ceilingRate,
  floorRate,
  nonPortfolioIncome = 0,
}: {
  priorYearPortfolioValue: number
  previousAnnualSpending: number
  inflationFactor: number
  withdrawalRate: number
  ceilingRate: number
  floorRate: number
  /** Net pensions and recurring income of the year (nominal). Default 0. */
  nonPortfolioIncome?: number
}): number {
  const targetAnnualSpending =
    Math.max(0, priorYearPortfolioValue * withdrawalRate) + Math.max(0, nonPortfolioIncome)
  const inflationAdjustedPreviousSpending = Math.max(0, previousAnnualSpending * inflationFactor)
  const lowerBound = inflationAdjustedPreviousSpending * (1 + floorRate)
  const upperBound = inflationAdjustedPreviousSpending * (1 + ceilingRate)

  return clamp(
    targetAnnualSpending,
    Math.min(lowerBound, upperBound),
    Math.max(lowerBound, upperBound)
  )
}

/**
 * Guyton-Klinger: inflation-linked spending with two guardrails.
 *
 * Each year the previous spending is carried forward with inflation, and the
 * resulting *portfolio withdrawal rate* — the part of that spending the
 * portfolio has to pay, (tentative spending − other income) ÷ portfolio — is
 * compared against the plan's configured rate:
 *
 * - **Capital preservation.** Rate drifted more than 20% above the configured
 *   one → the inflation raise is skipped *and* spending is cut by 10%.
 * - **Prosperity.** Rate sits more than 20% below the configured one →
 *   spending gets the inflation raise plus 10%.
 * - Otherwise spending simply keeps its purchasing power.
 *
 * The reference is the *configured* rate, not a rate measured in the first
 * retirement year. A measured rate goes stale the day a pension starts: the
 * draw of a bridge year (no pension yet) says nothing about the years after.
 * Against the configured rate a pension start can only ever look like
 * prosperity — spending then climbs by 10% a year until the portfolio pays at
 * least 0.8 × rate again — and never like a reason to cut.
 *
 * Deliberate simplifications versus the published rule set, all in the
 * direction of "fewer knobs, same shape":
 *
 * 1. The *first* retirement year spends the plan's own budget rather than
 *    `initialWithdrawalRate × portfolio`. The plan already states what the
 *    household intends to spend; the rate is used purely as the reference the
 *    guardrails are measured against. This is also what makes the planned
 *    corridor analytic — see `spendingCorridor.ts`.
 * 2. No terminal-years suspension: the original rules stop applying capital
 *    preservation in the last 15 years of the plan. Keeping them on is the
 *    conservative choice and avoids a horizon-dependent cliff.
 * 3. The modified-withdrawal rule (skip the raise after a losing year) is
 *    folded into the capital-preservation branch instead of being a separate
 *    test on the realised return.
 * 4. Guardrails are evaluated against the *prior year-end* portfolio, the same
 *    value `vanguardDynamic` uses, so the two rules see identical information.
 */
export function calculateGuytonKlingerAnnualSpending({
  priorYearPortfolioValue,
  previousAnnualSpending,
  inflationFactor,
  initialWithdrawalRate,
  nonPortfolioIncome = 0,
}: {
  priorYearPortfolioValue: number
  previousAnnualSpending: number
  inflationFactor: number
  initialWithdrawalRate: number
  /** Net pensions and recurring income of the year (nominal). Default 0. */
  nonPortfolioIncome?: number
}): number {
  const previous = Math.max(0, previousAnnualSpending)
  const inflationAdjusted = previous * inflationFactor

  // Without a portfolio there is no rate to compare against; the withdrawal
  // just keeps its purchasing power and the funding logic handles the rest.
  if (priorYearPortfolioValue <= 0 || initialWithdrawalRate <= 0) return inflationAdjusted

  // The rate the guardrails watch is the portfolio's share of the spending:
  // a pension that pays most of the budget leaves the portfolio a small draw,
  // however large the budget is.
  const currentRate =
    (inflationAdjusted - Math.max(0, nonPortfolioIncome)) / priorYearPortfolioValue

  if (currentRate > initialWithdrawalRate * GK_UPPER_GUARDRAIL) {
    // Capital preservation: no inflation raise this year, and 10% off.
    return previous * (1 - GK_CAPITAL_PRESERVATION_CUT)
  }

  if (currentRate < initialWithdrawalRate * GK_LOWER_GUARDRAIL) {
    // Prosperity: the portfolio has run away from the plan, spend more of it.
    return inflationAdjusted * (1 + GK_PROSPERITY_RAISE)
  }

  return inflationAdjusted
}

/**
 * Pure percentage-of-portfolio: the portfolio pays `withdrawalRate` of its
 * prior year-end value, every year, with no memory of last year's spending.
 * The household spends that on top of its other income:
 *
 *   spending = nonPortfolioIncome + withdrawalRate × portfolio
 *
 * The rule on its own only ever takes a fraction of what is left, so its risk
 * shows up as *spending* risk: a 40% crash cuts the portfolio's part of the
 * household's income by 40% the following year. It can still run dry in two
 * ways, both outside the percentage itself: the optional `floorAnnualReal`
 * (today's euros, re-priced with this path's own `inflationIndex`), and the
 * plan's scheduled expenses, which the engine pays on top of the rule.
 */
export function calculatePercentOfPortfolioAnnualSpending({
  priorYearPortfolioValue,
  withdrawalRate,
  floorAnnualReal,
  inflationIndex,
  nonPortfolioIncome = 0,
}: {
  priorYearPortfolioValue: number
  withdrawalRate: number
  /** Floor in today's euros per year. 0 = no floor. */
  floorAnnualReal: number
  /** Cumulative price level of this path, relative to the plan's first year. */
  inflationIndex: number
  /** Net pensions and recurring income of the year (nominal). Default 0. */
  nonPortfolioIncome?: number
}): number {
  const target =
    Math.max(0, priorYearPortfolioValue) * Math.max(0, withdrawalRate) +
    Math.max(0, nonPortfolioIncome)
  const floor = Math.max(0, floorAnnualReal) * Math.max(0, inflationIndex)
  return Math.max(target, floor)
}

/**
 * The withdrawal-strategy switch: one year's *baseline* spending decision.
 *
 * Returns the household's ordinary living costs for this year in nominal euros.
 * Scheduled cash flows are added by the caller and never pass through here.
 *
 * Every rule except `fixedReal` governs the part of that spending the
 * *portfolio* pays: the year's net non-portfolio income (`nonPortfolioIncome`,
 * pensions and recurring income after their taxes) is what the household has
 * anyway, and the rule decides how much the portfolio adds. The same income is
 * also a floor: no rule sets spending below `min(budget, income)` — cutting a
 * household below both its own budget and the money it receives regardless
 * would protect nothing. See `docs/specs/2026-11-09-withdrawal-rules-with-income.md`.
 *
 * Consumes no randomness, which is what lets a new strategy be added without
 * disturbing the common-random-numbers scenario set, and with no
 * non-portfolio income every rule evaluates exactly the arithmetic it always
 * did.
 */
export function applyWithdrawalStrategy({
  strategy,
  baselineAnnualSpending,
  priorYearPortfolioValue,
  previousAnnualSpending,
  inflationFactor,
  inflationIndex,
  nonPortfolioIncome = 0,
  params,
}: {
  strategy: SimulationParams['withdrawalStrategy']
  /** The plan's own inflation-linked budget for this year. */
  baselineAnnualSpending: number
  priorYearPortfolioValue: number
  /** Last year's rule output, or null in the first retirement year. */
  previousAnnualSpending: number | null
  /** Price change between last year and this one. */
  inflationFactor: number
  /** Cumulative price level since the plan's first year. */
  inflationIndex: number
  /**
   * This year's net income that does not come out of the portfolio: pensions
   * and recurring income after their taxes, nominal. One-off income is not
   * part of it — the engine pays it into the portfolio. Default 0.
   */
  nonPortfolioIncome?: number
  params: SimulationParams
}): number {
  const income = Math.max(0, nonPortfolioIncome)
  // What the household receives anyway is never withheld from a budget it has.
  const incomeFloor = Math.min(Math.max(0, baselineAnnualSpending), income)
  switch (strategy) {
    case 'vanguardDynamic':
      return previousAnnualSpending === null
        ? baselineAnnualSpending
        : Math.max(
            incomeFloor,
            calculateVanguardDynamicAnnualSpending({
              priorYearPortfolioValue,
              previousAnnualSpending,
              inflationFactor,
              withdrawalRate: params.dsWithdrawalRate,
              ceilingRate: params.dsCeilingRate,
              floorRate: params.dsFloorRate,
              nonPortfolioIncome: income,
            })
          )
    case 'guytonKlinger':
      return previousAnnualSpending === null
        ? baselineAnnualSpending
        : Math.max(
            incomeFloor,
            calculateGuytonKlingerAnnualSpending({
              priorYearPortfolioValue,
              previousAnnualSpending,
              inflationFactor,
              initialWithdrawalRate: params.dsWithdrawalRate,
              nonPortfolioIncome: income,
            })
          )
    case 'percentOfPortfolio':
      // income + rate × portfolio is never below the income, so the floor
      // holds by construction.
      return calculatePercentOfPortfolioAnnualSpending({
        priorYearPortfolioValue,
        withdrawalRate: params.dsWithdrawalRate,
        floorAnnualReal: params.spendingFloorReal,
        inflationIndex,
        nonPortfolioIncome: income,
      })
    case 'fixedReal':
    default:
      return baselineAnnualSpending
  }
}

/** Youngest plan age the engine accepts — the same bound the editor and the wizard use. */
export const MIN_CURRENT_AGE = 16

/**
 * Upper bound on Monte Carlo paths per run. The editor stops at 10,000; this
 * is the engine's own stop for anything that reaches it another way (an
 * imported plan, a hand-edited store), where 10⁷ runs would just hang the
 * worker.
 */
export const MAX_SIMULATION_RUNS = 20_000

/**
 * The parameter set the engine actually simulates: every scalar forced into
 * its valid range, the flow list reconciled with the legacy arrays and the
 * projections rewritten from it. Idempotent.
 *
 * It only ever repairs values that are not usable as they are. It does **not**
 * move anything the user dated: a flow keeps its start and end age even when
 * they lie outside `currentAge..endAge` (the series builder decides what of it
 * falls inside the horizon), and the statutory age may lie before `currentAge`
 * — that is simply a pension already in payment. Clamping those used to charge
 * expired expenses and tax a ten-year-old pension as if it started today.
 *
 * Exported so "do these results belong to these parameters?" can compare like
 * with like: `results.params` is this function's output.
 */
export function normalizeSimulationParams(params: SimulationParams): SimulationParams {
  const currentAge = Math.round(
    clamp(sanitizeFiniteNumber(params.currentAge, 55), MIN_CURRENT_AGE, 100)
  )
  const legalRetirementAge = Math.round(
    clamp(sanitizeFiniteNumber(params.legalRetirementAge, 67), MIN_CURRENT_AGE, 100)
  )
  const retirementAge = Math.round(
    clamp(sanitizeFiniteNumber(params.retirementAge, 60), currentAge, 100)
  )
  // The horizon covers the plan's own years. It is not stretched to the
  // statutory age: a plan that ends before the pension starts has no pension.
  const endAge = Math.round(
    clamp(sanitizeFiniteNumber(params.endAge, 90), Math.max(currentAge, retirementAge), 120)
  )

  const customExpenses = Array.isArray(params.customExpenses)
    ? params.customExpenses
        .filter((expense) => {
          if (!expense) return false
          if (expense.interval !== 'monthly' && expense.interval !== 'annual') return false
          return Number.isFinite(expense.amount) && expense.amount >= 0
        })
        .map((expense) => ({
          ...expense,
          amount: Math.max(0, expense.amount),
        }))
    : []

  const oneTimeIncomes = Array.isArray(params.oneTimeIncomes)
    ? params.oneTimeIncomes
        .filter((income) => {
          if (!income) return false
          return Number.isFinite(income.age) && Number.isFinite(income.amount) && income.amount >= 0
        })
        .map((income) => ({
          ...income,
          // Rounded, never clamped: an age outside the horizon has to stay
          // what it is, or the value-matched flow behind this entry would be
          // dropped and re-created without its id and tax treatment.
          age: Math.round(income.age),
          amount: Math.max(0, income.amount),
        }))
    : []

  // Cash flows are the source of truth; the two legacy arrays above are folded
  // back in (so `{...params, customExpenses: [...]}` still means what it says)
  // and then rewritten as projections of the reconciled list. Their ages are
  // left exactly as written — see the function comment.
  const cashFlows = reconcileCashFlows({
    cashFlows: params.cashFlows,
    customExpenses,
    oneTimeIncomes,
    monthlyPension: params.monthlyPension,
    currentAge,
  })

  return {
    ...params,
    currentAge,
    retirementAge,
    legalRetirementAge,
    endAge,
    currentAssets: Math.max(0, sanitizeFiniteNumber(params.currentAssets, 0)),
    annualSavings: Math.max(0, sanitizeFiniteNumber(params.annualSavings, 0)),
    annualSavingsGrowthRate: clamp(
      sanitizeFiniteNumber(params.annualSavingsGrowthRate, 0),
      -0.5,
      0.5
    ),
    monthlyPension: statutoryPensionMonthly(cashFlows),
    oneTimeIncomes: projectOneTimeIncomes(cashFlows, currentAge),
    averageROI: clamp(sanitizeFiniteNumber(params.averageROI, 0.07), -0.99, 0.3),
    roiVolatility: clamp(sanitizeFiniteNumber(params.roiVolatility, 0.15), 0, 1),
    averageInflation: clamp(sanitizeFiniteNumber(params.averageInflation, 0.025), -0.1, 0.3),
    inflationVolatility: clamp(sanitizeFiniteNumber(params.inflationVolatility, 0.01), 0, 0.3),
    capitalGainsTax: clamp(
      sanitizeFiniteNumber(params.capitalGainsTax, DEFAULT_CAPITAL_GAINS_TAX),
      0,
      100
    ),
    taxAllowanceAnnual: clamp(sanitizeFiniteNumber(params.taxAllowanceAnnual, 0), 0, 100000),
    householdType: normalizeHouseholdType(params.householdType),
    equityFundExemption: clamp(sanitizeFiniteNumber(params.equityFundExemption, 0), 0, 1),
    pensionTaxablePortion: clamp(sanitizeFiniteNumber(params.pensionTaxablePortion, 0), 0, 1),
    pensionTaxRate: clamp(sanitizeFiniteNumber(params.pensionTaxRate, 0), 0, 1),
    legacyTargetReal: Math.max(0, sanitizeFiniteNumber(params.legacyTargetReal, 0)),
    marketModel: normalizeMarketModel(params.marketModel),
    glidePathEnabled: params.glidePathEnabled === true,
    equityAllocationStart: clamp(sanitizeFiniteNumber(params.equityAllocationStart, 0.8), 0, 1),
    equityAllocationEnd: clamp(sanitizeFiniteNumber(params.equityAllocationEnd, 0.4), 0, 1),
    bondReturn: clamp(sanitizeFiniteNumber(params.bondReturn, 0.03), -0.99, 0.3),
    bondVolatility: clamp(sanitizeFiniteNumber(params.bondVolatility, 0.06), 0, 1),
    customExpenses: projectCustomExpenses(cashFlows),
    cashFlows,
    withdrawalStrategy: normalizeWithdrawalStrategy(params.withdrawalStrategy),
    dsWithdrawalRate: clamp(sanitizeFiniteNumber(params.dsWithdrawalRate, 0.05), 0.02, 0.08),
    dsCeilingRate: clamp(sanitizeFiniteNumber(params.dsCeilingRate, 0.05), 0, 0.15),
    dsFloorRate: clamp(sanitizeFiniteNumber(params.dsFloorRate, -0.025), -0.15, 0),
    spendingFloorReal: Math.max(0, sanitizeFiniteNumber(params.spendingFloorReal, 0)),
    simulationRuns: clamp(
      Math.round(sanitizeFiniteNumber(params.simulationRuns, 1)),
      1,
      MAX_SIMULATION_RUNS
    ),
  }
}

/**
 * Run a single Monte Carlo simulation
 *
 * Key improvements made:
 * - ROI returns are clamped at -100% to prevent impossible losses
 * - Proper cost basis tracking for accurate capital gains tax calculation
 * - Removed arbitrary 0.7 cap on taxable gains ratio
 * - Early termination when assets are exhausted to prevent negative compounding
 * - Proportional cost basis adjustment during withdrawals
 *
 * @param params - Simulation parameters
 * @param schedule - Per-plan constants, built once for all runs
 * @param sampler - Produces this year's growth and inflation factors
 * @param run - Index of this run, so a sampler can address a specific path
 * @param random - Uniform [0,1) source backing the sampler
 * @returns Asset, spending and cumulative-inflation histories, a failure flag, and the index of the first failure year (depletionIndex, null if the run never failed)
 */
/**
 * Everything about a plan that is identical for every Monte Carlo run.
 * Built once in `runMonteCarloSimulation` instead of per run, so a 7 500-run
 * simulation no longer rebuilds the same Map and expense totals 7 500 times.
 */
type SimulationSchedule = {
  /** Base-year (un-inflated) monthly total of the plain budget items. */
  baseMonthlyExpense: number
  /** Base-year (un-inflated) annual total of the plain budget items. */
  baseAnnualExpense: number
  /**
   * Everything else, expanded per year offset in today's euros: scheduled
   * flows (windows, single payments, income), and the budget items that have
   * a growth rate or a fixed euro amount (`baselineExtra*`). The budget —
   * the two totals above plus those extras — is what the withdrawal rule
   * acts on; scheduled flows ride on top of it. See `runSingleSimulation`.
   */
  flows: CashFlowSeries
  effectiveRetirementAge: number
  /**
   * True for every strategy except `fixedReal`, i.e. whenever the distribution
   * phase has to carry last year's decision forward instead of simply spending
   * the inflated budget.
   */
  usesRuleBasedSpending: boolean
  /** Sparerpauschbetrag available in each single year (couple = doubled). */
  annualAllowance: number
  /** Teilfreistellung on realised gains. */
  exemption: number
}

function buildSimulationSchedule(params: SimulationParams): SimulationSchedule {
  // Every lifetime recurring expense is retirement budget. The plain ones
  // (inflation-linked, no growth) land in the two base totals — the model the
  // plan has always had; one with its own growth or a fixed euro amount gets a
  // value per year. Everything else a `CashFlow` can say — an age window, a
  // single payment, income — is scheduled and expanded per age.
  const flows = buildCashFlowSeries(
    params.cashFlows ?? [],
    params.currentAge,
    params.endAge,
    taxContext(params)
  )

  return {
    baseMonthlyExpense: flows.baselineMonthly,
    baseAnnualExpense: flows.baselineAnnual,
    flows,
    effectiveRetirementAge: Math.max(params.retirementAge, params.currentAge),
    usesRuleBasedSpending: params.withdrawalStrategy !== 'fixedReal',
    annualAllowance: annualTaxAllowance(params),
    exemption: clamp(params.equityFundExemption ?? 0, 0, 1),
  }
}

function runSingleSimulation(
  params: SimulationParams,
  schedule: SimulationSchedule,
  sampler: MarketSampler,
  run: number,
  random: RandomSource
): {
  cashFlowHistory: AnnualCashFlow[]
  /** Balance at the *end* of each age's year. */
  assetHistory: number[]
  spendingHistory: number[]
  /**
   * Price level at the *start* of each age's year (index 0 is 1): what that
   * year's flows — spending, income, withdrawals — are priced at.
   */
  inflationIndexHistory: number[]
  /**
   * Price level at the *end* of each age's year, i.e. the next year's opening
   * level: what a closing balance is worth in.
   */
  closingPriceLevelHistory: number[]
  /** Net and tax of one-off income credited at the very end of the horizon (nominal). */
  endOfHorizon: { income: number; tax: number }
  failed: boolean
  depletionIndex: number | null
  /** Everything sold out of the portfolio over the run, before tax. */
  grossWithdrawn: number
  /** Capital gains tax paid on those sales. */
  taxPaid: number
} {
  const cashFlowHistory: AnnualCashFlow[] = []
  const assetHistory: number[] = []
  const spendingHistory: number[] = []
  const inflationIndexHistory: number[] = []
  const closingPriceLevelHistory: number[] = []
  const endOfHorizon = { income: 0, tax: 0 }
  let currentAssets = params.currentAssets
  let costBasis = params.currentAssets // Track original investment amount
  let currentAnnualSavings = params.annualSavings

  const { baseMonthlyExpense, baseAnnualExpense } = schedule

  let currentMonthlyExpense = baseMonthlyExpense
  let currentAnnualExpense = baseAnnualExpense
  /**
   * Index of the first year the plan could not pay for: its shortfall exceeded
   * `UNFUNDED_SPENDING_TOLERANCE` of the spending requested for it. `null`
   * while every year so far was funded. A balance of exactly zero is not a
   * failure on its own — a household living on its pension has no portfolio
   * and no gap.
   */
  let depletionIndex: number | null = null
  let previousDynamicAnnualSpending: number | null = null
  let dynamicSpendingInflationFactor = 1
  /**
   * Cumulative price level relative to the plan's first year. Year `i` spends
   * base-year amounts scaled by the index accumulated over years `0..i-1`, and
   * the same index deflates that year's nominal figures into today's euros.
   */
  let inflationIndex = 1

  const { effectiveRetirementAge, usesRuleBasedSpending, flows, annualAllowance, exemption } =
    schedule
  const taxRate = Math.max(0, params.capitalGainsTax / 100)

  /**
   * Sparerpauschbetrag left for the current year. Refills every January (see
   * the reset at the top of the age loop), so a plan that sells in small slices
   * shelters the same gain again and again — which is precisely why the
   * allowance is worth modelling instead of folding into an average tax rate.
   */
  let allowanceRemaining = annualAllowance
  let grossWithdrawn = 0
  let taxPaid = 0
  let yearShortfall = 0

  /**
   * Sells enough of the portfolio to raise `netNeeded` after capital gains tax,
   * returning the shortfall (0 when the need was met). Shared by both phases:
   * a windowed expense during the working years has to be funded too, and
   * letting it quietly drive the balance negative would flatter every plan.
   */
  const withdrawNet = (netNeeded: number): number => {
    if (netNeeded <= 0) return 0
    if (currentAssets <= 0) {
      yearShortfall += netNeeded
      return netNeeded
    }
    const shelter = { exemption, allowance: allowanceRemaining }
    const totalWithdrawal = computeGrossWithdrawal(
      currentAssets,
      costBasis,
      netNeeded,
      taxRate,
      shelter
    )
    const withdrawal = Math.min(totalWithdrawal, currentAssets)
    const withdrawalRatio = withdrawal > 0 && currentAssets > 0 ? withdrawal / currentAssets : 0
    // Tax and allowance are booked on what was *actually* sold: a portfolio
    // that could not raise the full amount also realised a smaller gain.
    const realizedTaxableGain =
      withdrawal * (1 - clamp(costBasis / currentAssets, 0, 1)) * (1 - exemption)
    const allowanceUsed = Math.min(allowanceRemaining, realizedTaxableGain)
    allowanceRemaining = Math.max(0, allowanceRemaining - allowanceUsed)
    const saleTax = Math.max(0, realizedTaxableGain - allowanceUsed) * taxRate
    taxPaid += saleTax
    grossWithdrawn += withdrawal
    costBasis = Math.max(0, costBasis * (1 - withdrawalRatio))
    currentAssets = Math.max(0, currentAssets - withdrawal)
    const shortfall = Math.max(0, netNeeded - (withdrawal - saleTax))
    yearShortfall += shortfall
    return shortfall
  }

  for (let age = params.currentAge; age <= params.endAge; age++) {
    const yearIndex = age - params.currentAge
    const openingAssets = currentAssets
    const withdrawalsBefore = grossWithdrawn
    const taxesBefore = taxPaid
    let investmentReturn = 0
    let portfolioContribution = 0
    const savings = age < effectiveRetirementAge ? currentAnnualSavings : 0
    yearShortfall = 0
    /** What the plan asked to spend this year; `yearShortfall` of it went unpaid. */
    let requestedSpending = 0
    /** The rule's own numbers for the ledger: what it took, and of what. */
    let ruleWithdrawal = 0
    let rulePortfolio = 0
    inflationIndexHistory.push(inflationIndex)
    // A new tax year: the allowance is use-it-or-lose-it.
    allowanceRemaining = annualAllowance

    // Scheduled flows are quoted in today's euros; inflation-linked ones are
    // re-priced with this path's realised price level, fixed ones are not.
    const extraIncome =
      flows.incomeLinked[yearIndex] * inflationIndex + flows.incomeFixed[yearIndex]
    const extraExpense =
      flows.expenseLinked[yearIndex] * inflationIndex + flows.expenseFixed[yearIndex]

    // A one-off payment is quoted in today's euros like every other flow, so an
    // inheritance booked for 2040 arrives as what that sum is worth by then.
    const scheduledIncome =
      (flows.oneTimeIncomeLinkedByAge.get(age) ?? 0) * inflationIndex +
      (flows.oneTimeIncomeFixedByAge.get(age) ?? 0)
    if (scheduledIncome > 0) {
      portfolioContribution += scheduledIncome
      currentAssets += scheduledIncome
      costBasis += scheduledIncome
    }

    if (age < effectiveRetirementAge) {
      // Accumulation phase (working years)
      const roiFactor = sampler.nextGrowthFactor(yearIndex, run, random)

      // During accumulation, assume reinvestment without realizing gains
      investmentReturn = currentAssets * (roiFactor - 1)
      currentAssets = currentAssets * roiFactor
      // Salary covers ordinary living costs while working, so only scheduled
      // flows move money here: they net off against the year's savings.
      const netContribution = currentAnnualSavings + extraIncome - extraExpense
      if (netContribution >= 0) {
        portfolioContribution += netContribution
        currentAssets += netContribution
        costBasis += netContribution // Track additional investments
      } else {
        // A scheduled expense the year's savings do not cover is sold for;
        // what the portfolio cannot raise is this year's shortfall.
        withdrawNet(-netContribution)
        currentAssets = Math.max(0, currentAssets)
      }
      // Only scheduled expenses are portfolio spending before retirement.
      requestedSpending = extraExpense

      // Inflate expenses so that retirement starts with age-adjusted spending
      const inflationFactor = sampler.nextInflationFactor(yearIndex, run, random)
      inflationIndex *= inflationFactor
      currentMonthlyExpense = baseMonthlyExpense * inflationIndex
      currentAnnualExpense = baseAnnualExpense * inflationIndex

      const savingsGrowthFactor = 1 + params.annualSavingsGrowthRate
      currentAnnualSavings = Math.max(0, currentAnnualSavings * savingsGrowthFactor)
    } else {
      // Distribution phase (retirement years)
      // The budget: the plain items at this year's price level, plus the
      // items with their own growth or a fixed euro amount. The extras are
      // zero for a plan without such items, which leaves the sum bit-identical
      // to the two-total model.
      const baselineAnnualExpenseThisYear =
        currentMonthlyExpense * 12 +
        currentAnnualExpense +
        flows.baselineExtraLinked[yearIndex] * inflationIndex +
        flows.baselineExtraFixed[yearIndex]
      const priorYearPortfolioValue = Math.max(0, currentAssets)
      /**
       * The guardrailed baseline: ordinary, lifetime living costs only.
       *
       * Scheduled flows are deliberately kept OUT of it and added afterwards.
       * A roof repair is not a lifestyle decision the Vanguard ceiling should
       * clip, and it must not raise next year's floor either — so the flows
       * ride on top of the rule rather than through it.
       *
       * Every rule except `percentOfPortfolio` needs a previous year to work
       * from, so the first retirement year always spends the plan's own budget.
       * `percentOfPortfolio` has no memory and starts responding immediately.
       *
       * Pensions and recurring income are `pension` / `income` cash flows,
       * already netted of income tax and expanded per age in `extraIncome` —
       * see `buildCashFlowSeries`. They are what the household has without
       * touching the portfolio, so the rule sees them: it decides the part of
       * the baseline the portfolio pays. One-off income is not in here; it
       * was paid into the portfolio above and is part of `priorYearPortfolioValue`.
       */
      const annualIncome = extraIncome
      const guardrailedAnnualSpending: number = applyWithdrawalStrategy({
        strategy: params.withdrawalStrategy,
        baselineAnnualSpending: baselineAnnualExpenseThisYear,
        priorYearPortfolioValue,
        previousAnnualSpending: previousDynamicAnnualSpending,
        inflationFactor: dynamicSpendingInflationFactor,
        inflationIndex,
        nonPortfolioIncome: annualIncome,
        params,
      })
      ruleWithdrawal = Math.max(0, guardrailedAnnualSpending - annualIncome)
      rulePortfolio = priorYearPortfolioValue

      const totalAnnualExpenseThisYear = guardrailedAnnualSpending + extraExpense
      requestedSpending = totalAnnualExpenseThisYear

      // Calculate how much we need to withdraw from investments
      const netNeeded = totalAnnualExpenseThisYear - annualIncome

      // Apply investment growth first
      const roiFactor = sampler.nextGrowthFactor(yearIndex, run, random)
      investmentReturn = currentAssets * (roiFactor - 1)
      currentAssets = Math.max(0, currentAssets * roiFactor)

      if (netNeeded > 0) {
        // We need to sell investments to cover expenses, with tax gross-up on
        // gains portion; `withdrawNet` books whatever it cannot raise as this
        // year's shortfall.
        withdrawNet(netNeeded)
        currentAssets = Math.max(0, currentAssets)
      } else {
        // Surplus income: reinvest surplus and increase cost basis accordingly
        const surplus = -netNeeded
        portfolioContribution += surplus
        currentAssets = currentAssets + surplus
        costBasis += surplus
      }

      // Apply inflation to expenses for next year
      const inflationFactor = sampler.nextInflationFactor(yearIndex, run, random)
      inflationIndex *= inflationFactor
      currentMonthlyExpense = baseMonthlyExpense * inflationIndex
      currentAnnualExpense = baseAnnualExpense * inflationIndex
      if (usesRuleBasedSpending) {
        // Anchored to the guardrailed baseline, not to the total: a one-off
        // expense must not become next year's spending floor.
        previousDynamicAnnualSpending = guardrailedAnnualSpending
        dynamicSpendingInflationFactor = inflationFactor
      }
    }

    // What was actually spent: a depleted path pays for what its income
    // covers, not for the budget it asked for. Percentiles, the corridor and
    // the strategy comparison all read this series; the ledger keeps the
    // request and the shortfall side by side.
    spendingHistory.push(Math.max(0, requestedSpending - yearShortfall) / 12)

    // The run fails in the first year it leaves a material part of its
    // spending unpaid — not when the balance touches zero.
    if (
      depletionIndex === null &&
      yearShortfall > requestedSpending * UNFUNDED_SPENDING_TOLERANCE
    ) {
      depletionIndex = yearIndex
    }

    // A one-off booked for the last year arrives at the end of it, like every
    // other one-off arrives at the end of its own year: it is part of what is
    // left, and too late to pay for anything. Priced at the year's closing
    // price level — the level the next year would have opened at.
    let endOfHorizonIncome = 0
    let endOfHorizonIncomeTax = 0
    if (age === params.endAge) {
      const atEnd = flows.oneTimeIncomeAtEnd
      endOfHorizonIncome = atEnd.netLinked * inflationIndex + atEnd.netFixed
      endOfHorizonIncomeTax = atEnd.taxLinked * inflationIndex + atEnd.taxFixed
      if (endOfHorizonIncome > 0) {
        portfolioContribution += endOfHorizonIncome
        currentAssets += endOfHorizonIncome
        costBasis += endOfHorizonIncome
      }
      endOfHorizon.income = endOfHorizonIncome
      endOfHorizon.tax = endOfHorizonIncomeTax
    }
    // Both branches above have applied this year's inflation by now.
    closingPriceLevelHistory.push(inflationIndex)

    const yearPriceLevel = inflationIndexHistory[yearIndex]
    const incomeTax =
      flows.incomeTaxLinked[yearIndex] * yearPriceLevel +
      flows.incomeTaxFixed[yearIndex] +
      endOfHorizonIncomeTax
    const pensionTax =
      flows.pensionTaxLinked[yearIndex] * yearPriceLevel + flows.pensionTaxFixed[yearIndex]
    const oneOffIncomeTax =
      flows.oneTimeIncomeTaxLinked[yearIndex] * yearPriceLevel +
      flows.oneTimeIncomeTaxFixed[yearIndex] +
      endOfHorizonIncomeTax
    const oneOffIncomeNet = scheduledIncome + endOfHorizonIncome
    cashFlowHistory.push({
      openingAssets,
      investmentReturn,
      savings,
      incomeGross: extraIncome + oneOffIncomeNet + incomeTax,
      incomeTax,
      capitalGainsTax: taxPaid - taxesBefore,
      expenses: requestedSpending,
      portfolioWithdrawal: grossWithdrawn - withdrawalsBefore,
      portfolioContribution,
      shortfall: yearShortfall,
      closingAssets: currentAssets,
      pensionGross:
        flows.pensionNetLinked[yearIndex] * yearPriceLevel +
        flows.pensionNetFixed[yearIndex] +
        pensionTax,
      pensionTax,
      oneOffIncomeGross: oneOffIncomeNet + oneOffIncomeTax,
      oneOffIncomeTax,
      scheduledExpenses: extraExpense,
      ruleWithdrawal,
      rulePortfolio,
    })
    assetHistory.push(currentAssets)
  }

  return {
    cashFlowHistory,
    assetHistory,
    spendingHistory,
    inflationIndexHistory,
    closingPriceLevelHistory,
    endOfHorizon,
    failed: depletionIndex !== null,
    depletionIndex,
    grossWithdrawn,
    taxPaid,
  }
}

/**
 * Run the complete Monte Carlo simulation
 * @param params - Simulation parameters
 * @returns Complete simulation results including percentiles and success rate
 */
/** How many individual trajectories the fan chart's sample overlay gets. */
export const SAMPLE_PATH_COUNT = 7

export function runMonteCarloSimulation(
  params: SimulationParams,
  options: { random?: RandomSource; seed?: number; sampler?: MarketSampler } = {}
): SimulationResults {
  const normalizedParams = normalizeSimulationParams(params)
  // Deterministic by default. `options.random` forces every run to share one
  // stream (legacy behaviour, used by tests); otherwise each run index gets its
  // own stream derived from a fixed base seed so the scenario set is stable
  // across parameter changes and run counts. See DEFAULT_PATH_SEED.
  const sharedRandom = options.random
  const baseSeed = options.seed ?? DEFAULT_PATH_SEED

  const ages: number[] = []
  // Initialize age array
  for (let age = normalizedParams.currentAge; age <= normalizedParams.endAge; age++) {
    ages.push(age)
  }

  // One entry per year offset. Flat unless the glide path is on, in which case
  // each year carries the blend implied by that year's equity share.
  const distributions = buildSimulationDistributions(normalizedParams, ages.length)

  const usesHistory = normalizedParams.marketModel === 'historical'
  const sampler =
    options.sampler ??
    (usesHistory
      ? createHistoricalSampler(buildEquityGlidePath(normalizedParams, ages.length))
      : createMonteCarloSampler(distributions))

  /**
   * Historical mode has exactly as many paths as the series has start years —
   * asking for 5 000 of 125 possible histories would just repeat each one 40
   * times and pretend the sample was bigger than it is. `simulationRuns` is left
   * untouched on the params so switching back to Monte Carlo restores the
   * user's chosen count. Shared with every surface that describes the run —
   * see `effectiveRunCount` in `simulation/context.ts`.
   */
  const effectiveRuns = effectiveRunCount(normalizedParams)

  const schedule = buildSimulationSchedule(normalizedParams)

  const cashFlowMeans: AnnualCashFlow[] = []
  const cashFlowMeansReal: AnnualCashFlow[] = []
  const assetRuns: number[][] = []
  const spendingRuns: number[][] = []
  const assetRunsReal: number[][] = []
  const spendingRunsReal: number[][] = []
  const inflationIndexRuns: number[][] = []
  let successfulRuns = 0
  let survivingRuns = 0
  const taxDragRatios: number[] = []
  const legacyTarget = Math.max(0, normalizedParams.legacyTargetReal ?? 0)

  const depletionCounts = new Array<number>(ages.length).fill(0)

  // A few real trajectories for the fan chart's sample-path overlay. The first
  // run indices are kept (not a random pick): deterministic per-run seeds make
  // them the *same* handful of market histories on every recompute, so the
  // overlay stays steady while sliders are scrubbed.
  const sampleAssetPaths: number[][] = []
  const sampleAssetPathsReal: number[][] = []

  // Run all simulations
  for (let run = 0; run < effectiveRuns; run++) {
    const random = sharedRandom ?? mulberry32(mixSeed(baseSeed, run))
    const result = runSingleSimulation(normalizedParams, schedule, sampler, run, random)

    const lastIndex = result.cashFlowHistory.length - 1
    result.cashFlowHistory.forEach((row, index) => {
      const nominal = (cashFlowMeans[index] ??= { ...row })
      const real = (cashFlowMeansReal[index] ??= { ...row })
      const realRow = deflateLedgerRow(
        row,
        result.inflationIndexHistory[index],
        result.closingPriceLevelHistory[index],
        index === lastIndex ? result.endOfHorizon : undefined
      )
      for (const key of Object.keys(row) as (keyof AnnualCashFlow)[]) {
        if (run === 0) {
          nominal[key] = 0
          real[key] = 0
        }
        nominal[key] = (nominal[key] ?? 0) + (row[key] ?? 0) / effectiveRuns
        real[key] = (real[key] ?? 0) + (realRow[key] ?? 0) / effectiveRuns
      }
    })
    assetRuns.push(result.assetHistory)
    spendingRuns.push(result.spendingHistory)
    // Deflate each path by *its own* realised inflation before percentiles are
    // taken. Deflating the nominal percentile band by an average price level
    // would mix quantiles of two different distributions; this does not.
    //
    // `assetHistory[i]` is the balance at the END of age i's year, so it is
    // worth what money is worth at the end of that year: the closing price
    // level. (Dividing by the opening level made a portfolio that exactly
    // keeps pace with inflation look as if it gained a year's inflation.)
    // Spending is paid during the year at the opening level, and stays there.
    const realAssets = deflatePath(result.assetHistory, result.closingPriceLevelHistory)
    if (run < SAMPLE_PATH_COUNT) {
      sampleAssetPaths.push(result.assetHistory)
      sampleAssetPathsReal.push(realAssets)
    }
    assetRunsReal.push(realAssets)
    spendingRunsReal.push(deflatePath(result.spendingHistory, result.inflationIndexHistory))
    inflationIndexRuns.push(result.inflationIndexHistory)

    if (!result.failed) {
      survivingRuns++
      // A bequest goal is a second bar to clear, measured on the same real
      // series the dashboard shows. With the target at 0 it is always cleared,
      // so `successRate` collapses to plain survival.
      const terminalReal = realAssets[realAssets.length - 1] ?? 0
      if (terminalReal >= legacyTarget) successfulRuns++
    }

    if (result.grossWithdrawn > 0) {
      taxDragRatios.push(result.taxPaid / result.grossWithdrawn)
    }

    if (result.depletionIndex !== null && result.depletionIndex < depletionCounts.length) {
      depletionCounts[result.depletionIndex]++
    }
  }

  // Calculate percentiles
  const assetPercentiles = calculatePercentiles(assetRuns)
  const spendingPercentiles = calculatePercentiles(spendingRuns)
  const assetPercentilesReal = calculatePercentiles(assetRunsReal)
  const spendingPercentilesReal = calculatePercentiles(spendingRunsReal)
  // Median realised price level per age — at the START of that age's year,
  // which is what the year's flows are priced at. Lets the UI express
  // nominally fixed amounts (a pension in euros) in today's money without
  // re-running anything.
  const inflationIndexP50 = calculatePercentiles(inflationIndexRuns).p50

  // Calculate success rate
  const successRate = (successfulRuns / effectiveRuns) * 100
  const depletionSuccessRate = (survivingRuns / effectiveRuns) * 100
  const withdrawalTaxDrag =
    taxDragRatios.length > 0 ? calculatePercentile(taxDragRatios, 50) : undefined

  let depletedSoFar = 0
  const depletionByAge = depletionCounts.map((count) => {
    depletedSoFar += count
    return depletedSoFar / effectiveRuns
  })

  return {
    ages,
    assetPercentiles,
    spendingPercentiles,
    assetPercentilesReal,
    spendingPercentilesReal,
    inflationIndexP50,
    successRate,
    depletionSuccessRate,
    withdrawalTaxDrag,
    depletionByAge,
    sampleAssetPaths,
    sampleAssetPathsReal,
    cashFlowMeans,
    cashFlowMeansReal,
    params: normalizedParams,
  }
}

/** Converts a nominal path into today's euros using that path's own price level. */
function deflatePath(values: number[], inflationIndex: number[]): number[] {
  return values.map((value, index) => {
    const level = inflationIndex[index]
    return level > 0 ? value / level : value
  })
}

/**
 * One booked year in today's euros, on the same conventions as the series:
 *
 * - everything that *moves* during the year (income, taxes, spending, sales,
 *   contributions, the rule's numbers) and the opening balance are priced at
 *   the year's opening level;
 * - the closing balance is priced at the closing level, so it equals the next
 *   row's opening balance and the real asset series;
 * - the investment return is what is left: closing − opening − contributions +
 *   withdrawals. That is the *real* return — net of what inflation took off
 *   the balance during the year — and it keeps the row's asset identity true
 *   in real terms. A portfolio that earns exactly inflation has a real return
 *   of zero, not of one year's inflation.
 *
 * One-off income credited at the very end of the horizon is the one flow that
 * arrives at the closing level; it is re-priced accordingly.
 */
function deflateLedgerRow(
  row: AnnualCashFlow,
  openingLevel: number,
  closingLevel: number,
  endOfHorizon?: { income: number; tax: number }
): AnnualCashFlow {
  const opening = openingLevel > 0 ? openingLevel : 1
  const closing = closingLevel > 0 ? closingLevel : 1
  const real = { ...row }
  for (const key of Object.keys(row) as (keyof AnnualCashFlow)[]) {
    real[key] = (row[key] ?? 0) / opening
  }
  if (endOfHorizon && (endOfHorizon.income > 0 || endOfHorizon.tax > 0)) {
    // Priced at the opening level above; move these parts to the closing one.
    const shift = 1 / closing - 1 / opening
    const gross = endOfHorizon.income + endOfHorizon.tax
    real.incomeGross += gross * shift
    real.incomeTax += endOfHorizon.tax * shift
    real.portfolioContribution += endOfHorizon.income * shift
    if (real.oneOffIncomeGross !== undefined) real.oneOffIncomeGross += gross * shift
    if (real.oneOffIncomeTax !== undefined) real.oneOffIncomeTax += endOfHorizon.tax * shift
  }
  real.closingAssets = row.closingAssets / closing
  real.investmentReturn =
    real.closingAssets - real.openingAssets - real.portfolioContribution + real.portfolioWithdrawal
  return real
}

/**
 * The German shelters that sit between a realised gain and the tax bill.
 *
 * Both default to "no shelter", which is exactly the flat model the engine had
 * before they existed — `computeGrossWithdrawal(a, b, n, t)` is unchanged.
 */
export interface WithdrawalTaxShelter {
  /** Teilfreistellung: share of the gain that is exempt outright (0..1). */
  exemption?: number
  /** Sparerpauschbetrag left for this year, in euros. Offsets taxable gain first. */
  allowance?: number
}

/**
 * What one withdrawal actually costs, given the two shelters.
 *
 * Solves for the gross sale `W` that nets `netNeeded` after tax:
 *
 *   gain(W)        = W · gainsRatio
 *   taxableGain(W) = gain(W) · (1 − exemption)
 *   tax(W)         = max(0, taxableGain(W) − allowance) · taxRate
 *   net(W)         = W − tax(W)
 *
 * `net` is piecewise linear in `W` with a kink where the allowance runs out, so
 * the sheltered branch is tried first and the taxed branch is only used when
 * the need is genuinely too large to hide behind the allowance.
 */
export function computeWithdrawalTax(
  currentAssets: number,
  costBasis: number,
  netNeeded: number,
  taxRate: number,
  shelter: WithdrawalTaxShelter = {}
): { gross: number; taxableGain: number; allowanceUsed: number; tax: number } {
  const none = { gross: 0, taxableGain: 0, allowanceUsed: 0, tax: 0 }
  if (netNeeded <= 0 || currentAssets <= 0) return none

  const basisRatio = clamp(costBasis / currentAssets, 0, 1)
  const gainsRatio = 1 - basisRatio
  const exemption = clamp(shelter.exemption ?? 0, 0, 1)
  const allowance = Math.max(0, shelter.allowance ?? 0)
  /** Share of every euro withdrawn that is taxable gain. */
  const taxableShare = gainsRatio * (1 - exemption)

  // Branch 1: the whole taxable gain fits inside the remaining allowance, so
  // the sale is tax-free and the gross equals the need.
  const shelteredTaxableGain = netNeeded * taxableShare
  if (shelteredTaxableGain <= allowance) {
    return {
      gross: netNeeded,
      taxableGain: shelteredTaxableGain,
      allowanceUsed: shelteredTaxableGain,
      tax: 0,
    }
  }

  // Branch 2: gross up over the part of the gain the allowance no longer covers.
  const denom = 1 - taxRate * taxableShare
  if (denom <= 0) return { ...none, gross: Number.POSITIVE_INFINITY }
  const gross = (netNeeded - taxRate * allowance) / denom
  const taxableGain = gross * taxableShare
  const allowanceUsed = Math.min(allowance, taxableGain)
  return {
    gross,
    taxableGain,
    allowanceUsed,
    tax: Math.max(0, taxableGain - allowanceUsed) * taxRate,
  }
}

/**
 * Compute the gross withdrawal needed to cover a net cash need when capital gains are taxed.
 * - currentAssets: portfolio value after growth
 * - costBasis: remaining cost basis before withdrawal
 * - netNeeded: net cash requirement (expenses - income), non-negative
 * - taxRate: capital gains tax rate in decimal, e.g., 0.25
 * - shelter: optional Teilfreistellung / Sparerpauschbetrag (both default to none)
 *
 * Returns the gross amount to withdraw so that after tax on the gains portion,
 * the net equals netNeeded. Caps at Infinity if denom <= 0; caller should min with currentAssets.
 */
export function computeGrossWithdrawal(
  currentAssets: number,
  costBasis: number,
  netNeeded: number,
  taxRate: number,
  shelter: WithdrawalTaxShelter = {}
): number {
  return computeWithdrawalTax(currentAssets, costBasis, netNeeded, taxRate, shelter).gross
}

/**
 * The Sparerpauschbetrag this plan gets each year — doubled when the household
 * is jointly assessed. Deliberately a nominal figure: the statutory allowance
 * is set in euros and only moves when the legislator moves it, so a 30-year
 * plan should feel it shrink in real terms.
 */
export function annualTaxAllowance(params: SimulationParams): number {
  const base = Math.max(0, params.taxAllowanceAnnual ?? 0)
  return params.householdType === 'couple' ? base * 2 : base
}

/**
 * Net statutory pension: only the Besteuerungsanteil is taxable, and only at
 * the household's effective income-tax rate.
 */
export function netPensionFactor(params: SimulationParams): number {
  const taxablePortion = clamp(params.pensionTaxablePortion ?? 0, 0, 1)
  const rate = clamp(params.pensionTaxRate ?? 0, 0, 1)
  return 1 - taxablePortion * rate
}

/**
 * Annual pension income after income tax at the statutory retirement age —
 * every pension paying out by then, in the euros each is quoted in.
 */
export function netAnnualPension(params: SimulationParams): number {
  return netPensionAnnualAtAge(
    params.cashFlows ?? [],
    params.legalRetirementAge,
    taxContext(params)
  )
}

/** The plan-level tax and timing defaults every cash flow is read against. */
export function taxContext(params: SimulationParams): PensionContext {
  return {
    currentAge: params.currentAge,
    legalRetirementAge: params.legalRetirementAge,
    pensionTaxablePortion: params.pensionTaxablePortion,
    pensionTaxRate: params.pensionTaxRate,
    householdType: params.householdType === 'couple' ? 'couple' : 'single',
    expectedInflation: params.averageInflation,
  }
}

/**
 * Format currency values for display
 * @param value - Numeric value
 * @returns Formatted currency string
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Format percentage values for display
 * @param value - Numeric value (as decimal, e.g., 0.07 for 7%)
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

/**
 * Calculate combined monthly and annual expense totals from custom expenses
 * @param customExpenses - Array containing custom expense items
 * @returns Object with combined totals
 */
export function calculateCombinedExpenses(
  customExpenses?: { interval: 'monthly' | 'annual'; amount: number }[]
) {
  // Defensive check: ensure expenses is always an array
  const expenses = Array.isArray(customExpenses) ? customExpenses : []
  const totalMonthly = expenses
    .filter((e) => e.interval === 'monthly')
    .reduce((sum, expense) => sum + expense.amount, 0)
  const totalAnnual = expenses
    .filter((e) => e.interval === 'annual')
    .reduce((sum, expense) => sum + expense.amount, 0)

  return {
    totalMonthly,
    totalAnnual,
    combinedMonthly: totalMonthly + totalAnnual / 12,
    combinedAnnual: totalMonthly * 12 + totalAnnual,
  }
}
