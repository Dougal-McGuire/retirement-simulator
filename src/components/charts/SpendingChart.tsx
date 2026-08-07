'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
} from 'recharts'
import { useTranslations } from 'next-intl'
import type { WithdrawalStrategy } from '@/types'
import type { BandPoint } from '@/components/charts/AssetsChart'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import {
  axisTick,
  brushChrome,
  chartInk,
  ChartLegend,
  ChartTooltipCard,
  fanHue,
  measureAxisWidth,
  niceCeil,
  withAlpha,
  type TooltipRow,
} from '@/components/charts/chartTheme'

interface SpendingChartProps {
  data: BandPoint[]
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

  const hue = fanHue.spending

  const renderTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean
    payload?: ReadonlyArray<{ payload?: BandPoint }>
    label?: string | number
  }) => {
    if (!active || !payload?.length) return null

    const point = payload[0]?.payload
    if (!point) return null

    const rows: TooltipRow[] = [
      {
        key: 'p90',
        label: t('tooltip.p90'),
        value: formatCurrency(point.spending_p90),
        kind: 'band',
        color: withAlpha(hue.rgb, 0.2),
      },
      {
        key: 'p50',
        label: t('tooltip.median'),
        value: formatCurrency(point.spending_p50),
        kind: 'line',
        color: hue.solid,
        emphasis: true,
      },
      {
        key: 'p10',
        label: t('tooltip.p10'),
        value: formatCurrency(point.spending_p10),
        kind: 'band',
        color: withAlpha(hue.rgb, 0.2),
      },
      {
        key: 'rate',
        label: t('legend.withdrawalRate'),
        value: formatPercentage(point.withdrawal_rate_p50),
        dividerAbove: true,
      },
    ]

    return <ChartTooltipCard title={t('tooltip.label', { age: label ?? '' })} rows={rows} />
  }

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

  const isZoomed = indexRange.startIndex > 0 || indexRange.endIndex < data.length - 1
  const canRenderChart = chartSize.width > 0 && chartSize.height > 0

  // Round the axis to a readable bound and size it to its widest tick label so
  // long compact-currency labels ("4,5 Mio. €") are never clipped.
  const domainMax = useMemo(() => {
    const max = data.reduce((acc, point) => Math.max(acc, point.spending_p90), 0)
    return max > 0 ? niceCeil(max * 1.05) : undefined
  }, [data])

  const axisWidth = useMemo(() => {
    const top = domainMax ?? 0
    const samples = [top, top * 0.75, top * 0.5, top * 0.25, 0].map(formatCurrencyShort)
    return measureAxisWidth(samples, isMobile)
  }, [domainMax, formatCurrencyShort, isMobile])

  return (
    <div className="w-full min-w-0 space-y-5 border-3 border-neo-black bg-neo-white p-4 shadow-neo sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h4
            id="spending-chart-title"
            className="text-base font-extrabold uppercase tracking-[0.16em] text-neo-black sm:text-lg"
          >
            {t('title')}
          </h4>
          <p className="mt-1.5 max-w-2xl text-xs font-medium leading-relaxed text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onResetZoom}
          className="shrink-0 px-3 py-1 text-[0.7rem] sm:px-4"
          disabled={!isZoomed}
        >
          {t('reset')}
        </Button>
      </div>

      <ChartLegend
        items={[
          { key: 'median', label: t('legend.median'), kind: 'line', color: hue.solid },
          {
            key: 'band',
            label: t('legend.band'),
            kind: 'band',
            color: withAlpha(hue.rgb, 0.2),
          },
        ]}
      />

      <div
        ref={chartFrameRef}
        className="relative h-[19rem] w-full min-w-0 sm:h-[21rem]"
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
                ? { top: 14, right: 8, left: 0, bottom: 4 }
                : { top: 18, right: 16, left: 4, bottom: 4 }
            }
          >
            <defs>
              <linearGradient id="spendingFan" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={hue.solid} stopOpacity={0.24} />
                <stop offset="100%" stopColor={hue.solid} stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={chartInk.grid} strokeWidth={1} />
            <XAxis
              dataKey="age"
              tick={axisTick(isMobile)}
              tickLine={false}
              tickMargin={8}
              minTickGap={isMobile ? 24 : 32}
              axisLine={{ stroke: chartInk.axisLine }}
            />
            <YAxis
              yAxisId="spending"
              width={axisWidth}
              tick={axisTick(isMobile)}
              tickLine={false}
              tickMargin={6}
              axisLine={false}
              tickFormatter={formatCurrencyShort}
              domain={[0, domainMax ?? 'auto']}
              allowDataOverflow={domainMax != null}
            />
            {/* P10–P90 spending band */}
            <Area
              type="monotone"
              dataKey="spending_band_lower"
              stackId="spendBand"
              stroke="none"
              fill="transparent"
              activeDot={false}
              isAnimationActive={false}
              yAxisId="spending"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="spending_band_height"
              stackId="spendBand"
              stroke="none"
              fill="url(#spendingFan)"
              name={t('legend.band')}
              activeDot={false}
              isAnimationActive={false}
              yAxisId="spending"
              legendType="none"
            />
            <Tooltip
              content={renderTooltip}
              cursor={{ stroke: chartInk.cursor, strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            {/* Band edges */}
            <Line
              type="monotone"
              dataKey="spending_p10"
              stroke={withAlpha(hue.rgb, 0.45)}
              strokeWidth={1}
              name={t('legend.p10')}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              yAxisId="spending"
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="spending_p90"
              stroke={withAlpha(hue.rgb, 0.45)}
              strokeWidth={1}
              name={t('legend.p90')}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              yAxisId="spending"
              legendType="none"
            />
            {/* Median spending */}
            <Line
              type="monotone"
              dataKey="spending_p50"
              stroke={hue.solid}
              strokeWidth={isMobile ? 2 : 2.5}
              name={t('legend.p50')}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--neo-white)', fill: hue.solid }}
              isAnimationActive={false}
              yAxisId="spending"
            />
            <Brush
              dataKey="age"
              {...brushChrome(isMobile)}
              startIndex={indexRange.startIndex}
              endIndex={indexRange.endIndex}
              onChange={onBrushChange}
              tickFormatter={(v) => String(v)}
            />
          </ComposedChart>
        ) : (
          <div className="h-full w-full border border-dashed border-neo-black/30 bg-muted/30" />
        )}
      </div>
      <div id="spending-chart-description" className="sr-only">
        {t('aria.description', { retirementAge })}
      </div>
      <div id="spending-chart-controls" className="sr-only">
        {t('aria.controls')}
      </div>

      <p className="text-right text-[0.62rem] font-medium tracking-[0.04em] text-muted-foreground">
        {isZoomed ? t('hint.zoomed') : t('hint.dragToZoom')}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="border-2 border-neo-black/60 bg-neo-purple/5 p-3.5">
          <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-neo-purple">
            {t('explanation.strategyLabel')}
          </div>
          <p className="mt-1.5 text-xs font-medium leading-relaxed text-foreground/80">
            {strategySummary}
          </p>
        </div>
        <div className="border-2 border-neo-black/60 bg-background p-3.5">
          <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
            {t('explanation.readingLabel')}
          </div>
          <p className="mt-1.5 text-xs font-medium leading-relaxed text-foreground/80">
            {t('explanation.reading')}
          </p>
        </div>
      </div>

      <p className="text-center text-[0.62rem] font-medium tracking-[0.04em] text-muted-foreground">
        {t('legend.note')}
      </p>
    </div>
  )
}
