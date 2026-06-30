'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
  ReferenceLine,
} from 'recharts'
import { useTranslations } from 'next-intl'
import type { ChartDataPoint, WithdrawalStrategy } from '@/types'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { MoveHorizontal } from 'lucide-react'

interface SpendingChartProps {
  data: ChartDataPoint[]
  retirementAge: number
  withdrawalStrategy: WithdrawalStrategy
  dsWithdrawalRate: number
  dsCeilingRate: number
  dsFloorRate: number
  indexRange: { startIndex: number; endIndex: number }
  onBrushChange: (range: { startIndex?: number; endIndex?: number }) => void
  formatCurrency: (value: number) => string
  formatCurrencyShort: (value: number) => string
  onResetZoom: () => void
}

export function SpendingChart({
  data,
  retirementAge,
  withdrawalStrategy,
  dsWithdrawalRate,
  dsCeilingRate,
  dsFloorRate,
  indexRange,
  onBrushChange,
  formatCurrency,
  formatCurrencyShort,
  onResetZoom,
}: SpendingChartProps) {
  const t = useTranslations('spendingChart')
  const isMobile = useIsMobile()
  const [showHint, setShowHint] = useState(true)
  const [hasInteracted, setHasInteracted] = useState(false)
  const chartFrameRef = useRef<HTMLDivElement>(null)
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 })

  const percentageFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    []
  )

  const formatPercentage = (value: number | null): string =>
    value == null ? '—' : percentageFormatter.format(value)

  const isDynamicSpending = withdrawalStrategy === 'vanguardDynamic'
  const strategySummary = isDynamicSpending
    ? t('explanation.dynamic.summary', {
        withdrawalRate: formatPercentage(dsWithdrawalRate),
        ceiling: formatPercentage(dsCeilingRate),
        floor: formatPercentage(dsFloorRate),
      })
    : t('explanation.fixed.summary')

  const renderTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean
    payload?: ReadonlyArray<{ payload?: ChartDataPoint }>
    label?: string | number
  }) => {
    if (!active || !payload?.length) return null

    const point = payload[0]?.payload
    if (!point) return null
    const tooltipAge = label ?? ''

    return (
      <div className="border-3 border-neo-black bg-neo-white p-3 text-[0.68rem] shadow-neo-md">
        <div className="mb-2 font-black uppercase tracking-[0.12em] text-neo-black">
          {t('tooltip.label', { age: tooltipAge })}
        </div>
        <div className="space-y-1 font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <div className="flex justify-between gap-6">
            <span>{t('legend.p10')}</span>
            <span className="text-neo-black">{formatCurrency(point.spending_p10)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span>{t('legend.p50')}</span>
            <span className="text-neo-black">{formatCurrency(point.spending_p50)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span>{t('legend.p90')}</span>
            <span className="text-neo-black">{formatCurrency(point.spending_p90)}</span>
          </div>
          <div className="flex justify-between gap-6 border-t-2 border-neo-black pt-1">
            <span>{t('legend.withdrawalRate')}</span>
            <span className="text-neo-black">{formatPercentage(point.withdrawal_rate_p50)}</span>
          </div>
        </div>
      </div>
    )
  }

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
            id="spending-chart-title"
            className="text-base font-extrabold uppercase tracking-[0.2em] text-neo-black sm:text-lg"
          >
            {t('title')}
          </h4>
          <p className="mt-2 max-w-2xl text-[0.68rem] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:text-[0.72rem]">
            {t('description')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onResetZoom}
          className="px-3 py-1 text-[0.7rem] sm:px-4"
          disabled={!isZoomed}
        >
          {t('reset')}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="border-2 border-neo-black bg-neo-blue/5 p-3">
          <div className="text-[0.58rem] font-extrabold uppercase tracking-[0.16em] text-neo-blue">
            {t('explanation.strategyLabel')}
          </div>
          <p className="mt-2 text-[0.68rem] font-semibold uppercase leading-relaxed tracking-[0.08em] text-neo-black">
            {strategySummary}
          </p>
        </div>
        <div className="border-2 border-neo-black bg-background p-3">
          <div className="text-[0.58rem] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
            {t('explanation.readingLabel')}
          </div>
          <p className="mt-2 text-[0.68rem] font-semibold uppercase leading-relaxed tracking-[0.08em] text-neo-black">
            {t('explanation.reading')}
          </p>
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
        className="relative h-80 w-full min-w-0"
        role="img"
        aria-label={t('aria.description', { retirementAge })}
        aria-describedby="spending-chart-description spending-chart-controls"
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
              <linearGradient id="spendingGradient1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--neo-yellow)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--neo-orange)" stopOpacity={0.8} />
              </linearGradient>
              <linearGradient id="spendingGradient2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--neo-purple)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--neo-pink)" stopOpacity={0.8} />
              </linearGradient>
              <linearGradient id="spendingGradient3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--neo-orange)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--neo-red)" stopOpacity={0.8} />
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
              yAxisId="spending"
              tick={{ fontSize: isMobile ? 10 : 11, fill: 'var(--chart-axis)' }}
              tickLine={{ stroke: 'var(--chart-axis)' }}
              axisLine={{ stroke: 'var(--chart-axis)' }}
              tickFormatter={formatCurrencyShort}
              label={
                isMobile
                  ? undefined
                  : {
                      value: t('axis.spending'),
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
                tickFormatter={(value) => formatPercentage(value as number)}
                label={{
                  value: t('axis.withdrawalRate'),
                  angle: 90,
                  position: 'insideRight',
                  style: { textAnchor: 'middle', fontSize: '12px', fill: 'var(--chart-axis)' },
                }}
                domain={[0, 'auto']}
              />
            )}
            <Tooltip
              content={renderTooltip}
              contentStyle={{
                backgroundColor: 'var(--neo-white)',
                border: '3px solid var(--neo-black)',
                borderRadius: '0px',
                fontSize: isMobile ? '11px' : '12px',
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
            {/* Retirement age marker */}
            <ReferenceLine
              x={retirementAge}
              stroke="var(--chart-retirement)"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={
                isMobile
                  ? undefined
                  : {
                      value: t('markers.retirement'),
                      position: 'top',
                      style: {
                        fill: 'var(--chart-retirement)',
                        fontSize: '11px',
                        fontWeight: 'semibold',
                      },
                    }
              }
            />
            <Line
              type="monotone"
              dataKey="spending_p10"
              stroke="var(--neo-yellow)"
              strokeWidth={isMobile ? 1.25 : 1.75}
              name={t('legend.p10')}
              dot={false}
              yAxisId="spending"
            />
            <Line
              type="monotone"
              dataKey="spending_p50"
              stroke="var(--neo-blue)"
              strokeWidth={isMobile ? 2 : 3}
              name={t('legend.p50')}
              dot={false}
              yAxisId="spending"
            />
            <Line
              type="monotone"
              dataKey="spending_p90"
              stroke="var(--neo-red)"
              strokeWidth={isMobile ? 1.25 : 1.75}
              name={t('legend.p90')}
              dot={false}
              yAxisId="spending"
            />
            <Line
              type="monotone"
              dataKey="withdrawal_rate_p50"
              name={t('legend.withdrawalRate')}
              stroke="var(--chart-axis)"
              strokeWidth={isMobile ? 1.5 : 2}
              yAxisId={isMobile ? 'spending' : 'rate'}
              dot={false}
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
      <div id="spending-chart-description" className="sr-only">
        {t('aria.description', { retirementAge })}
      </div>
      <div id="spending-chart-controls" className="sr-only">
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

      <p className="mt-3 text-center text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {t('legend.note')}
      </p>
    </div>
  )
}
