import type { SimulationParams } from '@/types'
import {
  DEFAULT_PATH_SEED,
  observedSuccessPercent,
  comparisonRunCount,
  effectiveRunCount,
} from './context'
import {
  buildEquityGlidePath,
  buildSimulationDistributions,
  buildSimulationSchedule,
  createHistoricalSampler,
  createMonteCarloSampler,
  mixSeed,
  mulberry32,
  normalizeSimulationParams,
  runSingleSimulation,
  type MarketSampler,
} from './engine'

export interface AgePlannerTargets {
  monthlyBudget: number
  probability: number
  endAge: number
  maxRetirementAge?: number
  final?: boolean
}

export interface RetirementAgeRow {
  age: number
  successRate: number
  /** Highest funded multiple of €10; null when even a zero budget misses the goal. */
  monthlyLimit: number | null
  /** Gain from retiring at this age instead of the preceding age. */
  extraYearGain: number | null
}

export interface RetirementAgeComparison {
  rows: RetirementAgeRow[]
  earliestAge: number | null
  paths: number
}

const BUDGET_STEP = 10

/**
 * Only the spending target changes during the search for a given retirement age.
 * Cache the same factors as the dashboard (including a changed retirement-age
 * glide path) so every trial reuses its exact scenario without redrawing it.
 */
function cacheMarket(params: SimulationParams, runs: number): MarketSampler {
  const years = params.endAge - params.currentAge + 1
  const sampler =
    params.marketModel === 'historical'
      ? createHistoricalSampler(buildEquityGlidePath(params, years))
      : createMonteCarloSampler(buildSimulationDistributions(params, years))
  const growth = new Float64Array(runs * years)
  const inflation = new Float64Array(runs * years)
  for (let run = 0; run < runs; run++) {
    const random = mulberry32(mixSeed(DEFAULT_PATH_SEED, run))
    for (let year = 0; year < years; year++) {
      const i = run * years + year
      growth[i] = sampler.nextGrowthFactor(year, run, random)
      inflation[i] = sampler.nextInflationFactor(year, run, random)
    }
  }
  return {
    nextGrowthFactor: (year, run) => growth[run * years + year],
    nextInflationFactor: (year, run) => inflation[run * years + year],
  }
}

function supportedBudget(qualifies: (budget: number) => boolean): number | null {
  if (!qualifies(0)) return null
  let low = 0
  let high = 256 // Units of €10/month.
  const maxUnits = Math.floor(Number.MAX_SAFE_INTEGER / BUDGET_STEP)
  while (qualifies(high * BUDGET_STEP)) {
    low = high
    if (high === maxUnits) return high * BUDGET_STEP
    high = Math.min(maxUnits, high * 2)
  }
  while (high - low > 1) {
    const mid = low + Math.floor((high - low) / 2)
    if (qualifies(mid * BUDGET_STEP)) low = mid
    else high = mid
  }
  return low * BUDGET_STEP
}

export function compareRetirementAges(
  original: SimulationParams,
  targets: AgePlannerTargets,
  onProgress?: (done: number, total: number) => void
): RetirementAgeComparison {
  const plan = normalizeSimulationParams(original)
  const lastAge = targets.maxRetirementAge ?? Math.min(targets.endAge, 100)
  if (
    !Number.isInteger(lastAge) ||
    lastAge < plan.currentAge ||
    lastAge > Math.min(targets.endAge, 100) ||
    !Number.isFinite(targets.monthlyBudget) ||
    targets.monthlyBudget < 0 ||
    !Number.isFinite(targets.probability) ||
    targets.probability <= 0 ||
    targets.probability > 100 ||
    !Number.isInteger(targets.endAge) ||
    targets.endAge < plan.currentAge ||
    targets.endAge > 120
  ) {
    throw new RangeError('Invalid age planner targets')
  }
  const paths =
    plan.marketModel === 'historical'
      ? effectiveRunCount(plan)
      : comparisonRunCount([plan], targets.final ?? false)
  const successesNeeded = Math.ceil((targets.probability * paths) / 100)
  // Removing the budget from the *expanded schedule* removes every ordinary
  // expense (also fixed/growing ones) while preserving taxes, pensions and all
  // scheduled expenses. One fixed real target then replaces that whole budget.
  const params = {
    ...plan,
    retirementAge: plan.currentAge,
    endAge: targets.endAge,
    withdrawalStrategy: 'fixedReal' as const,
  }
  const schedule = buildSimulationSchedule(params)
  schedule.baseAnnualExpense = 0
  schedule.flows.baselineExtraLinked.fill(0)
  schedule.flows.baselineExtraFixed.fill(0)
  const rows: RetirementAgeRow[] = []
  let earliestAge: number | null = null
  for (let age = params.currentAge; age <= lastAge; age++) {
    params.retirementAge = age
    schedule.effectiveRetirementAge = age
    const sampler = cacheMarket(params, paths)
    const countSuccesses = (budget: number, stopAtDecision: boolean) => {
      schedule.baseMonthlyExpense = budget
      let successes = 0
      for (let run = 0; run < paths; run++) {
        // Cached factors never read the RNG. Only record the funding outcome.
        const path = runSingleSimulation(params, schedule, sampler, run, Math.random, false)
        if (!path.failed && path.terminalAssetsReal >= params.legacyTargetReal) successes++
        if (
          stopAtDecision &&
          (successes >= successesNeeded || successes + paths - run - 1 < successesNeeded)
        )
          break
      }
      return successes
    }
    const hits = countSuccesses(targets.monthlyBudget, false)
    const monthlyLimit = supportedBudget(
      (budget) => countSuccesses(budget, true) >= successesNeeded
    )
    const previous = rows.at(-1)?.monthlyLimit
    rows.push({
      age,
      monthlyLimit,
      successRate: observedSuccessPercent(hits, paths),
      extraYearGain: monthlyLimit != null && previous != null ? monthlyLimit - previous : null,
    })
    if (earliestAge === null && hits >= successesNeeded) earliestAge = age
    onProgress?.(rows.length, lastAge - params.currentAge + 1)
  }
  return { rows, earliestAge, paths }
}
