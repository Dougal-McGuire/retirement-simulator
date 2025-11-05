'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
  ReferenceLine,
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { useTranslations } from 'next-intl'
import type { ChartDataPoint } from '@/types'
import { Button } from '@/components/ui/button'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { MoveHorizontal } from 'lucide-react'

interface SpendingChartProps {
  data: ChartDataPoint[]
  retirementAge: number
  indexRange: { startIndex: number; endIndex: number }
  onBrushChange: (range: { startIndex?: number; endIndex?: number }) => void
  formatCurrency: (value: number) => string
  formatCurrencyShort: (value: number) => string
  onResetZoom: () => void
}

export function SpendingChart({
  data,
  retirementAge,
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

  // Hide hint after user interaction or 5 seconds
  useEffect(() => {
    if (hasInteracted) {
      setShowHint(false)
    } else {
      const timer = setTimeout(() => setShowHint(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [hasInteracted])

  // Track if zoom is active
  const isZoomed = indexRange.startIndex > 0 || indexRange.endIndex < data.length - 1

  // Handle brush interaction
  const handleBrushChange = (range: { startIndex?: number; endIndex?: number }) => {
    setHasInteracted(true)
    onBrushChange(range)
  }

  return (
    <div className="space-y-6 border-3 border-neo-black bg-neo-white p-4 shadow-neo sm:p-6">
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
        className="relative h-80"
        role="img"
        aria-label={t('aria.description', { retirementAge })}
        aria-describedby="spending-chart-description spending-chart-controls"
        tabIndex={0}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
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
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#d97706" stopOpacity={0.8} />
              </linearGradient>
              <linearGradient id="spendingGradient2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#7e22ce" stopOpacity={0.8} />
              </linearGradient>
              <linearGradient id="spendingGradient3" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#fb923c" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#ea580c" stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="0 0" opacity={0.15} stroke="#000000" />
            <XAxis
              dataKey="age"
              tick={{ fontSize: isMobile ? 10 : 11, fill: '#000000' }}
              tickLine={{ stroke: '#000000' }}
              axisLine={{ stroke: '#000000' }}
              label={
                isMobile
                  ? undefined
                  : {
                      value: t('axis.age'),
                      position: 'insideBottom',
                      offset: -10,
                      style: { textAnchor: 'middle', fontSize: '12px', fill: '#000000' },
                    }
              }
            />
            <YAxis
              yAxisId="spending"
              tick={{ fontSize: isMobile ? 10 : 11, fill: '#000000' }}
              tickLine={{ stroke: '#000000' }}
              axisLine={{ stroke: '#000000' }}
              tickFormatter={formatCurrencyShort}
              label={
                isMobile
                  ? undefined
                  : {
                      value: t('axis.spending'),
                      angle: -90,
                      position: 'insideLeft',
                      style: { textAnchor: 'middle', fontSize: '12px', fill: '#000000' },
                    }
              }
            />
            {!isMobile && (
              <YAxis
                yAxisId="rate"
                orientation="right"
                tick={{ fontSize: 11, fill: '#000000' }}
                tickLine={{ stroke: '#000000' }}
                axisLine={{ stroke: '#000000' }}
                tickFormatter={(value) => formatPercentage(value as number)}
                label={{
                  value: t('axis.withdrawalRate'),
                  angle: 90,
                  position: 'insideRight',
                  style: { textAnchor: 'middle', fontSize: '12px', fill: '#000000' },
                }}
                domain={[0, 'auto']}
              />
            )}
            <Tooltip
              formatter={(value: ValueType, name: NameType, item) => {
                const numericValue = typeof value === 'number' ? value : Number(value ?? NaN)
                if (item?.dataKey === 'withdrawal_rate_p50') {
                  return [formatPercentage(Number.isFinite(numericValue) ? numericValue : null), name]
                }
                return [formatCurrency(Number.isFinite(numericValue) ? numericValue : 0), name]
              }}
              labelFormatter={(age) => t('tooltip.label', { age })}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '3px solid #05080f',
                borderRadius: '0px',
                fontSize: isMobile ? '11px' : '12px',
                boxShadow: '6px 6px 0px #05080f',
              }}
              labelStyle={{
                fontWeight: 800,
                color: '#05080f',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
              cursor={{ stroke: '#05080f', strokeWidth: 1.5, strokeDasharray: '4 2' }}
            />
            {/* Retirement age marker */}
            <ReferenceLine
              x={retirementAge}
              stroke="#dc2626"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={
                isMobile
                  ? undefined
                  : {
                      value: t('markers.retirement'),
                      position: 'top',
                      style: { fill: '#dc2626', fontSize: '11px', fontWeight: 'semibold' },
                    }
              }
            />
            <Bar
              dataKey="spending_p10"
              fill="#f6c90e"
              name={t('legend.p10')}
              radius={0}
              yAxisId="spending"
            />
            <Bar
              dataKey="spending_p50"
              fill="#0e67f6"
              name={t('legend.p50')}
              radius={0}
              yAxisId="spending"
            />
            <Bar
              dataKey="spending_p90"
              fill="#ff3b5c"
              name={t('legend.p90')}
              radius={0}
              yAxisId="spending"
            />
            <Line
              type="monotone"
              dataKey="withdrawal_rate_p50"
              name={t('legend.withdrawalRate')}
              stroke="#05080f"
              strokeWidth={isMobile ? 1.5 : 2}
              yAxisId={isMobile ? 'spending' : 'rate'}
              dot={false}
              hide={isMobile}
            />
            <Brush
              dataKey="age"
              height={isMobile ? 18 : 22}
              stroke="#9ca3af"
              travellerWidth={isMobile ? 6 : 8}
              startIndex={indexRange.startIndex}
              endIndex={indexRange.endIndex}
              onChange={handleBrushChange}
              tickFormatter={(v) => String(v)}
            />
          </ComposedChart>
        </ResponsiveContainer>
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
