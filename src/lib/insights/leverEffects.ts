import type { SimulationParams, SimulationResults } from '@/types'
import { simulationFingerprint } from '@/lib/simulation/context'
import { buildScenarioParams, type ScenarioId } from '@/lib/simulation/planInsights'

/**
 * What the three stress levers do to a plan — **measured**, never estimated.
 *
 * Each lever is one full simulation of `buildScenarioParams(base.params)`,
 * i.e. the very scenarios the workspace's lever list runs: same run count,
 * and — because the engine draws from common random numbers — the same market
 * paths as the base result. The deltas are therefore the numbers the app
 * shows under "Stellschrauben", by construction.
 *
 * This replaces `estimateRecommendationUplift`, a formula
 * (`successGap × k + …`) that printed "+13–17 pp" for a lever the simulation
 * measured at +2.5 pp.
 */
export interface LeverEffect {
  id: ScenarioId
  /** Success rate (0..100) with the lever applied. */
  successRate: number
  /** Success-rate points against the base result. */
  delta: number
  /** P10 terminal assets with the lever applied, nominal. */
  worstDecileEnd: number
  /** The same in today's euros; `null` when the run carries no real series. */
  worstDecileEndReal: number | null
}

export interface LeverEffects {
  /** `simulationFingerprint` of the parameters the base result was run for. */
  fingerprint: string
  baseSuccessRate: number
  baseWorstDecileEnd: number
  baseWorstDecileEndReal: number | null
  /** In `buildScenarioParams` order. */
  levers: LeverEffect[]
}

/** How a scenario gets simulated: the worker in the app, the engine in tests. */
export type RunSimulation = (params: SimulationParams) => Promise<SimulationResults>

const last = (values: readonly number[] | undefined): number | null =>
  values && values.length > 0 ? values[values.length - 1] : null

const worstDecileEnds = (results: SimulationResults) => ({
  nominal: last(results.assetPercentiles.p10) ?? 0,
  real: last(results.assetPercentilesReal?.p10),
})

/**
 * Measurements by fingerprint, shared by everything that asks in this page
 * session: a second report of the same plan (the other language, the other
 * euro unit) costs no further simulations. Small on purpose — one entry is a
 * handful of numbers, and stale plans are of no use to anyone.
 */
const CACHE_LIMIT = 6
const cache = new Map<string, LeverEffects>()

export function cachedLeverEffects(params: SimulationParams): LeverEffects | null {
  return cache.get(simulationFingerprint(params)) ?? null
}

export function rememberLeverEffects(effects: LeverEffects): void {
  cache.delete(effects.fingerprint)
  cache.set(effects.fingerprint, effects)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** For tests. */
export function clearLeverEffectsCache(): void {
  cache.clear()
}

/**
 * Measures the levers against `base` (cached by fingerprint). The scenarios
 * run one after another — the simulation worker is a queue anyway — and a
 * failing run rejects the whole measurement: a table with two measured rows
 * and one missing would invite exactly the comparison it cannot support.
 */
export async function measureLeverEffects(
  base: SimulationResults,
  run: RunSimulation
): Promise<LeverEffects> {
  const cached = cachedLeverEffects(base.params)
  if (cached) return cached

  const baseEnds = worstDecileEnds(base)
  const levers: LeverEffect[] = []
  for (const scenario of buildScenarioParams(base.params)) {
    const results = await run(scenario.params)
    const ends = worstDecileEnds(results)
    levers.push({
      id: scenario.id,
      successRate: results.successRate,
      delta: results.successRate - base.successRate,
      worstDecileEnd: ends.nominal,
      worstDecileEndReal: ends.real,
    })
  }

  const effects: LeverEffects = {
    fingerprint: simulationFingerprint(base.params),
    baseSuccessRate: base.successRate,
    baseWorstDecileEnd: baseEnds.nominal,
    baseWorstDecileEndReal: baseEnds.real,
    levers,
  }
  rememberLeverEffects(effects)
  return effects
}
