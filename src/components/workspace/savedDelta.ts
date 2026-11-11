/** Pure pieces of `useSavedSuccessDelta`, kept free of React so they unit-test in Node. */

export type SavedDeltaTone = 'ok' | 'danger' | 'neutral'

/**
 * The working copy's success rate against the saved plan's, in percentage
 * points — only while there is a draft and both rates are known.
 */
export function savedSuccessDelta(input: {
  isDirty: boolean
  savedRate: number | null | undefined
  rate: number | null | undefined
}): number | null {
  const { isDirty, savedRate, rate } = input
  if (!isDirty || savedRate == null || rate == null) return null
  if (!Number.isFinite(savedRate) || !Number.isFinite(rate)) return null
  return rate - savedRate
}

/** Rounds to the one decimal the chip shows, so "±0" and the tone never disagree with the text. */
export function roundDelta(delta: number): number {
  const rounded = Math.round(delta * 10) / 10
  return Object.is(rounded, -0) ? 0 : rounded
}

/**
 * Below this many points a change of the success rate is not worth a
 * colour: at 500 runs one path is 0.2 points, and a green "+0,2" beside a
 * small edit reads as an effect that is not there.
 */
export const QUIET_DELTA_POINTS = 0.5

/** A delta that is shown as "±0", in neutral colour (small effects stay quiet). */
export function isQuietDelta(delta: number): boolean {
  return Math.abs(roundDelta(delta)) < QUIET_DELTA_POINTS
}

export function savedDeltaTone(delta: number): SavedDeltaTone {
  if (isQuietDelta(delta)) return 'neutral'
  return roundDelta(delta) > 0 ? 'ok' : 'danger'
}

/** Below this an end-assets difference rounds to "0 T€": quiet as well. */
export const QUIET_DELTA_EUROS = 500

export function moneyDeltaTone(delta: number): SavedDeltaTone {
  if (Math.abs(delta) < QUIET_DELTA_EUROS) return 'neutral'
  return delta > 0 ? 'ok' : 'danger'
}
