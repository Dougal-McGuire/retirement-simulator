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

export function savedDeltaTone(delta: number): SavedDeltaTone {
  const rounded = roundDelta(delta)
  return rounded > 0 ? 'ok' : rounded < 0 ? 'danger' : 'neutral'
}
