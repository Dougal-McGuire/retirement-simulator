import type { PercentileData, SimulationResults } from '@/types'

/**
 * Which euro the report's *projected* figures are printed in — the PDF side of
 * the dashboard's Nominal / Heutige € switch (`displayReal`).
 *
 * Inputs the user typed (savings, budget, pension, bequest goal) are today's
 * euros in either mode and are printed as entered; only figures the simulation
 * produced over time (asset percentiles and everything derived from them, the
 * bridge need) follow the switch.
 *
 * Pure and dependency-free so the client (filename) and the server (report
 * data) make the same decision.
 */
export type EuroUnit = 'nominal' | 'real'

/**
 * How real figures were obtained:
 * - `perPath`: the engine deflated every path by its own realised inflation
 *   before taking percentiles (`assetPercentilesReal`) — what the app shows.
 * - `medianIndex`: results persisted before the real series existed; the
 *   nominal percentiles are divided by the median realised price level
 *   (`inflationIndexP50`). An approximation, and the report says so.
 */
export type RealMethod = 'perPath' | 'medianIndex'

export interface ReportEuroUnit {
  /** What the viewer had selected in the app. */
  requested: EuroUnit
  /** What the report actually prints. Differs from `requested` only in the no-data fallback. */
  applied: EuroUnit
  /** Set exactly when `applied` is `'real'`. */
  realMethod?: RealMethod
}

export const NOMINAL_UNIT: ReportEuroUnit = { requested: 'nominal', applied: 'nominal' }

type RealSource = Pick<
  SimulationResults,
  'ages' | 'assetPercentiles' | 'assetPercentilesReal' | 'inflationIndexP50'
>

const PERCENTILE_KEYS = ['p10', 'p20', 'p50', 'p80', 'p90'] as const

function hasSeries(percentiles: PercentileData | undefined, length: number): boolean {
  return Boolean(percentiles && PERCENTILE_KEYS.every((key) => percentiles[key]?.length === length))
}

function usableIndex(index: readonly number[] | undefined, length: number): boolean {
  return Boolean(
    index && index.length === length && index.every((value) => Number.isFinite(value) && value > 0)
  )
}

/** How these results can be expressed in today's euros, or `null` if they cannot. */
export function realMethodFor(results: RealSource): RealMethod | null {
  const length = results.ages.length
  if (hasSeries(results.assetPercentilesReal, length)) return 'perPath'
  if (usableIndex(results.inflationIndexP50, length)) return 'medianIndex'
  return null
}

/** The unit a report generated from `results` will be printed in. */
export function resolveEuroUnit(results: RealSource, displayReal: boolean): ReportEuroUnit {
  if (!displayReal) return NOMINAL_UNIT
  const method = realMethodFor(results)
  return method
    ? { requested: 'real', applied: 'real', realMethod: method }
    : { requested: 'real', applied: 'nominal' }
}

/**
 * The asset percentiles in the resolved unit. Never mixes: either every value
 * is the engine's per-path real series, every value is deflated by the same
 * median index, or every value is nominal.
 */
export function assetPercentilesIn(results: RealSource, unit: ReportEuroUnit): PercentileData {
  if (unit.applied !== 'real') return results.assetPercentiles
  if (unit.realMethod === 'perPath' && results.assetPercentilesReal) {
    return results.assetPercentilesReal
  }
  const index = results.inflationIndexP50
  if (unit.realMethod === 'medianIndex' && index) {
    const deflate = (values: number[]) => values.map((value, i) => value / index[i])
    return {
      p10: deflate(results.assetPercentiles.p10),
      p20: deflate(results.assetPercentiles.p20),
      p50: deflate(results.assetPercentiles.p50),
      p80: deflate(results.assetPercentiles.p80),
      p90: deflate(results.assetPercentiles.p90),
    }
  }
  return results.assetPercentiles
}

/** Filename suffix for a report in today's euros; empty for a nominal one. */
export function euroUnitFilenameSuffix(unit: ReportEuroUnit, locale: string): string {
  if (unit.applied !== 'real') return ''
  return locale === 'en' ? '-todays-euros' : '-heutige-euro'
}
