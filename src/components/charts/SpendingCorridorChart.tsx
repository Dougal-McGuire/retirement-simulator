'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTranslations } from 'next-intl'
import type { SpendingCorridorPoint } from '@/lib/simulation/spendingCorridor'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { InfoTip } from '@/components/ui/info-tip'
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
  type LegendItem,
  type TooltipRow,
} from '@/components/charts/chartTheme'
import { clampChartRange, sliceChartRange, type ChartIndexRange } from './chartRange'

interface SpendingCorridorChartProps {
  points: SpendingCorridorPoint[]
  retirementAge: number
  legalRetirementAge: number
  hasFloor: boolean
  hasCeiling: boolean
  formatCurrency: (value: number) => string
  formatCurrencyShort: (value: number) => string
}

type ScaleMode = 'focus' | 'full'

export function SpendingCorridorChart({
  points,
  retirementAge,
  legalRetirementAge,
  hasFloor,
  hasCeiling,
  formatCurrency,
  formatCurrencyShort,
}: SpendingCorridorChartProps) {
  const t = useTranslations('withdrawalPlanner.corridor')
  const tAssets = useTranslations('assetsChart')
  const tTable = useTranslations('simulationChart.spendingTable')
  const tUi = useTranslations('ui')
  const isMobile = useIsMobile()
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [scaleMode, setScaleMode] = useState<ScaleMode>('focus')
  const [indexRange, setIndexRange] = useState<ChartIndexRange>({
    startIndex: 0,
    endIndex: Math.max(0, points.length - 1),
  })

  useEffect(() => {
    setIndexRange({ startIndex: 0, endIndex: Math.max(0, points.length - 1) })
  }, [points.length])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const measure = () =>
      setSize({
        width: Math.max(320, Math.floor(frame.clientWidth)),
        height: Math.max(220, Math.floor(frame.clientHeight)),
      })

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const hue = fanHue.spending
  const floorColor = 'var(--ok)'
  const ceilingColor = 'var(--accent)'
  const safeRange = clampChartRange(indexRange, points.length)
  const visiblePoints = useMemo(
    () => sliceChartRange(points, safeRange),
    [points, safeRange.startIndex, safeRange.endIndex]
  )
  const isZoomed = safeRange.startIndex > 0 || safeRange.endIndex < points.length - 1

  const domainMax = useMemo(() => {
    const max = visiblePoints.reduce(
      (acc, point) =>
        Math.max(
          acc,
          point.spending_p90,
          point.floor ?? 0,
          scaleMode === 'full' ? point.ceiling ?? 0 : 0
        ),
      0
    )
    return max > 0 ? niceCeil(max * 1.08) : undefined
  }, [visiblePoints, scaleMode])

  const axisWidth = useMemo(() => {
    const top = domainMax ?? 0
    const samples = [top, top * 0.75, top * 0.5, top * 0.25, 0].map(formatCurrencyShort)
    return measureAxisWidth(samples, isMobile)
  }, [domainMax, formatCurrencyShort, isMobile])

  const legendItems = useMemo<LegendItem[]>(() => {
    const items: LegendItem[] = [
      { key: 'median', label: t('legend.median'), kind: 'line', color: hue.solid },
      { key: 'band', label: t('legend.band'), kind: 'band', color: withAlpha(hue.rgb, 0.2) },
    ]
    if (hasFloor)
      items.push({ key: 'floor', label: t('legend.floor'), kind: 'dash', color: floorColor })
    if (hasCeiling) {
      items.push({ key: 'ceiling', label: t('legend.ceiling'), kind: 'dash', color: ceilingColor })
    }
    return items
  }, [t, hue.solid, hue.rgb, hasFloor, hasCeiling])

  const renderTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean
    payload?: ReadonlyArray<{ payload?: SpendingCorridorPoint }>
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
    ]

    if (point.ceiling !== null) {
      rows.push({
        key: 'ceiling',
        label: t('tooltip.ceiling'),
        value: formatCurrency(point.ceiling),
        kind: 'dash',
        color: ceilingColor,
        dividerAbove: true,
      })
    }
    if (point.floor !== null) {
      rows.push({
        key: 'floor',
        label: t('tooltip.floor'),
        value: formatCurrency(point.floor),
        kind: 'dash',
        color: floorColor,
        dividerAbove: point.ceiling === null,
      })
    }

    return <ChartTooltipCard title={t('tooltip.label', { age: label ?? '' })} rows={rows} />
  }

  const showPensionMarker =
    legalRetirementAge > retirementAge && points.some((point) => point.age >= legalRetirementAge)

  const resetZoom = () =>
    setIndexRange({ startIndex: 0, endIndex: Math.max(0, points.length - 1) })

  return (
    <div className="space-y-3" data-testid="spending-corridor-chart">
      <div className="flex flex-wrap items-center gap-2">
        <ChartLegend items={legendItems} />
        {hasFloor && <InfoTip content={t('caveat')} label={t('legend.floor')} side="bottom" />}
        <div className="ml-auto flex items-center gap-2">
          <div
            role="group"
            aria-label={tAssets('scale.label')}
            className="rounded-sm flex items-center border-2 border-border bg-white"
          >
            {(['focus', 'full'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setScaleMode(mode)}
                aria-pressed={scaleMode === mode}
                className={`px-2.5 py-1 text-[0.62rem] font-bold transition-colors ${
                  scaleMode === mode
                    ? 'bg-accent text-white'
                    : 'bg-white text-muted-foreground hover:text-ink'
                }`}
              >
                {tAssets(`scale.${mode}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ds-btn ds-btn--outline ds-btn--sm"
            onClick={resetZoom}
            disabled={!isZoomed}
          >
            {tAssets('reset')}
          </button>
        </div>
      </div>
      <div
        ref={frameRef}
        className="relative h-[17rem] w-full min-w-0 sm:h-[20rem]"
        role="img"
        aria-label={t('aria', { retirementAge })}
      >
        {size.width > 0 && points.length > 0 ? (
          <ComposedChart
            width={size.width}
            height={size.height}
            data={points}
            margin={
              isMobile
                ? { top: 20, right: 8, left: 0, bottom: 4 }
                : { top: 24, right: 16, left: 4, bottom: 4 }
            }
          >
            <defs>
              <linearGradient id="corridorFan" x1="0" y1="0" x2="0" y2="1">
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
              width={axisWidth}
              tick={axisTick(isMobile)}
              tickLine={false}
              tickMargin={6}
              axisLine={false}
              tickFormatter={formatCurrencyShort}
              domain={[0, domainMax ?? 'auto']}
              allowDataOverflow={domainMax != null}
            />
            <Area
              type="monotone"
              dataKey="spending_band_lower"
              stackId="corridorBand"
              stroke="none"
              fill="transparent"
              activeDot={false}
              isAnimationActive={false}
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="spending_band_height"
              stackId="corridorBand"
              stroke="none"
              fill="url(#corridorFan)"
              activeDot={false}
              isAnimationActive={false}
              legendType="none"
            />
            <Tooltip
              content={renderTooltip}
              cursor={{ stroke: chartInk.cursor, strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <ReferenceLine
              x={retirementAge}
              stroke={chartInk.marker}
              strokeDasharray="4 4"
              label={{
                value: t('markers.retirement'),
                position: 'insideTopLeft',
                fill: chartInk.tick,
                fontSize: isMobile ? 9 : 10,
                fontWeight: 700,
              }}
            />
            {showPensionMarker && (
              <ReferenceLine
                x={legalRetirementAge}
                stroke={chartInk.marker}
                strokeDasharray="4 4"
                label={{
                  value: t('markers.pension'),
                  position: 'insideTopRight',
                  fill: chartInk.tick,
                  fontSize: isMobile ? 9 : 10,
                  fontWeight: 700,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="spending_p50"
              stroke={hue.solid}
              strokeWidth={isMobile ? 2 : 2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--white)', fill: hue.solid }}
              isAnimationActive={false}
            />
            {hasCeiling && (
              <Line
                type="monotone"
                dataKey="ceiling"
                stroke={ceilingColor}
                strokeWidth={1.75}
                strokeDasharray="2 5"
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {hasFloor && (
              <Line
                type="monotone"
                dataKey="floor"
                stroke={floorColor}
                strokeWidth={1.75}
                strokeDasharray="6 4"
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            <Brush
              dataKey="age"
              {...brushChrome(isMobile)}
              startIndex={safeRange.startIndex}
              endIndex={safeRange.endIndex}
              onChange={(range) =>
                setIndexRange(
                  clampChartRange(
                    {
                      startIndex: range.startIndex ?? safeRange.startIndex,
                      endIndex: range.endIndex ?? safeRange.endIndex,
                    },
                    points.length
                  )
                )
              }
              tickFormatter={(value) => String(value)}
              ariaLabel={tAssets('aria.brush', {
                startAge: points[safeRange.startIndex]?.age ?? '',
                endAge: points[safeRange.endIndex]?.age ?? '',
              })}
            />
          </ComposedChart>
        ) : (
          <div className="rounded-sm flex h-full w-full items-center justify-center border-2 border-dashed border-ink/30 bg-muted/20 text-[0.68rem] font-semibold text-muted-foreground">
            {t('empty')}
          </div>
        )}
      </div>
      {!hasFloor && (
        <p className="text-[0.62rem] font-medium leading-snug text-muted-foreground">
          {t('noFloor')}
        </p>
      )}
      <details className="border-t border-border pt-2">
        <summary className="cursor-pointer text-xs font-bold text-accent">
          {tTable('toggle')}
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="ds-table w-full">
            <thead>
              <tr>
                <th>{tUi('age')}</th>
                <th className="ds-num">P10</th>
                <th className="ds-num">P50</th>
                <th className="ds-num">P90</th>
                {hasFloor && <th className="ds-num">{t('legend.floor')}</th>}
                {hasCeiling && <th className="ds-num">{t('legend.ceiling')}</th>}
              </tr>
            </thead>
            <tbody>
              {visiblePoints.map((point) => (
                <tr key={point.age}>
                  <td>{point.age}</td>
                  <td className="ds-num">{formatCurrency(point.spending_p10)}</td>
                  <td className="ds-num" style={{ fontWeight: 700 }}>{formatCurrency(point.spending_p50)}</td>
                  <td className="ds-num">{formatCurrency(point.spending_p90)}</td>
                  {hasFloor && <td className="ds-num">{point.floor == null ? '—' : formatCurrency(point.floor)}</td>}
                  {hasCeiling && <td className="ds-num">{point.ceiling == null ? '—' : formatCurrency(point.ceiling)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
