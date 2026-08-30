export interface ChartIndexRange {
  startIndex: number
  endIndex: number
}

export function clampChartRange(range: ChartIndexRange, length: number): ChartIndexRange {
  if (length <= 0) return { startIndex: 0, endIndex: 0 }
  const startIndex = Math.max(0, Math.min(range.startIndex, length - 1))
  const endIndex = Math.max(startIndex, Math.min(range.endIndex, length - 1))
  return { startIndex, endIndex }
}

export function sliceChartRange<T>(data: T[], range: ChartIndexRange): T[] {
  if (data.length === 0) return []
  const safe = clampChartRange(range, data.length)
  return data.slice(safe.startIndex, safe.endIndex + 1)
}
