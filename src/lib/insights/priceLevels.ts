/**
 * Which price level a figure of the results belongs to.
 *
 * `inflationIndexP50[i]` is the median price level age `i`'s year **opens**
 * with — what that year's flows (spending, pensions, withdrawals) and its
 * opening balance are priced at. A balance at the **end** of age `i`'s year
 * belongs to the level the next year opens with, `index[i + 1]`: a portfolio
 * that earns exactly inflation then reads flat in today's euros.
 *
 * The engine deflates its own real series this way, path by path. This is the
 * same rule for the median-index fallback (results stored before the real
 * series existed), so the two can never sit a year of inflation apart.
 *
 * Pure and dependency-free.
 */

/**
 * The level each year closes at. The last year has no successor in the
 * series, so its closing level is extrapolated with the plan's inflation
 * assumption (or, where that is unknown, the last observed step).
 */
export function closingPriceLevels(
  openingLevels: readonly number[],
  inflationRate?: number
): number[] {
  return openingLevels.map((level, i) => {
    if (i + 1 < openingLevels.length) return openingLevels[i + 1]
    if (typeof inflationRate === 'number' && Number.isFinite(inflationRate)) {
      return level * (1 + inflationRate)
    }
    const previous = openingLevels[i - 1]
    return previous !== undefined && previous > 0 ? level * (level / previous) : level
  })
}

/** True when `index` can deflate a series of `length` years. */
export function usablePriceIndex(
  index: readonly number[] | undefined,
  length: number
): index is readonly number[] {
  return Boolean(
    index && index.length === length && index.every((value) => Number.isFinite(value) && value > 0)
  )
}
