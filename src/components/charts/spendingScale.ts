import { niceCeil } from './chartTheme'

type SpendingPoint = { spending_p50: number; spending_p90: number }
type IndexRange = { startIndex: number; endIndex: number }
export type SpendingScaleMode = 'focus' | 'full'

export function spendingDomainMax(
  data: SpendingPoint[],
  range: IndexRange,
  mode: SpendingScaleMode = 'focus'
): number | undefined {
  if (data.length === 0) return undefined
  const startIndex = Math.max(0, Math.min(range.startIndex, data.length - 1))
  const endIndex = Math.max(startIndex, Math.min(range.endIndex, data.length - 1))
  const visible = data.slice(startIndex, endIndex + 1)
  const max = visible.reduce(
    (acc, point) => Math.max(acc, mode === 'focus' ? point.spending_p50 : point.spending_p90),
    0
  )
  return max > 0 ? niceCeil(max * 1.05) : undefined
}
