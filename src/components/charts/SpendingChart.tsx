'use client'

import { useMemo } from 'react'
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
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { useTranslations } from 'next-intl'
import type { ChartDataPoint } from '@/types'
import { Button } from '@/components/ui/button'

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

  return (
    <div className="space-y-6 border-3 border-neo-black bg-neo-white p-6 shadow-neo">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4
            id="spending-chart-title"
            className="text-lg font-extrabold uppercase tracking-[0.2em] text-neo-black"
          >
            {t('title')}
          </h4>
          <p className="mt-2 max-w-2xl text-[0.72rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onResetZoom} className="px-4">
          {t('reset')}
        </Button>
      </div>
      <div
        className="h-80"
        role="img"
        aria-labelledby="spending-chart-title"
        aria-describedby="spending-chart-description"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
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
              tick={{ fontSize: 11, fill: '#000000' }}
              tickLine={{ stroke: '#000000' }}
              axisLine={{ stroke: '#000000' }}
              label={{
                value: t('axis.age'),
                position: 'insideBottom',
                offset: -10,
                style: { textAnchor: 'middle', fontSize: '12px', fill: '#000000' },
              }}
            />
            <YAxis
              yAxisId="spending"
              tick={{ fontSize: 11, fill: '#000000' }}
              tickLine={{ stroke: '#000000' }}
              axisLine={{ stroke: '#000000' }}
              tickFormatter={formatCurrencyShort}
              label={{
                value: t('axis.spending'),
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fontSize: '12px', fill: '#000000' },
              }}
            />
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
                fontSize: '12px',
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
            <Bar
              dataKey="spending_p10"
              fill="#FFD700"
              name={t('legend.p10')}
              radius={0}
              yAxisId="spending"
            />
            <Bar
              dataKey="spending_p50"
              fill="#0066FF"
              name={t('legend.p50')}
              radius={0}
              yAxisId="spending"
            />
            <Bar
              dataKey="spending_p80"
              fill="#00DD00"
              name={t('legend.p80')}
              radius={0}
              yAxisId="spending"
            />
            <Bar
              dataKey="spending_p90"
              fill="#FF4444"
              name={t('legend.p90')}
              radius={0}
              yAxisId="spending"
            />
            <Line
              type="monotone"
              dataKey="withdrawal_rate_p50"
              name={t('legend.withdrawalRate')}
              stroke="#05080f"
              strokeWidth={2}
              yAxisId="rate"
              dot={false}
            />
            <Brush
              dataKey="age"
              height={22}
              stroke="#9ca3af"
              travellerWidth={8}
              startIndex={indexRange.startIndex}
              endIndex={indexRange.endIndex}
              onChange={onBrushChange}
              tickFormatter={(v) => String(v)}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div id="spending-chart-description" className="sr-only">
        {t('aria.description', { retirementAge })}
      </div>
      <div
        className="mt-6 flex flex-wrap justify-center gap-4 border-3 border-neo-black bg-neo-white p-4"
        role="list"
        aria-label={t('legend.title')}
      >
        {[
          { color: '#f6c90e', label: t('legend.p10'), type: 'bar' as const },
          { color: '#0e67f6', label: t('legend.p50'), type: 'bar' as const },
          { color: '#ff3b5c', label: t('legend.p90'), type: 'bar' as const },
          { color: '#05080f', label: t('legend.withdrawalRate'), type: 'line' as const },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 text-[0.72rem] font-semibold uppercase tracking-[0.16em]"
            role="listitem"
          >
            {item.type === 'bar' ? (
              <div
                className="h-3 w-3 border-3 border-neo-black"
                aria-hidden="true"
                style={{ backgroundColor: item.color }}
              />
            ) : (
              <div
                className="h-0.5 w-6 border-3 border-neo-black"
                aria-hidden="true"
                style={{ backgroundColor: item.color }}
              />
            )}
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {t('legend.note')}
      </p>
    </div>
  )
}
