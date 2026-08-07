import React from 'react'
import { View, Svg, Path, Line, Text as SvgText, G, Rect } from '@react-pdf/renderer'
import { tokens } from './styles'
import { fmtCompactCurrency, fmtCurrency } from '@/lib/pdf-generator/formatters'

function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  return (value: number) => {
    const t = (value - d0) / span
    return r0 + t * (r1 - r0)
  }
}

/** Round a raw step to a "nice" value (1 / 2 / 2.5 / 5 x 10^n). */
function niceStep(rawStep: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const residual = rawStep / magnitude
  let nice: number
  if (residual <= 1) nice = 1
  else if (residual <= 2) nice = 2
  else if (residual <= 2.5) nice = 2.5
  else if (residual <= 5) nice = 5
  else nice = 10
  return nice * magnitude
}

/** Generate nice, rounded axis ticks covering [min, max]. */
function niceTicks(min: number, max: number, targetCount = 5): number[] {
  if (min === max) return [min]
  const step = niceStep((max - min) / Math.max(1, targetCount))
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) {
    // Avoid -0
    ticks.push(Math.abs(v) < step / 1e6 ? 0 : v)
  }
  return ticks
}

function intlLocaleOf(locale: string): string {
  return locale === 'en' ? 'en-US' : 'de-DE'
}

/**
 * Currency label for SVG text nodes. react-pdf's SVG text renderer does not
 * handle narrow/no-break spaces (U+202F / U+00A0), so replace them with a
 * regular space.
 */
function svgCurrency(value: number, intlLocale: string): string {
  // German only abbreviates at millions ("Mio."); below that, compact notation
  // drops digit grouping (e.g. "6000 EUR"), so use the standard grouped format.
  const formatted =
    intlLocale.startsWith('de') && Math.abs(value) < 1_000_000
      ? fmtCurrency(value, intlLocale)
      : fmtCompactCurrency(value, intlLocale)
  return formatted.replace(/[\u202f\u00a0]/g, ' ')
}

/**
 * One palette for every figure in the report: the app's blue carries the data,
 * the percentile bounds are neutral dashed ink, and red is reserved for the
 * single semantic it has throughout the document — capital depletion.
 */
const CHART_COLORS = {
  band: tokens.colors.accent[100],
  median: tokens.colors.accent[600],
  bound: tokens.colors.ink[500],
  grid: tokens.colors.ink[150],
  axis: tokens.colors.ink[300],
  axisText: tokens.colors.ink[500],
  zero: tokens.colors.ink[400],
  marker: tokens.colors.brand.yellowLine,
  risk: tokens.colors.danger[600],
}

const BOUND_DASH = '2.5,2'

interface ProjectionChartProps {
  data: Array<{ age: number; p10: number; p50: number; p90: number }>
  width?: number
  height?: number
  locale?: string
  retireAge?: number
  pensionAge?: number
  /** Age at which the P10 path first hits zero, marked in red when present. */
  depletionAge?: number
}

export function ProjectionChart({
  data,
  width = 480,
  height = 220,
  locale = 'de',
  retireAge,
  pensionAge,
  depletionAge,
}: ProjectionChartProps) {
  if (!data || data.length < 2) {
    return (
      <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
        <SvgText style={{ fontSize: 10, color: tokens.colors.ink[500] }}>
          {locale === 'de' ? 'Keine Daten verfügbar' : 'No data available'}
        </SvgText>
      </View>
    )
  }

  const intlLocale = intlLocaleOf(locale)
  const isGerman = locale !== 'en'
  const margin = { top: 26, right: 12, bottom: 26, left: 58 }
  const chartWidth = width - margin.left - margin.right
  const chartHeight = height - margin.top - margin.bottom

  const ages = data.map((d) => d.age)
  const allValues = data.flatMap((d) => [d.p10, d.p50, d.p90, 0])
  const minAge = Math.min(...ages)
  const maxAge = Math.max(...ages)

  const yTickValues = niceTicks(Math.min(...allValues), Math.max(...allValues), 5)
  const minValue = yTickValues[0]
  const maxValue = yTickValues[yTickValues.length - 1]

  const x = scaleLinear([minAge, maxAge], [0, chartWidth])
  const y = scaleLinear([minValue, maxValue], [chartHeight, 0])

  const toPath = (values: number[]) =>
    data
      .map(
        (point, i) => `${i === 0 ? 'M' : 'L'} ${x(point.age).toFixed(1)} ${y(values[i]).toFixed(1)}`
      )
      .join(' ')

  const p10 = data.map((d) => d.p10)
  const p50 = data.map((d) => d.p50)
  const p90 = data.map((d) => d.p90)
  const p10Path = toPath(p10)
  const p50Path = toPath(p50)
  const p90Path = toPath(p90)

  const areaPath = [
    ...data.map((point, i) => `L ${x(point.age).toFixed(1)} ${y(p90[i]).toFixed(1)}`),
    ...[...data].reverse().map((point, i) => {
      const idx = data.length - i - 1
      return `L ${x(point.age).toFixed(1)} ${y(p10[idx]).toFixed(1)}`
    }),
  ]
  areaPath[0] = areaPath[0].replace(/^L/, 'M')

  const xTicks: number[] = []
  const ageStep = maxAge - minAge > 20 ? 5 : 2
  const firstTick = Math.ceil(minAge / ageStep) * ageStep
  for (let a = firstTick; a <= maxAge; a += ageStep) {
    xTicks.push(a)
  }
  if (!xTicks.includes(minAge)) xTicks.unshift(minAge)

  const markers: Array<{ age: number; label: string }> = []
  if (retireAge && retireAge > minAge && retireAge < maxAge) {
    markers.push({ age: retireAge, label: isGerman ? `Ruhestand ${retireAge}` : `Retire ${retireAge}` })
  }
  if (pensionAge && pensionAge > minAge && pensionAge < maxAge && pensionAge !== retireAge) {
    markers.push({ age: pensionAge, label: isGerman ? `Rente ${pensionAge}` : `Pension ${pensionAge}` })
  }

  const legendItems = [
    {
      type: 'line' as const,
      color: CHART_COLORS.median,
      width: 2,
      label: isGerman ? 'Median (P50)' : 'Median (P50)',
    },
    {
      type: 'swatch' as const,
      color: CHART_COLORS.band,
      label: isGerman
        ? 'P10–P90 Band (Stress bis Chance)'
        : 'P10–P90 band (stress to upside)',
    },
    {
      type: 'dashed' as const,
      color: CHART_COLORS.bound,
      width: 0.9,
      label: isGerman ? 'Bandgrenzen' : 'Band bounds',
    },
  ]

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <G transform={`translate(${margin.left},${margin.top})`}>
          {/* Horizontal gridlines */}
          {yTickValues.map((tick) => (
            <Line
              key={`gy-${tick}`}
              x1={0}
              y1={y(tick)}
              x2={chartWidth}
              y2={y(tick)}
              stroke={tick === 0 ? CHART_COLORS.zero : CHART_COLORS.grid}
              strokeWidth={tick === 0 ? 0.9 : 0.5}
            />
          ))}

          {/* Life-stage markers */}
          {markers.map((marker) => (
            <G key={`marker-${marker.age}`}>
              <Line
                x1={x(marker.age)}
                y1={0}
                x2={x(marker.age)}
                y2={chartHeight}
                stroke={CHART_COLORS.marker}
                strokeWidth={0.8}
                strokeDasharray="3,2"
              />
              <SvgText
                x={x(marker.age) + 4}
                y={9}
                style={{ fontSize: 6.5, fill: tokens.colors.ink[500] }}
              >
                {marker.label}
              </SvgText>
            </G>
          ))}

          {/* Confidence band + percentile lines */}
          <Path d={`${areaPath.join(' ')} Z`} fill={CHART_COLORS.band} fillOpacity={0.85} />
          <Path
            d={p10Path}
            stroke={CHART_COLORS.bound}
            strokeWidth={0.9}
            strokeDasharray={BOUND_DASH}
            fill="none"
          />
          <Path
            d={p90Path}
            stroke={CHART_COLORS.bound}
            strokeWidth={0.9}
            strokeDasharray={BOUND_DASH}
            fill="none"
          />
          <Path d={p50Path} stroke={CHART_COLORS.median} strokeWidth={2} fill="none" />

          {/* Depletion point — the only place red appears in a figure. */}
          {depletionAge !== undefined && depletionAge >= minAge && depletionAge <= maxAge && (
            <G>
              <Line
                x1={x(depletionAge)}
                y1={y(0) - 9}
                x2={x(depletionAge)}
                y2={y(0) + 9}
                stroke={CHART_COLORS.risk}
                strokeWidth={1.2}
              />
              <SvgText
                x={x(depletionAge) - 4}
                y={y(0) + 17}
                style={{ fontSize: 6, fill: CHART_COLORS.risk, textAnchor: 'end' }}
              >
                {isGerman ? `P10 erschöpft ${depletionAge}` : `P10 depleted ${depletionAge}`}
              </SvgText>
            </G>
          )}

          {/* Axes */}
          <Line
            x1={0}
            y1={chartHeight}
            x2={chartWidth}
            y2={chartHeight}
            stroke={CHART_COLORS.axis}
            strokeWidth={0.8}
          />

          {/* Y labels */}
          {yTickValues.map((tick) => (
            <SvgText
              key={`ly-${tick}`}
              x={-6}
              y={y(tick) + 2.5}
              style={{ fontSize: 6.5, fill: CHART_COLORS.axisText, textAnchor: 'end' }}
            >
              {svgCurrency(tick, intlLocale)}
            </SvgText>
          ))}

          {/* X labels */}
          {xTicks.map((tick) => (
            <SvgText
              key={`lx-${tick}`}
              x={x(tick)}
              y={chartHeight + 11}
              style={{ fontSize: 6.5, fill: CHART_COLORS.axisText, textAnchor: 'middle' }}
            >
              {tick}
            </SvgText>
          ))}
          <SvgText
            x={chartWidth}
            y={chartHeight + 21}
            style={{ fontSize: 6, fill: tokens.colors.ink[400], textAnchor: 'end' }}
          >
            {isGerman ? 'Alter' : 'Age'}
          </SvgText>
        </G>

        {/* Legend */}
        <G transform={`translate(${margin.left}, 6)`}>
          {(() => {
            let offset = 0
            return legendItems.map((item, index) => {
              const start = offset
              const labelWidth = item.label.length * 3.4
              offset += 16 + labelWidth + 12
              return (
                <G key={index} transform={`translate(${start}, 0)`}>
                  {item.type === 'swatch' ? (
                    <Rect x={0} y={0} width={9} height={7} fill={item.color} />
                  ) : (
                    <Line x1={0} y1={3.5} x2={11} y2={3.5} stroke={item.color} strokeWidth={item.width} />
                  )}
                  <SvgText x={14} y={6} style={{ fontSize: 6.5, fill: tokens.colors.ink[600] }}>
                    {item.label}
                  </SvgText>
                </G>
              )
            })
          })()}
        </G>
      </Svg>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Cover sparkline — minimal band + median line, start/end labels only
// ---------------------------------------------------------------------------

interface CoverSparklineProps {
  data: Array<{ age: number; p10: number; p50: number; p90: number }>
  width?: number
  height?: number
  locale?: string
}

export function CoverSparkline({ data, width = 473, height = 190, locale = 'de' }: CoverSparklineProps) {
  if (!data || data.length < 2) return null

  const intlLocale = intlLocaleOf(locale)
  const margin = { top: 16, right: 52, bottom: 16, left: 6 }
  const chartWidth = width - margin.left - margin.right
  const chartHeight = height - margin.top - margin.bottom

  const ages = data.map((d) => d.age)
  const values = data.flatMap((d) => [d.p10, d.p50, d.p90, 0])
  const minAge = Math.min(...ages)
  const maxAge = Math.max(...ages)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values) * 1.04

  const x = scaleLinear([minAge, maxAge], [0, chartWidth])
  const y = scaleLinear([minValue, maxValue], [chartHeight, 0])

  const toPath = (get: (d: CoverSparklineProps['data'][number]) => number) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.age).toFixed(1)} ${y(get(d)).toFixed(1)}`).join(' ')

  const bandPath = [
    ...data.map((d) => `L ${x(d.age).toFixed(1)} ${y(d.p90).toFixed(1)}`),
    ...[...data].reverse().map((d) => `L ${x(d.age).toFixed(1)} ${y(d.p10).toFixed(1)}`),
  ]
  bandPath[0] = bandPath[0].replace(/^L/, 'M')

  const last = data[data.length - 1]

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <G transform={`translate(${margin.left},${margin.top})`}>
          {y(0) <= chartHeight && y(0) >= 0 && (
            <Line x1={0} y1={y(0)} x2={chartWidth} y2={y(0)} stroke={tokens.colors.ink[200]} strokeWidth={0.7} />
          )}
          <Path d={`${bandPath.join(' ')} Z`} fill={tokens.colors.accent[100]} fillOpacity={0.9} />
          <Path d={toPath((d) => d.p50)} stroke={tokens.colors.accent[700]} strokeWidth={1.8} fill="none" />

          {/* End-point label: median at horizon */}
          <SvgText
            x={chartWidth + 5}
            y={y(last.p50) + 2}
            style={{ fontSize: 6.5, fill: tokens.colors.ink[700] }}
          >
            {svgCurrency(last.p50, intlLocale)}
          </SvgText>

          {/* Age labels at both ends */}
          <SvgText x={0} y={chartHeight + 11} style={{ fontSize: 6.5, fill: tokens.colors.ink[400] }}>
            {minAge}
          </SvgText>
          <SvgText
            x={chartWidth}
            y={chartHeight + 11}
            style={{ fontSize: 6.5, fill: tokens.colors.ink[400], textAnchor: 'end' }}
          >
            {maxAge}
          </SvgText>
        </G>
      </Svg>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Spending breakdown — horizontal bars with full-width tracks
// ---------------------------------------------------------------------------

interface SpendingChartProps {
  monthlyCategories: Array<{ label: string; annualAmount: number; share: number }>
  annualCategories: Array<{ label: string; annualAmount: number; share: number }>
  width?: number
  height?: number
  locale?: string
}

export function SpendingChart({
  monthlyCategories,
  annualCategories,
  width = 480,
  height = 180,
  locale = 'de',
}: SpendingChartProps) {
  const intlLocale = intlLocaleOf(locale)
  const rows = [...monthlyCategories, ...annualCategories]
    .filter((entry) => entry.annualAmount > 0)
    .sort((a, b) => b.annualAmount - a.annualAmount)
    .slice(0, 8)

  if (!rows.length) {
    return (
      <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
        <SvgText style={{ fontSize: 10, color: tokens.colors.ink[500] }}>
          {locale === 'de' ? 'Keine Ausgaben vorhanden' : 'No expenses available'}
        </SvgText>
      </View>
    )
  }

  const margin = { top: 4, right: 58, bottom: 4, left: 118 }
  const chartWidth = width - margin.left - margin.right
  const barHeight = 11
  const gap = 8
  const chartHeight = rows.length * (barHeight + gap) - gap
  const totalHeight = chartHeight + margin.top + margin.bottom
  const maxValue = Math.max(...rows.map((row) => row.annualAmount), 1)
  const x = scaleLinear([0, maxValue], [0, chartWidth])

  return (
    <View style={{ width, height: totalHeight }}>
      <Svg width={width} height={totalHeight} viewBox={`0 0 ${width} ${totalHeight}`}>
        <G transform={`translate(${margin.left}, ${margin.top})`}>
          {rows.map((row, index) => {
            const yPos = index * (barHeight + gap)
            const barWidth = Math.max(x(row.annualAmount), 1)
            return (
              <G key={`${row.label}-${index}`}>
                <SvgText
                  x={-8}
                  y={yPos + barHeight / 2 + 2.5}
                  style={{ fontSize: 7, fill: tokens.colors.ink[700], textAnchor: 'end' }}
                >
                  {row.label.length > 24 ? `${row.label.slice(0, 22)}…` : row.label}
                </SvgText>

                {/* Track */}
                <Rect
                  x={0}
                  y={yPos}
                  width={chartWidth}
                  height={barHeight}
                  rx={2}
                  fill={tokens.colors.ink[100]}
                />
                {/* Bar */}
                <Rect
                  x={0}
                  y={yPos}
                  width={barWidth}
                  height={barHeight}
                  rx={2}
                  fill={index === 0 ? tokens.colors.accent[700] : tokens.colors.accent[500]}
                />

                <SvgText
                  x={chartWidth + 8}
                  y={yPos + barHeight / 2 + 2.5}
                  style={{ fontSize: 7, fill: tokens.colors.ink[600] }}
                >
                  {svgCurrency(row.annualAmount, intlLocale)}
                </SvgText>
              </G>
            )
          })}
        </G>
      </Svg>
    </View>
  )
}
