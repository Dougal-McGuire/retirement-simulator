import { niceCeil } from './chartTheme'

type SpendingPoint = { spending_p90: number }
type IndexRange = { startIndex: number; endIndex: number }
export type SpendingScaleMode = 'focus' | 'full'

export function spendingDomainMax(
  data: SpendingPoint[],
  range: IndexRange,
  mode: SpendingScaleMode = 'focus'
): number | undefined {
  if (data.length === 0) return undefined
  const source =
    mode === 'full'
      ? data
      : data.slice(
          Math.max(0, Math.min(range.startIndex, data.length - 1)),
          Math.max(0, Math.min(range.endIndex, data.length - 1)) + 1
        )
  const max = source.reduce((acc, point) => Math.max(acc, point.spending_p90), 0)
  return max > 0 ? niceCeil(max * 1.05) : undefined
}
