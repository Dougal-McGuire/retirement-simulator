import { SimulationParams, SimulationResults, PercentileData, isWithdrawalStrategy } from '@/types'

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
export const DEFAULT_PATH_SEED = 0x5eed_c0de

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
    withdrawalStrategy: params.withdrawalStrategy,
    dsWithdrawalRate: params.dsWithdrawalRate,
    dsCeilingRate: params.dsCeilingRate,
    dsFloorRate: params.dsFloorRate,
    simulationRuns: params.simulationRuns,
    customExpenses: (params.customExpenses ?? []).map((expense) => [
      expense.interval,
      expense.amount,
    ]),
    oneTimeIncomes: (params.oneTimeIncomes ?? []).map((income) => [income.age, income.amount]),
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
 * Every entry is identical today because the model uses one flat set of market
 * assumptions, but the per-age shape is what a term-structure ("glidepath",
 * "first decade is bad") or a historical-sequence mode needs.
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

export function calculateVanguardDynamicAnnualSpending({
  priorYearPortfolioValue,
  previousAnnualSpending,
  inflationFactor,
  withdrawalRate,
  ceilingRate,
  floorRate,
}: {
  priorYearPortfolioValue: number
  previousAnnualSpending: number
  inflationFactor: number
  withdrawalRate: number
  ceilingRate: number
  floorRate: number
}): number {
  const targetAnnualSpending = Math.max(0, priorYearPortfolioValue * withdrawalRate)
  const inflationAdjustedPreviousSpending = Math.max(0, previousAnnualSpending * inflationFactor)
  const lowerBound = inflationAdjustedPreviousSpending * (1 + floorRate)
  const upperBound = inflationAdjustedPreviousSpending * (1 + ceilingRate)

  return clamp(
    targetAnnualSpending,
    Math.min(lowerBound, upperBound),
    Math.max(lowerBound, upperBound)
  )
}

function normalizeSimulationParams(params: SimulationParams): SimulationParams {
  const currentAge = Math.round(clamp(sanitizeFiniteNumber(params.currentAge, 55), 18, 100))
  const legalRetirementAge = Math.round(
    clamp(sanitizeFiniteNumber(params.legalRetirementAge, 67), currentAge, 100)
  )
  const retirementAge = Math.round(
    clamp(sanitizeFiniteNumber(params.retirementAge, 60), currentAge, 100)
  )
  const endAge = Math.round(
    clamp(
      sanitizeFiniteNumber(params.endAge, 90),
      Math.max(currentAge, retirementAge, legalRetirementAge),
      120
    )
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
          age: Math.round(clamp(income.age, currentAge, endAge)),
          amount: Math.max(0, income.amount),
        }))
    : []

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
    monthlyPension: Math.max(0, sanitizeFiniteNumber(params.monthlyPension, 0)),
    oneTimeIncomes,
    averageROI: clamp(sanitizeFiniteNumber(params.averageROI, 0.07), -0.99, 0.3),
    roiVolatility: clamp(sanitizeFiniteNumber(params.roiVolatility, 0.15), 0, 1),
    averageInflation: clamp(sanitizeFiniteNumber(params.averageInflation, 0.025), -0.1, 0.3),
    inflationVolatility: clamp(sanitizeFiniteNumber(params.inflationVolatility, 0.01), 0, 0.3),
    capitalGainsTax: clamp(sanitizeFiniteNumber(params.capitalGainsTax, 26.25), 0, 100),
    customExpenses,
    withdrawalStrategy: normalizeWithdrawalStrategy(params.withdrawalStrategy),
    dsWithdrawalRate: clamp(sanitizeFiniteNumber(params.dsWithdrawalRate, 0.05), 0.02, 0.08),
    dsCeilingRate: clamp(sanitizeFiniteNumber(params.dsCeilingRate, 0.05), 0, 0.15),
    dsFloorRate: clamp(sanitizeFiniteNumber(params.dsFloorRate, -0.025), -0.15, 0),
    simulationRuns: Math.max(1, Math.round(sanitizeFiniteNumber(params.simulationRuns, 1))),
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
  /** age -> total one-time income credited at the start of that age. */
  oneTimeIncomeByAge: ReadonlyMap<number, number>
  /** Base-year (un-inflated) monthly expense total. */
  baseMonthlyExpense: number
  /** Base-year (un-inflated) annual expense total. */
  baseAnnualExpense: number
  effectiveRetirementAge: number
  usesDynamicSpending: boolean
}

function buildSimulationSchedule(params: SimulationParams): SimulationSchedule {
  const oneTimeIncomeByAge = new Map<number, number>()
  if (Array.isArray(params.oneTimeIncomes)) {
    for (const income of params.oneTimeIncomes) {
      if (!income) continue
      const amount = Math.max(0, Number(income.amount) || 0)
      if (amount <= 0) continue
      const payoutAge = Math.floor(Number(income.age))
      if (!Number.isFinite(payoutAge)) continue
      const depositAge = payoutAge + 1
      if (depositAge < params.currentAge || depositAge > params.endAge) continue
      oneTimeIncomeByAge.set(depositAge, (oneTimeIncomeByAge.get(depositAge) ?? 0) + amount)
    }
  }

  // Calculate total monthly and annual expenses from custom expenses
  const customExpenses = params.customExpenses ?? []
  const baseMonthlyExpense = customExpenses
    .filter((e) => e.interval === 'monthly')
    .reduce((sum, expense) => sum + expense.amount, 0)
  const baseAnnualExpense = customExpenses
    .filter((e) => e.interval === 'annual')
    .reduce((sum, expense) => sum + expense.amount, 0)

  return {
    oneTimeIncomeByAge,
    baseMonthlyExpense,
    baseAnnualExpense,
    effectiveRetirementAge: Math.max(params.retirementAge, params.currentAge),
    usesDynamicSpending: params.withdrawalStrategy === 'vanguardDynamic',
  }
}

function runSingleSimulation(
  params: SimulationParams,
  schedule: SimulationSchedule,
  sampler: MarketSampler,
  run: number,
  random: RandomSource
): {
  assetHistory: number[]
  spendingHistory: number[]
  /** Cumulative inflation from the start of the plan up to each age. */
  inflationIndexHistory: number[]
  failed: boolean
  depletionIndex: number | null
} {
  const assetHistory: number[] = []
  const spendingHistory: number[] = []
  const inflationIndexHistory: number[] = []
  let currentAssets = params.currentAssets
  let costBasis = params.currentAssets // Track original investment amount
  let currentAnnualSavings = params.annualSavings

  const { oneTimeIncomeByAge, baseMonthlyExpense, baseAnnualExpense } = schedule

  let currentMonthlyExpense = baseMonthlyExpense
  let currentAnnualExpense = baseAnnualExpense
  let runFailed = false
  let depletionIndex: number | null = null
  let previousDynamicAnnualSpending: number | null = null
  let dynamicSpendingInflationFactor = 1
  /**
   * Cumulative price level relative to the plan's first year. Year `i` spends
   * base-year amounts scaled by the index accumulated over years `0..i-1`, and
   * the same index deflates that year's nominal figures into today's euros.
   */
  let inflationIndex = 1

  const { effectiveRetirementAge, usesDynamicSpending } = schedule

  for (let age = params.currentAge; age <= params.endAge; age++) {
    const yearIndex = age - params.currentAge
    inflationIndexHistory.push(inflationIndex)

    const scheduledIncome = oneTimeIncomeByAge.get(age)
    if (scheduledIncome && scheduledIncome > 0) {
      currentAssets += scheduledIncome
      costBasis += scheduledIncome
    }

    if (age < effectiveRetirementAge) {
      // Accumulation phase (working years)
      const roiFactor = sampler.nextGrowthFactor(yearIndex, run, random)

      // During accumulation, assume reinvestment without realizing gains
      currentAssets = currentAssets * roiFactor + currentAnnualSavings
      costBasis += currentAnnualSavings // Track additional investments
      spendingHistory.push(0) // No spending during accumulation for visualization

      // Inflate expenses so that retirement starts with age-adjusted spending
      const inflationFactor = sampler.nextInflationFactor(yearIndex, run, random)
      inflationIndex *= inflationFactor
      currentMonthlyExpense = baseMonthlyExpense * inflationIndex
      currentAnnualExpense = baseAnnualExpense * inflationIndex

      const savingsGrowthFactor = 1 + params.annualSavingsGrowthRate
      currentAnnualSavings = Math.max(0, currentAnnualSavings * savingsGrowthFactor)
    } else {
      // Distribution phase (retirement years)
      const baselineAnnualExpenseThisYear = currentMonthlyExpense * 12 + currentAnnualExpense
      const priorYearPortfolioValue = Math.max(0, currentAssets)
      const totalAnnualExpenseThisYear: number =
        usesDynamicSpending && previousDynamicAnnualSpending !== null
          ? calculateVanguardDynamicAnnualSpending({
              priorYearPortfolioValue,
              previousAnnualSpending: previousDynamicAnnualSpending,
              inflationFactor: dynamicSpendingInflationFactor,
              withdrawalRate: params.dsWithdrawalRate,
              ceilingRate: params.dsCeilingRate,
              floorRate: params.dsFloorRate,
            })
          : baselineAnnualExpenseThisYear

      // Add pension income if at legal retirement age
      let annualIncome = 0
      if (age >= params.legalRetirementAge) {
        annualIncome = params.monthlyPension * 12
      }

      // Calculate how much we need to withdraw from investments
      const netNeeded = totalAnnualExpenseThisYear - annualIncome

      // Apply investment growth first
      const roiFactor = sampler.nextGrowthFactor(yearIndex, run, random)
      currentAssets = Math.max(0, currentAssets * roiFactor)

      if (netNeeded > 0) {
        // We need to sell investments to cover expenses, with tax gross-up on gains portion
        if (currentAssets <= 0) {
          runFailed = true
          currentAssets = 0
        } else {
          const t = Math.max(0, params.capitalGainsTax / 100)
          const totalWithdrawal = computeGrossWithdrawal(currentAssets, costBasis, netNeeded, t)
          const withdrawal = Math.min(totalWithdrawal, currentAssets)
          const withdrawalRatio =
            withdrawal > 0 && currentAssets > 0 ? withdrawal / currentAssets : 0
          costBasis = Math.max(0, costBasis * (1 - withdrawalRatio))
          currentAssets = Math.max(0, currentAssets - withdrawal)
          if (currentAssets <= 0) {
            runFailed = true
            currentAssets = 0
          }
        }
      } else {
        // Surplus income: reinvest surplus and increase cost basis accordingly
        const surplus = -netNeeded
        currentAssets = currentAssets + surplus
        costBasis += surplus
      }

      // Store total monthly-equivalent spending (includes annualized annual expenses)
      const monthlyEquivalentSpending = totalAnnualExpenseThisYear / 12
      spendingHistory.push(monthlyEquivalentSpending)

      // Apply inflation to expenses for next year
      const inflationFactor = sampler.nextInflationFactor(yearIndex, run, random)
      inflationIndex *= inflationFactor
      currentMonthlyExpense = baseMonthlyExpense * inflationIndex
      currentAnnualExpense = baseAnnualExpense * inflationIndex
      if (usesDynamicSpending) {
        previousDynamicAnnualSpending = totalAnnualExpenseThisYear
        dynamicSpendingInflationFactor = inflationFactor
      }

      // Check for failure (running out of money)
      if (currentAssets <= 0) {
        runFailed = true
        currentAssets = 0
      }
    }

    assetHistory.push(currentAssets)

    if (runFailed && depletionIndex === null) {
      depletionIndex = assetHistory.length - 1
    }
  }

  return {
    assetHistory,
    spendingHistory,
    inflationIndexHistory,
    failed: runFailed,
    depletionIndex,
  }
}

/**
 * Run the complete Monte Carlo simulation
 * @param params - Simulation parameters
 * @returns Complete simulation results including percentiles and success rate
 */
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

  // One entry per year offset. Flat today; the shape is what a term structure
  // or historical-sequence mode would vary.
  const roiParams = lognormalParamsFromArithmetic(
    normalizedParams.averageROI,
    normalizedParams.roiVolatility
  )
  const inflationParams = lognormalParamsFromArithmetic(
    normalizedParams.averageInflation,
    normalizedParams.inflationVolatility
  )
  const distributions: SimulationDistributions = {
    roi: ages.map(() => roiParams),
    inflation: ages.map(() => inflationParams),
  }

  const sampler = options.sampler ?? createMonteCarloSampler(distributions)
  const schedule = buildSimulationSchedule(normalizedParams)

  const assetRuns: number[][] = []
  const spendingRuns: number[][] = []
  const assetRunsReal: number[][] = []
  const spendingRunsReal: number[][] = []
  const inflationIndexRuns: number[][] = []
  let successfulRuns = 0

  const depletionCounts = new Array<number>(ages.length).fill(0)

  // Run all simulations
  for (let run = 0; run < normalizedParams.simulationRuns; run++) {
    const random = sharedRandom ?? mulberry32(mixSeed(baseSeed, run))
    const result = runSingleSimulation(normalizedParams, schedule, sampler, run, random)

    if (!result.failed) {
      successfulRuns++
    }

    assetRuns.push(result.assetHistory)
    spendingRuns.push(result.spendingHistory)
    // Deflate each path by *its own* realised inflation before percentiles are
    // taken. Deflating the nominal percentile band by an average price level
    // would mix quantiles of two different distributions; this does not.
    assetRunsReal.push(deflatePath(result.assetHistory, result.inflationIndexHistory))
    spendingRunsReal.push(deflatePath(result.spendingHistory, result.inflationIndexHistory))
    inflationIndexRuns.push(result.inflationIndexHistory)

    if (result.depletionIndex !== null && result.depletionIndex < depletionCounts.length) {
      depletionCounts[result.depletionIndex]++
    }
  }

  // Calculate percentiles
  const assetPercentiles = calculatePercentiles(assetRuns)
  const spendingPercentiles = calculatePercentiles(spendingRuns)
  const assetPercentilesReal = calculatePercentiles(assetRunsReal)
  const spendingPercentilesReal = calculatePercentiles(spendingRunsReal)
  // Median realised price level per age. Lets the UI express nominally fixed
  // amounts (a pension in euros) in today's money without re-running anything.
  const inflationIndexP50 = calculatePercentiles(inflationIndexRuns).p50

  // Calculate success rate
  const successRate = (successfulRuns / normalizedParams.simulationRuns) * 100

  let depletedSoFar = 0
  const depletionByAge = depletionCounts.map((count) => {
    depletedSoFar += count
    return depletedSoFar / normalizedParams.simulationRuns
  })

  return {
    ages,
    assetPercentiles,
    spendingPercentiles,
    assetPercentilesReal,
    spendingPercentilesReal,
    inflationIndexP50,
    successRate,
    depletionByAge,
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
 * Compute the gross withdrawal needed to cover a net cash need when capital gains are taxed.
 * - currentAssets: portfolio value after growth
 * - costBasis: remaining cost basis before withdrawal
 * - netNeeded: net cash requirement (expenses - income), non-negative
 * - taxRate: capital gains tax rate in decimal, e.g., 0.25
 *
 * Returns the gross amount to withdraw so that after tax on the gains portion,
 * the net equals netNeeded. Caps at Infinity if denom <= 0; caller should min with currentAssets.
 */
export function computeGrossWithdrawal(
  currentAssets: number,
  costBasis: number,
  netNeeded: number,
  taxRate: number
): number {
  if (netNeeded <= 0 || currentAssets <= 0) return 0
  const basisRatio = Math.min(1, Math.max(0, costBasis / currentAssets))
  const gainsRatio = 1 - basisRatio
  const denom = 1 - taxRate * gainsRatio
  if (denom <= 0) return Number.POSITIVE_INFINITY
  return netNeeded / denom
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
