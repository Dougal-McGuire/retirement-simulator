/**
 * Pure geometry for the compact fan chart (design handoff, screens 1b/1c).
 *
 * The chart is a fixed 1000×300 viewBox stretched to its container
 * (`preserveAspectRatio="none"` + `vector-effect: non-scaling-stroke`), so all
 * math here works in viewBox units and percentages — no DOM measuring.
 */

export const FAN_W = 1000
export const FAN_H = 300

export interface FanGridLine {
  /** viewBox y of the horizontal rule. */
  y: number
  /** CSS `top` of the floating label, as a percentage string. */
  topPct: string
  /** Euro value the rule marks (raw; the caller formats it). */
  value: number
}

export interface FanAxisTick {
  /** CSS `left` as a percentage string. */
  leftPct: string
  age: number
}

export interface FanGeometry {
  ymax: number
  /** Index in the age series → viewBox x. */
  x: (index: number) => number
  /** Euro value → viewBox y, clamped to the plot. */
  y: (value: number) => number
  /** Age → CSS left percentage (for vertical markers/labels). */
  agePct: (age: number) => string
  /** Age → viewBox x (for vertical marker lines). */
  ageX: (age: number) => number
  line: (series: number[]) => string
  band: (lower: number[], upper: number[]) => string
  gridLines: FanGridLine[]
  axisTicks: FanAxisTick[]
}

/** A grid step that yields 2–6 rules: 1-2-5 ladder starting at 100 k€. */
function pickGridStep(ymax: number): number {
  const ladder = [
    100_000, 200_000, 250_000, 500_000, 1_000_000, 2_000_000, 2_500_000, 5_000_000, 10_000_000,
    20_000_000, 50_000_000, 100_000_000,
  ]
  for (const step of ladder) {
    if (ymax / step <= 6) return step
  }
  return ladder[ladder.length - 1]
}

export function buildFanGeometry(ages: number[], allSeries: number[][]): FanGeometry {
  const n = Math.max(2, ages.length)
  const firstAge = ages[0] ?? 0
  const lastAge = ages[ages.length - 1] ?? firstAge + 1
  const span = Math.max(1, lastAge - firstAge)

  let peak = 0
  for (const series of allSeries) {
    for (const value of series) {
      if (Number.isFinite(value) && value > peak) peak = value
    }
  }
  // 6% headroom, mirroring the mockup, and a floor so an empty result set
  // still yields a drawable scale.
  const ymax = Math.max(1, peak) * 1.06

  const x = (index: number) => (index / (n - 1)) * FAN_W
  const y = (value: number) => FAN_H - (Math.max(0, Math.min(value, ymax)) / ymax) * FAN_H
  const ageX = (age: number) => ((age - firstAge) / span) * FAN_W
  const agePct = (age: number) => (((age - firstAge) / span) * 100).toFixed(1) + '%'

  const line = (series: number[]) =>
    'M' + series.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' L')

  // Upper edge left→right, then lower edge right→left, closed.
  const band = (lower: number[], upper: number[]) =>
    line(upper) +
    ' L' +
    lower
      .map((_, index) => {
        const i = lower.length - 1 - index
        return `${x(i).toFixed(1)},${y(lower[i]).toFixed(1)}`
      })
      .join(' L') +
    ' Z'

  const step = pickGridStep(ymax)
  const gridLines: FanGridLine[] = []
  for (let value = step; value < ymax; value += step) {
    const gy = y(value)
    gridLines.push({ y: gy, topPct: ((gy / FAN_H) * 100).toFixed(2) + '%', value })
  }

  const axisTicks: FanAxisTick[] = []
  for (let age = Math.ceil(firstAge / 5) * 5; age <= lastAge; age += 5) {
    axisTicks.push({ leftPct: agePct(age), age })
  }

  return { ymax, x, y, agePct, ageX, line, band, gridLines, axisTicks }
}

/**
 * Sparkline path for the KPI strip: 60×22 viewBox, 1-unit inset, normalised to
 * the series' own min/max (a flat series draws a flat line mid-band).
 */
export function sparklinePath(values: number[]): string {
  if (values.length === 0) return ''
  if (values.length === 1) return sparklinePath([values[0], values[0]])
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min
  return (
    'M' +
    values
      .map((value, index) => {
        const px = (index / (values.length - 1)) * 58 + 1
        const py = range > 0 ? 20 - ((value - min) / range) * 17 : 11
        return `${px.toFixed(1)},${py.toFixed(1)}`
      })
      .join(' L')
  )
}
