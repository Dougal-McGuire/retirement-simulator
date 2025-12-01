import React from 'react'
import { View, Svg, Path, Line, Text as SvgText, G, Rect } from '@react-pdf/renderer'
import { tokens } from './styles'

// ============================================================================
// Chart utilities
// ============================================================================

interface Point {
  x: number
  y: number
}

function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const scale = (value: number) => {
    const t = (value - d0) / (d1 - d0)
    return r0 + t * (r1 - r0)
  }
  scale.domain = domain
  scale.range = range
  return scale
}

function formatCurrency(value: number, locale: string): string {
  if (value >= 1000000) {
    return `€${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `€${(value / 1000).toFixed(0)}k`
  }
  return `€${value.toFixed(0)}`
}

// ============================================================================
// Asset Projection Chart
// ============================================================================

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
  height = 200,
  locale = 'en',
  retireAge,
  pensionAge,
}: ProjectionChartProps) {
  if (!data || data.length < 2) {
    return (
      <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
        <SvgText style={{ fontSize: 10, color: tokens.colors.ink[500] }}>No data available</SvgText>
      </View>
    )
  }

  // Chart dimensions
  const margin = { top: 20, right: 20, bottom: 30, left: 60 }
  const chartWidth = width - margin.left - margin.right
  const chartHeight = height - margin.top - margin.bottom

  // Calculate scales
  const ages = data.map((d) => d.age)
  const allValues = data.flatMap((d) => [d.p10, d.p50, d.p90])
  const minAge = Math.min(...ages)
  const maxAge = Math.max(...ages)
  const maxValue = Math.max(...allValues) * 1.1 // Add 10% padding

  const xScale = scaleLinear([minAge, maxAge], [0, chartWidth])
  const yScale = scaleLinear([0, maxValue], [chartHeight, 0])

  // Generate paths
  const createPath = (values: number[], type: 'line' | 'area' = 'line', areaBase?: number[]) => {
    const points = data.map((d, i) => ({
      x: xScale(d.age),
      y: yScale(values[i]),
    }))

    if (type === 'area' && areaBase) {
      const basePoints = data.map((d, i) => ({
        x: xScale(d.age),
        y: yScale(areaBase[i]),
      })).reverse()
      
      const allPoints = [...points, ...basePoints]
      return allPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'
    }

    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  }

  const p10Values = data.map((d) => d.p10)
  const p50Values = data.map((d) => d.p50)
  const p90Values = data.map((d) => d.p90)

  // Area path (P10 to P90)
  const areaPath = createPath(p90Values, 'area', p10Values)
  
  // Line paths
  const p50Path = createPath(p50Values)

  // Y-axis ticks
  const yTicks = [0, maxValue * 0.25, maxValue * 0.5, maxValue * 0.75, maxValue]

  // X-axis ticks (every 5 years)
  const xTicks: number[] = []
  for (let age = Math.ceil(minAge / 5) * 5; age <= maxAge; age += 5) {
    if (age >= minAge) xTicks.push(age)
  }

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <G transform={`translate(${margin.left}, ${margin.top})`}>
          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <Line
              key={`grid-${i}`}
              x1={0}
              y1={yScale(tick)}
              x2={chartWidth}
              y2={yScale(tick)}
              stroke={tokens.colors.ink[200]}
              strokeWidth={0.5}
            />
          ))}

          {/* Retirement marker */}
          {retireAge && retireAge >= minAge && retireAge <= maxAge && (
            <Line
              x1={xScale(retireAge)}
              y1={0}
              x2={xScale(retireAge)}
              y2={chartHeight}
              stroke={tokens.colors.accent[600]}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          )}

          {/* Area (P10-P90 band) */}
          <Path d={areaPath} fill={tokens.colors.ink[300]} fillOpacity={0.3} />

          {/* P50 line (median) */}
          <Path d={p50Path} stroke={tokens.colors.ink[800]} strokeWidth={2} fill="none" />

          {/* Y-axis */}
          <Line x1={0} y1={0} x2={0} y2={chartHeight} stroke={tokens.colors.ink[300]} strokeWidth={1} />
          
          {/* Y-axis labels */}
          {yTicks.map((tick, i) => (
            <SvgText
              key={`y-${i}`}
              x={-8}
              y={yScale(tick) + 3}
              fontSize={7}
              fill={tokens.colors.ink[500]}
              textAnchor="end"
            >
              {formatCurrency(tick, locale)}
            </SvgText>
          ))}

          {/* X-axis */}
          <Line x1={0} y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke={tokens.colors.ink[300]} strokeWidth={1} />
          
          {/* X-axis labels */}
          {xTicks.map((tick, i) => (
            <SvgText
              key={`x-${i}`}
              x={xScale(tick)}
              y={chartHeight + 15}
              fontSize={8}
              fill={tokens.colors.ink[500]}
              textAnchor="middle"
            >
              {tick}
            </SvgText>
          ))}

          {/* Axis titles */}
          <SvgText
            x={chartWidth / 2}
            y={chartHeight + 26}
            fontSize={8}
            fill={tokens.colors.ink[600]}
            textAnchor="middle"
          >
            {locale === 'de' ? 'Alter' : 'Age'}
          </SvgText>
        </G>

        {/* Legend */}
        <G transform={`translate(${margin.left + 10}, ${margin.top - 10})`}>
          <Rect x={0} y={0} width={10} height={10} fill={tokens.colors.ink[300]} fillOpacity={0.3} />
          <SvgText x={14} y={8} fontSize={7} fill={tokens.colors.ink[600]}>P10-P90</SvgText>
          <Line x1={50} y1={5} x2={60} y2={5} stroke={tokens.colors.ink[800]} strokeWidth={2} />
          <SvgText x={64} y={8} fontSize={7} fill={tokens.colors.ink[600]}>P50 (Median)</SvgText>
        </G>
      </Svg>
    </View>
  )
}

// ============================================================================
// Spending Breakdown Chart (Horizontal Bar)
// ============================================================================

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
  locale = 'en',
}: SpendingChartProps) {
  const allCategories = [...monthlyCategories, ...annualCategories].filter(c => c.annualAmount > 0)
  
  if (allCategories.length === 0) {
    return (
      <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
        <SvgText style={{ fontSize: 10, color: tokens.colors.ink[500] }}>
          {locale === 'de' ? 'Keine Ausgaben definiert' : 'No expenses defined'}
        </SvgText>
      </View>
    )
  }

  // Sort by amount descending
  const sorted = [...allCategories].sort((a, b) => b.annualAmount - a.annualAmount)
  const maxAmount = Math.max(...sorted.map(c => c.annualAmount))

  const margin = { top: 10, right: 80, bottom: 20, left: 120 }
  const chartWidth = width - margin.left - margin.right
  const barHeight = 16
  const barGap = 6
  const chartHeight = sorted.length * (barHeight + barGap)

  const xScale = scaleLinear([0, maxAmount], [0, chartWidth])

  // Colors for bars
  const colors = [
    tokens.colors.accent[600],
    tokens.colors.accent[500],
    tokens.colors.ink[600],
    tokens.colors.ink[500],
    tokens.colors.ink[400],
    tokens.colors.ink[300],
  ]

  return (
    <View style={{ width, height: Math.max(height, chartHeight + margin.top + margin.bottom) }}>
      <Svg width={width} height={chartHeight + margin.top + margin.bottom} viewBox={`0 0 ${width} ${chartHeight + margin.top + margin.bottom}`}>
        <G transform={`translate(${margin.left}, ${margin.top})`}>
          {sorted.map((cat, i) => {
            const y = i * (barHeight + barGap)
            const barWidth = xScale(cat.annualAmount)
            const color = colors[i % colors.length]

            return (
              <G key={cat.label}>
                {/* Label */}
                <SvgText
                  x={-8}
                  y={y + barHeight / 2 + 3}
                  fontSize={8}
                  fill={tokens.colors.ink[700]}
                  textAnchor="end"
                >
                  {cat.label.length > 18 ? cat.label.substring(0, 16) + '...' : cat.label}
                </SvgText>

                {/* Bar */}
                <Rect
                  x={0}
                  y={y}
                  width={Math.max(barWidth, 2)}
                  height={barHeight}
                  fill={color}
                />

                {/* Value */}
                <SvgText
                  x={barWidth + 8}
                  y={y + barHeight / 2 + 3}
                  fontSize={8}
                  fill={tokens.colors.ink[600]}
                >
                  {formatCurrency(cat.annualAmount, locale)}
                </SvgText>
              </G>
            )
          })}

          {/* X-axis */}
          <Line x1={0} y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke={tokens.colors.ink[300]} strokeWidth={0.5} />
        </G>
      </Svg>
    </View>
  )
}
