'use client'

import { useState, useEffect, useRef } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Brush,
} from 'recharts'
import { useTranslations } from 'next-intl'
import type { ChartDataPoint } from '@/types'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { MoveHorizontal } from 'lucide-react'

export type BandPoint = ChartDataPoint & {
  assets_band_lower: number
  assets_band_height: number
}

interface AssetsChartProps {
  data: BandPoint[]
  retirementAge: number
  legalRetirementAge: number
  indexRange: { startIndex: number; endIndex: number }
  onBrushChange: (range: { startIndex?: number; endIndex?: number }) => void
  onResetZoom: () => void
  formatCurrency: (value: number) => string
  formatCurrencyShort: (value: number) => string
}

export function AssetsChart({
  data,
  retirementAge,
  legalRetirementAge,
  indexRange,
  onBrushChange,
  onResetZoom,
  formatCurrency,
  formatCurrencyShort,
}: AssetsChartProps) {
  const t = useTranslations('assetsChart')
  const isMobile = useIsMobile()
  const [showHint, setShowHint] = useState(true)
  const [hasInteracted, setHasInteracted] = useState(false)
  const chartFrameRef = useRef<HTMLDivElement>(null)
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 })

  // Check if ages are close together (within 2 years) to avoid label overlap
  const ageDifference = Math.abs(retirementAge - legalRetirementAge)
  const areAgesClose = ageDifference <= 2

  // Calculate offsets to stack labels vertically when ages are close
  // Negative offset moves label up, positive moves it down
  const retirementLabelOffset = areAgesClose ? -10 : 0 // Retirement higher
  const pensionLabelOffset = areAgesClose ? 10 : 0 // Pension lower, stacked below

  // Hide hint after user interaction or 5 seconds
  useEffect(() => {
    if (hasInteracted) {
      setShowHint(false)
    } else {
      const timer = setTimeout(() => setShowHint(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [hasInteracted])

  useEffect(() => {
    const frame = chartFrameRef.current
    if (!frame) return

    const updateReadyState = () => {
      setChartSize({
        width: Math.max(320, Math.floor(frame.clientWidth)),
        height: Math.max(240, Math.floor(frame.clientHeight)),
      })
    }

    updateReadyState()

    const resizeObserver = new ResizeObserver(updateReadyState)
    resizeObserver.observe(frame)

    return () => resizeObserver.disconnect()
  }, [])

  // Track if zoom is active
  const isZoomed = indexRange.startIndex > 0 || indexRange.endIndex < data.length - 1
  const canRenderChart = chartSize.width > 0 && chartSize.height > 0

  // Handle brush interaction
  const handleBrushChange = (range: { startIndex?: number; endIndex?: number }) => {
    setHasInteracted(true)
    onBrushChange(range)
  }

  return (
    <div className="w-full min-w-0 space-y-6 border-3 border-neo-black bg-neo-white p-4 shadow-neo sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4
            id="asset-chart-title"
            className="text-base font-extrabold uppercase tracking-[0.2em] text-neo-black sm:text-lg"
          >
            {t('title')}
          </h4>
          <p className="mt-2 max-w-2xl text-[0.68rem] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:text-[0.72rem]">
            {t('description')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 animate-pulse border-3 border-neo-black bg-neo-blue" />
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-[0.65rem]">
              {t('liveData')}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetZoom}
            aria-label={t('reset')}
            className="px-3 py-1 text-[0.7rem] sm:px-4"
            disabled={!isZoomed}
          >
            {t('reset')}
          </Button>
        </div>
      </div>

      {/* Interactive hint */}
      {showHint && !hasInteracted && (
        <div className="animate-pulse border-3 border-neo-blue bg-neo-blue/5 p-3 transition-all">
          <div className="flex items-center gap-2 text-neo-blue">
            <MoveHorizontal className="h-4 w-4 animate-bounce" aria-hidden="true" />
            <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em]">
              {t('hint.dragToZoom')}
            </span>
          </div>
        </div>
      )}

      <div
        ref={chartFrameRef}
        className="group relative h-80 w-full min-w-0"
        role="img"
        aria-label={t('aria.description')}
        aria-describedby="asset-chart-description asset-chart-controls"
        tabIndex={0}
      >
        {canRenderChart ? (
          <ComposedChart
            width={chartSize.width}
            height={chartSize.height}
            data={data}
            margin={
              isMobile
                ? { top: 10, right: 5, left: 5, bottom: 10 }
                : { top: 20, right: 20, left: 20, bottom: 20 }
            }
            className="transition-all duration-300 ease-in-out"
          >
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--neo-green)" stopOpacity={0.1} />
                <stop offset="95%" stopColor="var(--neo-green)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="0 0" opacity={0.15} stroke="var(--chart-axis)" />
            <XAxis
              dataKey="age"
              tick={{ fontSize: isMobile ? 10 : 11, fill: 'var(--chart-axis)' }}
              tickLine={{ stroke: 'var(--chart-axis)' }}
              axisLine={{ stroke: 'var(--chart-axis)' }}
              label={
                isMobile
                  ? undefined
                  : {
                      value: t('axis.age'),
                      position: 'insideBottom',
                      offset: -10,
                      style: { textAnchor: 'middle', fontSize: '12px', fill: 'var(--chart-axis)' },
                    }
              }
            />
            <YAxis
              yAxisId="assets"
              tick={{ fontSize: isMobile ? 10 : 11, fill: 'var(--chart-axis)' }}
              tickLine={{ stroke: 'var(--chart-axis)' }}
              axisLine={{ stroke: 'var(--chart-axis)' }}
              tickFormatter={formatCurrencyShort}
              label={
                isMobile
                  ? undefined
                  : {
                      value: t('axis.assets'),
                      angle: -90,
                      position: 'insideLeft',
                      style: { textAnchor: 'middle', fontSize: '12px', fill: 'var(--chart-axis)' },
                    }
              }
            />
            {!isMobile && (
              <YAxis
                yAxisId="rate"
                orientation="right"
                tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                tickLine={{ stroke: 'var(--chart-axis)' }}
                axisLine={{ stroke: 'var(--chart-axis)' }}
                tickFormatter={formatCurrencyShort}
                label={{
                  value: t('axis.monthlySavings'),
                  angle: 90,
                  position: 'insideRight',
                  style: { textAnchor: 'middle', fontSize: '12px', fill: 'var(--chart-axis)' },
                }}
                domain={[0, 'auto']}
              />
            )}
            {/* Shaded uncertainty band between P20 and P80 */}
            <Area
              type="monotone"
              dataKey="assets_band_lower"
              stackId="band"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="assets_band_height"
              stackId="band"
              stroke="none"
              fill="var(--neo-blue)"
              fillOpacity={0.18}
              name={t('legend.band')}
              isAnimationActive={false}
            />
            <Tooltip
              formatter={(value: number | string | undefined, name: string | undefined) => {
                const numeric = typeof value === 'number' ? value : Number(value ?? 0)
                return [formatCurrency(numeric), name ?? '']
              }}
              labelFormatter={(age) => t('tooltip.label', { age })}
              contentStyle={{
                backgroundColor: 'var(--neo-white)',
                border: '3px solid var(--neo-black)',
                borderRadius: '0px',
                fontSize: '12px',
                boxShadow: 'var(--shadow-neo-md)',
              }}
              labelStyle={{
                fontWeight: 800,
                color: 'var(--neo-black)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
              cursor={{ stroke: 'var(--neo-black)', strokeWidth: 1.5, strokeDasharray: '4 2' }}
            />
            <ReferenceLine
              x={retirementAge}
              stroke="var(--chart-retirement)"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{
                value: t('markers.retirement'),
                position: 'top',
                offset: retirementLabelOffset,
                style: {
                  fill: 'var(--chart-retirement)',
                  fontSize: '11px',
                  fontWeight: 'semibold',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                },
              }}
              className="transition-all duration-300 hover:stroke-red-400"
            />
            <ReferenceLine
              x={legalRetirementAge}
              stroke="var(--chart-pension)"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{
                value: t('markers.pension'),
                position: 'top',
                offset: pensionLabelOffset,
                style: {
                  fill: 'var(--chart-pension)',
                  fontSize: '11px',
                  fontWeight: 'semibold',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                },
              }}
              className="transition-all duration-300 hover:stroke-green-400"
            />
            <Line
              type="monotone"
              dataKey="assets_p10"
              stroke="var(--neo-red)"
              strokeWidth={isMobile ? 2 : 2.5}
              dot={false}
              name={t('legend.p10')}
              className="transition-all duration-1000 ease-out"
              strokeDasharray="0"
              animationBegin={0}
              animationDuration={2000}
              hide={false}
              yAxisId="assets"
            />
            {/* Hide P20 on mobile */}
            {!isMobile && (
              <Line
                type="monotone"
                dataKey="assets_p20"
                stroke="var(--neo-yellow)"
                strokeWidth={2}
                dot={false}
                name={t('legend.p20')}
                className="transition-all duration-1000 ease-out"
                strokeDasharray="4 4"
                animationBegin={100}
                animationDuration={2100}
                yAxisId="assets"
              />
            )}
            <Line
              type="monotone"
              dataKey="assets_p50"
              stroke="var(--neo-blue)"
              strokeWidth={isMobile ? 2.5 : 3.5}
              dot={false}
              name={t('legend.p50')}
              className="transition-all duration-1000 ease-out"
              strokeDasharray="0"
              animationBegin={200}
              animationDuration={2200}
              yAxisId="assets"
            />
            {/* Hide P80 on mobile */}
            {!isMobile && (
              <Line
                type="monotone"
                dataKey="assets_p80"
                stroke="var(--neo-green)"
                strokeWidth={2}
                dot={false}
                name={t('legend.p80')}
                className="transition-all duration-1000 ease-out"
                strokeDasharray="4 4"
                animationBegin={300}
                animationDuration={2300}
                yAxisId="assets"
              />
            )}
            <Line
              type="monotone"
              dataKey="assets_p90"
              stroke="var(--neo-cyan)"
              strokeWidth={isMobile ? 2 : 2.5}
              dot={false}
              name={t('legend.p90')}
              className="transition-all duration-1000 ease-out"
              strokeDasharray="0"
              animationBegin={400}
              animationDuration={2400}
              yAxisId="assets"
            />
            <Line
              type="monotone"
              dataKey="monthly_savings_p50"
              stroke="var(--chart-axis)"
              strokeWidth={isMobile ? 1.5 : 2}
              dot={false}
              name={t('legend.monthlySavings')}
              yAxisId={isMobile ? 'assets' : 'rate'}
              hide={isMobile}
            />
            <Brush
              dataKey="age"
              height={isMobile ? 18 : 22}
              stroke="var(--chart-brush)"
              travellerWidth={isMobile ? 6 : 8}
              startIndex={indexRange.startIndex}
              endIndex={indexRange.endIndex}
              onChange={handleBrushChange}
              tickFormatter={(v) => String(v)}
            />
          </ComposedChart>
        ) : (
          <div className="h-full w-full border-2 border-dashed border-neo-black bg-muted/30" />
        )}
      </div>
      <div id="asset-chart-description" className="sr-only">
        {t('aria.description')}
      </div>
      <div id="asset-chart-controls" className="sr-only">
        {t('aria.controls')}
      </div>

      {/* Zoom indicator */}
      {isZoomed && (
        <div className="mt-2 flex items-center justify-center gap-2 text-neo-blue">
          <div className="h-2 w-2 animate-pulse border-2 border-neo-blue bg-neo-blue" />
          <span className="text-[0.62rem] font-bold uppercase tracking-[0.14em]">
            {t('hint.zoomed')}
          </span>
        </div>
      )}
    </div>
  )
}
