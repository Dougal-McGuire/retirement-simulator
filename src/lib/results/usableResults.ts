import type { PercentileData, SimulationResults } from '@/types'

/**
 * Whether a results object can be drawn.
 *
 * Results are persisted to localStorage and rehydrated without validation, so
 * a payload from an older build, a hand-edited one or one cut short by a full
 * quota reaches the charts as-is — and a missing series there is a render
 * crash on every reload. The workspace treats anything that fails this check
 * as "no results": it shows the skeleton and starts a fresh run, which
 * replaces the bad payload.
 *
 * Only what every consumer relies on is checked: the age axis, the five
 * nominal percentile series over it (finite numbers — a NaN is persisted as
 * `null`), the success rate and the params the run describes. Optional series
 * (real terms, cash-flow means, sample paths) are checked for shape when they
 * are present, since their consumers fall back only when they are *absent*.
 */
export function isUsableResults(value: unknown): value is SimulationResults {
  if (!isObject(value)) return false
  // Results objects are immutable once a run lands; check each one once.
  const known = verdicts.get(value)
  if (known !== undefined) return known
  const verdict = checkResults(value)
  verdicts.set(value, verdict)
  return verdict
}

const verdicts = new WeakMap<object, boolean>()

function checkResults(value: object): boolean {
  const results = value as Partial<SimulationResults>
  const ages = results.ages
  if (!Array.isArray(ages) || ages.length === 0 || !ages.every(isFiniteNumber)) return false
  const length = ages.length
  if (!isFiniteNumber(results.successRate)) return false
  if (!isObject(results.params)) return false
  if (!Array.isArray((results.params as { cashFlows?: unknown }).cashFlows)) return false
  if (!isPercentileData(results.assetPercentiles, length)) return false
  if (!isPercentileData(results.spendingPercentiles, length)) return false
  if (
    results.assetPercentilesReal !== undefined &&
    !isPercentileData(results.assetPercentilesReal, length)
  )
    return false
  if (
    results.spendingPercentilesReal !== undefined &&
    !isPercentileData(results.spendingPercentilesReal, length)
  )
    return false
  for (const key of ['cashFlowMeans', 'cashFlowMeansReal'] as const) {
    const rows = results[key]
    if (rows === undefined) continue
    if (!Array.isArray(rows) || rows.length !== length) return false
    if (
      !rows.every(
        (row) => isObject(row) && isFiniteNumber((row as { expenses?: unknown }).expenses)
      )
    )
      return false
  }
  for (const key of ['sampleAssetPaths', 'sampleAssetPathsReal'] as const) {
    const paths = results[key]
    if (paths === undefined) continue
    if (!Array.isArray(paths) || !paths.every((path) => Array.isArray(path))) return false
  }
  for (const key of ['depletionByAge', 'inflationIndexP50'] as const) {
    const series = results[key]
    if (series === undefined) continue
    if (!Array.isArray(series)) return false
  }
  return true
}

const PERCENTILE_KEYS = ['p10', 'p20', 'p50', 'p80', 'p90'] as const

function isPercentileData(value: unknown, length: number): value is PercentileData {
  if (!isObject(value)) return false
  return PERCENTILE_KEYS.every((key) => {
    const series = (value as Record<string, unknown>)[key]
    return Array.isArray(series) && series.length === length && series.every(isFiniteNumber)
  })
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** `results` when they can be drawn, `null` otherwise. */
export function usableResultsOrNull(value: unknown): SimulationResults | null {
  return isUsableResults(value) ? value : null
}
