import React from 'react'
import { View, Svg, Path, Line, Text as SvgText, G, Rect } from '@react-pdf/renderer'
import { tokens } from './styles'

function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  return (value: number) => {
    const t = (value - d0) / span
    return r0 + t * (r1 - r0)
  }
}

function compactEur(value: number): string {
  if (Math.abs(value) >= 1000000) return `€${(value / 1000000).toFixed(1)}m`
  if (Math.abs(value) >= 1000) return `€${Math.round(value / 1000)}k`
  return `€${Math.round(value)}`
}

interface ProjectionChartProps {
  data: Array<{ age: number; p10: number; p50: number; p90: number }>
  width?: number
  height?: number
  locale?: string
  retireAge?: number
  pensionAge?: number
}

export function ProjectionChart({
  data,
  width = 480,
  height = 220,
  locale = 'de',
  retireAge,
  pensionAge,
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

  const margin = { top: 20, right: 14, bottom: 28, left: 54 }
  const chartWidth = width - margin.left - margin.right
  const chartHeight = height - margin.top - margin.bottom

  const ages = data.map((d) => d.age)
  const allValues = data.flatMap((d) => [d.p10, d.p50, d.p90, 0])
  const minAge = Math.min(...ages)
  const maxAge = Math.max(...ages)
  const maxValue = Math.max(...allValues) * 1.08
  const minValue = Math.min(0, Math.min(...allValues) * 1.08)

  const x = scaleLinear([minAge, maxAge], [0, chartWidth])
  const y = scaleLinear([minValue, maxValue], [chartHeight, 0])

  const toPath = (values: number[]) =>
    data
      .map((point, i) => `${i === 0 ? 'M' : 'L'} ${x(point.age).toFixed(1)} ${y(values[i]).toFixed(1)}`)
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

  const yTicks = 4
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => minValue + ((maxValue - minValue) * i) / yTicks)

  const xTicks: number[] = []
  const ageStep = maxAge - minAge > 20 ? 5 : 2
  for (let a = minAge; a <= maxAge; a += ageStep) {
    xTicks.push(a)
  }

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <G transform={`translate(${margin.left},${margin.top})`}>
          {yTickValues.map((tick) => (
            <Line
              key={`gy-${tick}`}
              x1={0}
              y1={y(tick)}
              x2={chartWidth}
              y2={y(tick)}
              stroke={tokens.colors.ink[200]}
              strokeWidth={0.5}
            />
          ))}

          {retireAge && retireAge >= minAge && retireAge <= maxAge && (
            <Line
              x1={x(retireAge)}
              y1={0}
              x2={x(retireAge)}
              y2={chartHeight}
              stroke={tokens.colors.accent[600]}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
          )}

          {pensionAge && pensionAge >= minAge && pensionAge <= maxAge && (
            <Line
              x1={x(pensionAge)}
              y1={0}
              x2={x(pensionAge)}
              y2={chartHeight}
              stroke={tokens.colors.success[600]}
              strokeWidth={1}
              strokeDasharray="2,2"
            />
          )}

          <Path d={`${areaPath.join(' ')} Z`} fill={tokens.colors.accent[100]} />
          <Path d={p10Path} stroke={tokens.colors.warning[600]} strokeWidth={1} fill="none" />
          <Path d={p90Path} stroke={tokens.colors.success[600]} strokeWidth={1} fill="none" />
          <Path d={p50Path} stroke={tokens.colors.ink[900]} strokeWidth={1.8} fill="none" />

          <Line x1={0} y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke={tokens.colors.ink[400]} strokeWidth={0.8} />
          <Line x1={0} y1={0} x2={0} y2={chartHeight} stroke={tokens.colors.ink[400]} strokeWidth={0.8} />

          {yTickValues.map((tick) => (
            <SvgText
              key={`ly-${tick}`}
              x={-6}
              y={y(tick) + 3}
              style={{ fontSize: 7, fill: tokens.colors.ink[500], textAnchor: 'end' }}
            >
              {compactEur(tick)}
            </SvgText>
          ))}

          {xTicks.map((tick) => (
            <SvgText
              key={`lx-${tick}`}
              x={x(tick)}
              y={chartHeight + 12}
              style={{ fontSize: 7, fill: tokens.colors.ink[500], textAnchor: 'middle' }}
            >
              {tick}
            </SvgText>
          ))}
        </G>

        <G transform={`translate(${margin.left + 4}, 6)`}>
          <Rect x={0} y={0} width={8} height={8} fill={tokens.colors.accent[100]} />
          <SvgText x={11} y={7} style={{ fontSize: 7, fill: tokens.colors.ink[600] }}>P10-P90</SvgText>
          <Line x1={54} y1={4} x2={66} y2={4} stroke={tokens.colors.ink[900]} strokeWidth={1.8} />
          <SvgText x={69} y={7} style={{ fontSize: 7, fill: tokens.colors.ink[600] }}>P50</SvgText>
          <Line x1={90} y1={4} x2={102} y2={4} stroke={tokens.colors.warning[600]} strokeWidth={1} />
          <SvgText x={105} y={7} style={{ fontSize: 7, fill: tokens.colors.ink[600] }}>P10</SvgText>
          <Line x1={124} y1={4} x2={136} y2={4} stroke={tokens.colors.success[600]} strokeWidth={1} />
          <SvgText x={139} y={7} style={{ fontSize: 7, fill: tokens.colors.ink[600] }}>P90</SvgText>
        </G>
      </Svg>
    </View>
  )
}

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

  const margin = { top: 8, right: 72, bottom: 16, left: 142 }
  const chartWidth = width - margin.left - margin.right
  const barHeight = 14
  const gap = 8
  const chartHeight = rows.length * (barHeight + gap)
  const maxValue = Math.max(...rows.map((row) => row.annualAmount), 1)
  const x = scaleLinear([0, maxValue], [0, chartWidth])

  return (
    <View style={{ width, height: Math.max(height, chartHeight + margin.top + margin.bottom) }}>
      <Svg
        width={width}
        height={chartHeight + margin.top + margin.bottom}
        viewBox={`0 0 ${width} ${chartHeight + margin.top + margin.bottom}`}
      >
        <G transform={`translate(${margin.left}, ${margin.top})`}>
          {rows.map((row, index) => {
            const y = index * (barHeight + gap)
            const barWidth = x(row.annualAmount)
            return (
              <G key={`${row.label}-${index}`}>
                <SvgText
                  x={-8}
                  y={y + barHeight / 2 + 3}
                  style={{ fontSize: 7, fill: tokens.colors.ink[700], textAnchor: 'end' }}
                >
                  {row.label.length > 24 ? `${row.label.slice(0, 22)}..` : row.label}
                </SvgText>

                <Rect x={0} y={y} width={Math.max(barWidth, 1)} height={barHeight} fill={tokens.colors.accent[600]} />

                <SvgText
                  x={barWidth + 6}
                  y={y + barHeight / 2 + 3}
                  style={{ fontSize: 7, fill: tokens.colors.ink[600] }}
                >
                  {compactEur(row.annualAmount)}
                </SvgText>
              </G>
            )
          })}

          <Line x1={0} y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke={tokens.colors.ink[300]} strokeWidth={0.6} />
        </G>
      </Svg>
    </View>
  )
}
