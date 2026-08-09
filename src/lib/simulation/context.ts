import type { MarketModel, SimulationParams, SimulationResults } from '@/types'
import {
  HISTORICAL_FIRST_YEAR,
  HISTORICAL_LAST_YEAR,
  HISTORICAL_PATH_COUNT,
} from '@/lib/simulation/data/historicalMarket'

/**
 * Base seed for the engine's common-random-numbers sampling.
 *
 * Lives here rather than in the engine so that anything describing a run (the
 * dashboard, the report) can name the seed without importing the engine.
 * `engine.ts` re-exports it for backwards compatibility.
 */
export const DEFAULT_PATH_SEED = 0x5eed_c0de

/**
 * What "success" counts as for a given plan.
 *
 * - `legacyConditioned`: a run succeeds only if it never depletes **and** its
 *   real terminal assets clear `legacyTargetReal`. Strictly harder.
 * - `depletion`: plain survival — the plan has no bequest goal.
 */
export type SuccessDefinition = 'legacyConditioned' | 'depletion'

/**
 * The single description of "what the engine actually did", derived once from
 * (params, results) and rendered verbatim by every surface: the dashboard hero,
 * the stress levers, the plan comparison and the PDF report.
 *
 * Nothing downstream may re-derive a run count, a success definition or a
 * market-model label of its own — every top defect of round 4 came from exactly
 * that, with four surfaces quoting four different numbers for one simulation.
 */
export interface SimulationContext {
  /** How each year's market outcome was produced. */
  marketModel: MarketModel
  /**
   * Paths the engine really ran: `simulationRuns` under Monte Carlo, and the
   * number of available historical start years under `historical` (asking for
   * 5 000 of 125 histories would just repeat each one 40 times).
   */
  effectiveRuns: number
  /** Which question the headline `successRate` answers. */
  successDefinition: SuccessDefinition
  /** Bequest goal in today's euros; 0 when the plan has none. */
  legacyTargetReal: number
  /** Share of runs (0..100) meeting `successDefinition`. */
  successRate: number
  /** Share of runs (0..100) that merely never depleted. */
  depletionSuccessRate: number
  /** Share of runs (0..100) whose assets were exhausted before the horizon. */
  depletionRisk: number
  /** Runs meeting `successDefinition`, as a count out of `effectiveRuns`. */
  successCount: number
  /** Simulated years, taken from the age grid the engine produced. */
  horizonYears: number
  /** First and last age in the projection. */
  firstAge: number
  lastAge: number
  /** Human-readable seed identity, e.g. `crn-0x5eedc0de`. */
  seedLabel: string
  /** Wall-clock time the results were produced, when the caller knows it. */
  computedAt: number | null
  /** Stable signature of the parameters the results belong to. */
  paramsFingerprint: string
  /** False when no simulation has produced results yet. */
  hasResults: boolean
  /** Provenance of the historical series, for mode-aware copy. */
  historical: {
    pathCount: number
    firstYear: number
    lastYear: number
  }
}

/**
 * How many paths the engine runs for these parameters. The engine calls this
 * too, so a caption can never disagree with the loop that produced the number.
 */
export function effectiveRunCount(params: Pick<SimulationParams, 'marketModel' | 'simulationRuns'>) {
  return params.marketModel === 'historical' ? HISTORICAL_PATH_COUNT : params.simulationRuns
}

/** Which bar a run has to clear to count as a success. */
export function successDefinitionFor(
  params: Pick<SimulationParams, 'legacyTargetReal'>
): SuccessDefinition {
  return (params.legacyTargetReal ?? 0) > 0 ? 'legacyConditioned' : 'depletion'
}

/**
 * Fingerprint of everything the engine reads. Deliberately cheap and stable:
 * it exists to detect "these results no longer describe these parameters", not
 * to be reversible.
 *
 * Built generically from the parameter object rather than from a hand-listed
 * set of keys, so a parameter added by a later feature is covered on the day it
 * lands instead of silently falling out of every staleness check.
 */
export function simulationFingerprint(params: SimulationParams): string {
  const record = params as unknown as Record<string, unknown>

  const scalars = Object.keys(record)
    .filter((key) => !Array.isArray(record[key]))
    // `simulationRuns` is folded in as the *effective* count: switching to the
    // historical model makes the requested count irrelevant.
    .filter((key) => key !== 'simulationRuns')
    .sort()
    .map((key) => `${key}=${String(record[key])}`)
    .concat(`effectiveRuns=${effectiveRunCount(params)}`)
    .join('|')

  // Order-independent: reordering a list in the editor is not a model change.
  const lists = Object.keys(record)
    .filter((key) => Array.isArray(record[key]))
    .sort()
    .map((key) => {
      const entries = (record[key] as unknown[])
        .map((entry) =>
          entry && typeof entry === 'object'
            ? Object.entries(entry as Record<string, unknown>)
                .filter(([field]) => field !== 'name')
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([field, value]) => `${field}=${String(value)}`)
                .join(',')
            : String(entry)
        )
        .sort()
        .join(';')
      return `${key}[${entries}]`
    })
    .join('|')

  return `${scalars}#${lists}`
}

/**
 * Derive the one simulation context.
 *
 * `results` wins wherever the two disagree: the numbers on screen were produced
 * by `results.params`, so that is what the caption has to describe. `params` is
 * only the fallback for a dashboard that has not run yet.
 */
export function buildSimulationContext(
  params: SimulationParams,
  results: SimulationResults | null,
  options: { computedAt?: number | null } = {}
): SimulationContext {
  const source = results?.params ?? params
  const effectiveRuns = effectiveRunCount(source)
  const successRate = results?.successRate ?? 0
  // Results persisted before the field existed fall back to the headline rate,
  // which is exactly right when no bequest goal is set.
  const depletionSuccessRate = results?.depletionSuccessRate ?? successRate
  const lastIndex = results ? Math.max(0, results.ages.length - 1) : -1
  const depletionShare = lastIndex >= 0 ? results?.depletionByAge?.[lastIndex] : undefined
  const depletionRisk =
    typeof depletionShare === 'number' ? depletionShare * 100 : 100 - depletionSuccessRate

  const firstAge = results?.ages[0] ?? source.currentAge
  const lastAge = (lastIndex >= 0 ? results?.ages[lastIndex] : undefined) ?? source.endAge
  // Years the engine actually simulated, inclusive of both ends — not the span
  // `endAge − currentAge`, which is one short of the number of spending years.
  const horizonYears = results ? results.ages.length : Math.max(0, lastAge - firstAge + 1)

  return {
    marketModel: source.marketModel ?? 'monteCarlo',
    effectiveRuns,
    successDefinition: successDefinitionFor(source),
    legacyTargetReal: Math.max(0, source.legacyTargetReal ?? 0),
    successRate,
    depletionSuccessRate,
    depletionRisk: Math.max(0, Math.min(100, depletionRisk)),
    successCount: Math.round((successRate / 100) * effectiveRuns),
    horizonYears,
    firstAge,
    lastAge,
    seedLabel: `crn-0x${DEFAULT_PATH_SEED.toString(16)}`,
    computedAt: options.computedAt ?? null,
    paramsFingerprint: simulationFingerprint(source),
    hasResults: results !== null,
    historical: {
      pathCount: HISTORICAL_PATH_COUNT,
      firstYear: HISTORICAL_FIRST_YEAR,
      lastYear: HISTORICAL_LAST_YEAR,
    },
  }
}
