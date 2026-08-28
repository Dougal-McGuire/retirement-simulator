'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import type { ChartDataPoint, SimulationParams } from '@/types'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import {
  axisTick,
  brushChrome,
  chartInk,
  ChartLegend,
  ChartTooltipCard,
  fanDomainMax,
  fanHue,
  measureAxisWidth,
  withAlpha,
  type TooltipRow,
} from '@/components/charts/chartTheme'
import { cn } from '@/lib/utils'
import { InfoTip } from '@/components/ui/info-tip'

export type BandPoint = ChartDataPoint & {
  assets_band_lower: number
  assets_band_height: number
  assets_outer_lower: number
  assets_outer_height: number
  spending_band_lower: number
  spending_band_height: number
}

interface AssetsChartProps {
  data: BandPoint[]
  retirementAge: number
  legalRetirementAge: number
  p10DepletionAge?: number | null
  p50DepletionAge?: number | null
  indexRange: { startIndex: number; endIndex: number }
  onBrushChange: (range: { startIndex?: number; endIndex?: number }) => void
  onResetZoom: () => void
  formatCurrency: (value: number) => string
  formatCurrencyShort: (value: number) => string
  /** Extra controls rendered in the section header, left of the scale switch. */
  headerControls?: React.ReactNode
  /** Changes the caption: historical mode replays real years rather than sampling. */
  marketModel?: SimulationParams['marketModel']
}

export function AssetsChart({
  data,
  retirementAge,
  legalRetirementAge,
  p10DepletionAge = null,
  p50DepletionAge = null,
  indexRange,
  onBrushChange,
  onResetZoom,
  formatCurrency,
  formatCurrencyShort,
  headerControls,
  marketModel = 'monteCarlo',
}: AssetsChartProps) {
  const t = useTranslations('assetsChart')
  const isMobile = useIsMobile()
  const chartFrameRef = useRef<HTMLDivElement>(null)
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 })

  // Check if ages are close together (within 2 years) to avoid label overlap
  const areAgesClose = Math.abs(retirementAge - legalRetirementAge) <= 2
  const retirementLabelOffset = areAgesClose ? -12 : -4
  const pensionLabelOffset = areAgesClose ? 8 : -4

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

  const handleBrushChange = (range: { startIndex?: number; endIndex?: number }) => {
    onBrushChange(range)
  }

  const brushAriaLabel = t('aria.brush', {
    startAge: data[Math.max(0, Math.min(indexRange.startIndex, data.length - 1))]?.age ?? '',
    endAge: data[Math.max(0, Math.min(indexRange.endIndex, data.length - 1))]?.age ?? '',
  })

  // Axis scaling: a handful of very optimistic P90 paths would otherwise push
  // the axis to several times the median and squash the whole likely range into
  // the bottom quarter of the plot. "Focus" scales to P20–P80 with headroom.
  const [focusMedian, setFocusMedian] = useState(true)

  const visible = useMemo(() => {
    const start = Math.max(0, Math.min(indexRange.startIndex, data.length - 1))
    const end = Math.max(start, Math.min(indexRange.endIndex, data.length - 1))
    return data.slice(start, end + 1)
  }, [data, indexRange.startIndex, indexRange.endIndex])

  const { medianMax, innerMax, outerMax } = useMemo(
    () =>
      visible.reduce(
        (acc, point) => ({
          medianMax: Math.max(acc.medianMax, point.assets_p50),
          innerMax: Math.max(acc.innerMax, point.assets_p80),
          outerMax: Math.max(acc.outerMax, point.assets_p90),
        }),
        { medianMax: 0, innerMax: 0, outerMax: 0 }
      ),
    [visible]
  )

  const domainMax = fanDomainMax(medianMax, innerMax, outerMax, focusMedian)
  const isClipped = domainMax != null && outerMax > domainMax * 1.001

  const axisWidth = useMemo(() => {
    const top = domainMax ?? outerMax
    const samples = [top, top * 0.75, top * 0.5, top * 0.25, 0].map(formatCurrencyShort)
    return measureAxisWidth(samples, isMobile)
  }, [domainMax, outerMax, formatCurrencyShort, isMobile])

  const hue = fanHue.assets
  const markerLabelStyle = {
    fill: chartInk.marker,
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  }

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
        value: formatCurrency(point.assets_p90),
        kind: 'band',
        color: withAlpha(hue.rgb, 0.16),
      },
      {
        key: 'p80',
        label: t('tooltip.p80'),
        value: formatCurrency(point.assets_p80),
        kind: 'band',
        color: withAlpha(hue.rgb, 0.34),
      },
      {
        key: 'p50',
        label: t('tooltip.median'),
        value: formatCurrency(point.assets_p50),
        kind: 'line',
        color: hue.solid,
        emphasis: true,
      },
      {
        key: 'p20',
        label: t('tooltip.p20'),
        value: formatCurrency(point.assets_p20),
        kind: 'band',
        color: withAlpha(hue.rgb, 0.34),
      },
      {
        key: 'p10',
        label: t('tooltip.p10'),
        value: formatCurrency(point.assets_p10),
        kind: 'band',
        color: withAlpha(hue.rgb, 0.16),
      },
    ]

    if (point.monthly_savings_p50 != null) {
      rows.push({
        key: 'savings',
        label: t('tooltip.savings'),
        value: formatCurrency(point.monthly_savings_p50),
        dividerAbove: true,
      })
    }

    return <ChartTooltipCard title={t('tooltip.label', { age: label ?? '' })} rows={rows} />
  }

  return (
    <div className="w-full min-w-0 space-y-5 border-3 border-neo-black bg-neo-white p-4 shadow-neo sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <h4
            id="asset-chart-title"
            className="text-base font-extrabold uppercase tracking-[0.16em] text-neo-black sm:text-lg"
          >
            {t('title')}
          </h4>
          <InfoTip
            content={marketModel === 'historical' ? t('descriptionHistorical') : t('description')}
            label={t('title')}
            side="bottom"
            descriptionId="asset-chart-description"
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {headerControls}
          <div
            role="group"
            aria-label={t('scale.label')}
            className="flex items-center border-2 border-neo-black bg-neo-white"
          >
            {(
              [
                { key: 'focus', label: t('scale.focus'), active: focusMedian },
                { key: 'full', label: t('scale.full'), active: !focusMedian },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFocusMedian(option.key === 'focus')}
                aria-pressed={option.active}
                className={cn(
                  'px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] transition-neo',
                  option.active
                    ? 'bg-neo-black text-neo-white'
                    : 'bg-neo-white text-muted-foreground hover:text-neo-black'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetZoom}
            aria-label={t('reset')}
            className="shrink-0 px-3 py-1 text-[0.7rem] sm:px-4"
            disabled={!isZoomed}
          >
            {t('reset')}
          </Button>
        </div>
      </div>

      <ChartLegend
        items={[
          { key: 'median', label: t('legend.median'), kind: 'line', color: hue.solid },
          {
            key: 'likely',
            label: t('legend.likelyRange'),
            kind: 'band',
            color: withAlpha(hue.rgb, 0.34),
          },
          {
            key: 'full',
            label: t('legend.fullRange'),
            kind: 'band',
            color: withAlpha(hue.rgb, 0.16),
          },
          { key: 'events', label: t('legend.events'), kind: 'dash', color: chartInk.marker },
        ]}
      />

      <div
        ref={chartFrameRef}
        className="group relative h-[19rem] w-full min-w-0 sm:h-[23rem]"
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
                ? { top: 14, right: 8, left: 0, bottom: 4 }
                : { top: 18, right: 16, left: 4, bottom: 4 }
            }
          >
            <defs>
              <linearGradient id="assetsFanOuter" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={hue.solid} stopOpacity={0.16} />
                <stop offset="100%" stopColor={hue.solid} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="assetsFanInner" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={hue.solid} stopOpacity={0.3} />
                <stop offset="100%" stopColor={hue.solid} stopOpacity={0.12} />
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
              yAxisId="assets"
              width={axisWidth}
              tick={axisTick(isMobile)}
              tickLine={false}
              tickMargin={6}
              axisLine={false}
              tickFormatter={formatCurrencyShort}
              domain={[0, domainMax ?? 'auto']}
              allowDataOverflow={domainMax != null}
            />
            {/* Full range: P10–P90 fan */}
            <Area
              type="monotone"
              dataKey="assets_outer_lower"
              stackId="outer"
              stroke="none"
              fill="transparent"
              activeDot={false}
              isAnimationActive={false}
              yAxisId="assets"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="assets_outer_height"
              stackId="outer"
              stroke="none"
              fill="url(#assetsFanOuter)"
              name={t('legend.fullRange')}
              activeDot={false}
              isAnimationActive={false}
              yAxisId="assets"
              legendType="none"
            />
            {/* Likely range: P20–P80 fan */}
            <Area
              type="monotone"
              dataKey="assets_band_lower"
              stackId="band"
              stroke="none"
              fill="transparent"
              activeDot={false}
              isAnimationActive={false}
              yAxisId="assets"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="assets_band_height"
              stackId="band"
              stroke="none"
              fill="url(#assetsFanInner)"
              name={t('legend.likelyRange')}
              activeDot={false}
              isAnimationActive={false}
              yAxisId="assets"
              legendType="none"
            />
            <Tooltip
              content={renderTooltip}
              cursor={{ stroke: chartInk.cursor, strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <ReferenceLine
              x={retirementAge}
              yAxisId="assets"
              stroke={chartInk.marker}
              strokeDasharray="4 4"
              strokeWidth={1.25}
              label={
                isMobile
                  ? undefined
                  : {
                      value: t('markers.retirement'),
                      position: 'top',
                      offset: retirementLabelOffset,
                      style: markerLabelStyle,
                    }
              }
            />
            <ReferenceLine
              x={legalRetirementAge}
              yAxisId="assets"
              stroke={chartInk.marker}
              strokeDasharray="4 4"
              strokeWidth={1.25}
              label={
                isMobile
                  ? undefined
                  : {
                      value: t('markers.pension'),
                      position: 'top',
                      offset: pensionLabelOffset,
                      style: markerLabelStyle,
                    }
              }
            />
            {p50DepletionAge != null && (
              <ReferenceLine
                x={p50DepletionAge}
                yAxisId="assets"
                stroke="var(--neo-red)"
                strokeWidth={1.5}
                label={{
                  value: t('markers.depletionP50'),
                  position: 'insideTopRight',
                  style: { ...markerLabelStyle, fill: 'var(--neo-red)', fontWeight: 700 },
                }}
              />
            )}
            {p10DepletionAge != null && p10DepletionAge !== p50DepletionAge && (
              <ReferenceLine
                x={p10DepletionAge}
                yAxisId="assets"
                stroke="var(--neo-red)"
                strokeDasharray="3 3"
                strokeWidth={1.25}
                label={{
                  value: t('markers.depletionP10'),
                  position: 'insideBottomRight',
                  style: { ...markerLabelStyle, fill: 'var(--neo-red)' },
                }}
              />
            )}
            {/* Band edges: whisper-thin so the fan reads as one shape */}
            <Line
              type="monotone"
              dataKey="assets_p10"
              stroke={withAlpha(hue.rgb, 0.4)}
              strokeWidth={1}
              dot={false}
              activeDot={false}
              name={t('legend.p10')}
              isAnimationActive={false}
              yAxisId="assets"
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="assets_p90"
              stroke={withAlpha(hue.rgb, 0.4)}
              strokeWidth={1}
              dot={false}
              activeDot={false}
              name={t('legend.p90')}
              isAnimationActive={false}
              yAxisId="assets"
              legendType="none"
            />
            {/* Median path */}
            <Line
              type="monotone"
              dataKey="assets_p50"
              stroke={hue.solid}
              strokeWidth={isMobile ? 2 : 2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--neo-white)', fill: hue.solid }}
              name={t('legend.p50')}
              isAnimationActive={false}
              yAxisId="assets"
            />
            <Brush
              dataKey="age"
              {...brushChrome(isMobile)}
              startIndex={indexRange.startIndex}
              endIndex={indexRange.endIndex}
              onChange={handleBrushChange}
              tickFormatter={(v) => String(v)}
              // Recharts names both `role="slider"` handles itself, from the
              // `name` field of the data row — which this chart's rows do not
              // have, so it announced "Min value: undefined, Max value:
              // undefined". Name them after what they actually move.
              ariaLabel={brushAriaLabel}
            />
          </ComposedChart>
        ) : (
          <div className="h-full w-full border border-dashed border-neo-black/30 bg-muted/30" />
        )}
      </div>
      <div id="asset-chart-description" className="sr-only">
        {t('aria.description')}
      </div>
      <div id="asset-chart-controls" className="sr-only">
        {t('aria.controls')}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.62rem] font-medium tracking-[0.04em] text-muted-foreground">
        <p className="m-0">
          {isClipped ? t('scale.clipped', { value: formatCurrencyShort(outerMax) }) : ''}
        </p>
        <p className="m-0">{isZoomed ? t('hint.zoomed') : t('hint.dragToZoom')}</p>
      </div>
    </div>
  )
}
