'use client'

import {
  ResponsiveContainer,
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

  // Check if ages are close together (within 2 years) to avoid label overlap
  const ageDifference = Math.abs(retirementAge - legalRetirementAge)
  const areAgesClose = ageDifference <= 2

  // Calculate offsets to stack labels vertically when ages are close
  // Negative offset moves label up, positive moves it down
  const retirementLabelOffset = areAgesClose ? -10 : 0 // Retirement higher
  const pensionLabelOffset = areAgesClose ? 10 : 0 // Pension lower, stacked below

  return (
    <div className="space-y-6 border-3 border-neo-black bg-neo-white p-6 shadow-neo">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4
            id="asset-chart-title"
            className="text-lg font-extrabold uppercase tracking-[0.2em] text-neo-black"
          >
            {t('title')}
          </h4>
          <p className="mt-2 max-w-2xl text-[0.72rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 border-3 border-neo-black bg-neo-blue animate-pulse" />
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t('liveData')}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetZoom}
            aria-label={t('reset')}
            className="px-4"
          >
            {t('reset')}
          </Button>
        </div>
      </div>
      <div
        className="h-80 group"
        role="img"
        aria-labelledby="asset-chart-title"
        aria-describedby="asset-chart-description"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            className="transition-all duration-300 ease-in-out"
          >
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
              tick={{ fontSize: 11, fill: '#000000' }}
              tickLine={{ stroke: '#000000' }}
              axisLine={{ stroke: '#000000' }}
              tickFormatter={formatCurrencyShort}
              label={{
                value: t('axis.assets'),
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fontSize: '12px', fill: '#000000' },
              }}
            />
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
              fill="#0e67f6"
              fillOpacity={0.18}
              name={t('legend.band')}
              isAnimationActive={false}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatCurrency(value), name]}
              labelFormatter={(age) => t('tooltip.label', { age })}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '3px solid #05080f',
                borderRadius: '0px',
                fontSize: '12px',
                boxShadow: '6px 6px 0 #05080f',
              }}
              labelStyle={{
                fontWeight: 800,
                color: '#05080f',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
              cursor={{ stroke: '#05080f', strokeWidth: 1.5, strokeDasharray: '4 2' }}
            />
            <ReferenceLine
              x={retirementAge}
              stroke="#dc2626"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{
                value: t('markers.retirement'),
                position: 'top',
                offset: retirementLabelOffset,
                style: { fill: '#dc2626', fontSize: '11px', fontWeight: 'semibold', whiteSpace: 'normal', wordBreak: 'break-word' },
              }}
              className="transition-all duration-300 hover:stroke-red-400"
            />
            <ReferenceLine
              x={legalRetirementAge}
              stroke="#059669"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{
                value: t('markers.pension'),
                position: 'top',
                offset: pensionLabelOffset,
                style: { fill: '#059669', fontSize: '11px', fontWeight: 'semibold', whiteSpace: 'normal', wordBreak: 'break-word' },
              }}
              className="transition-all duration-300 hover:stroke-green-400"
            />
            <Line
              type="monotone"
              dataKey="assets_p10"
              stroke="#ff3b5c"
              strokeWidth={2.5}
              dot={false}
              name={t('legend.p10')}
              className="transition-all duration-1000 ease-out"
              strokeDasharray="0"
              animationBegin={0}
              animationDuration={2000}
            />
            <Line
              type="monotone"
              dataKey="assets_p20"
              stroke="#f6c90e"
              strokeWidth={2}
              dot={false}
              name={t('legend.p20')}
              className="transition-all duration-1000 ease-out"
              strokeDasharray="4 4"
              animationBegin={100}
              animationDuration={2100}
            />
            <Line
              type="monotone"
              dataKey="assets_p50"
              stroke="#0e67f6"
              strokeWidth={3.5}
              dot={false}
              name={t('legend.p50')}
              className="transition-all duration-1000 ease-out"
              strokeDasharray="0"
              animationBegin={200}
              animationDuration={2200}
            />
            <Line
              type="monotone"
              dataKey="assets_p80"
              stroke="#2ad576"
              strokeWidth={2}
              dot={false}
              name={t('legend.p80')}
              className="transition-all duration-1000 ease-out"
              strokeDasharray="4 4"
              animationBegin={300}
              animationDuration={2300}
            />
            <Line
              type="monotone"
              dataKey="assets_p90"
              stroke="#14c2c9"
              strokeWidth={2.5}
              dot={false}
              name={t('legend.p90')}
              className="transition-all duration-1000 ease-out"
              strokeDasharray="0"
              animationBegin={400}
              animationDuration={2400}
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
      <div id="asset-chart-description" className="sr-only">
        {t('aria.description')}
      </div>
      <div
        className="mt-6 flex flex-wrap justify-center gap-4 border-3 border-neo-black bg-neo-white p-4"
        role="list"
        aria-label={t('legend.title')}
      >
        {[
          { color: '#ff3b5c', label: t('legend.p10') },
          { color: '#f6c90e', label: t('legend.p20') },
          { color: '#0e67f6', label: t('legend.p50') },
          { color: '#2ad576', label: t('legend.p80') },
          { color: '#14c2c9', label: t('legend.p90') },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 uppercase tracking-[0.16em] text-[0.72rem] font-semibold"
            role="listitem"
          >
            <div
              className="h-3 w-3 border-3 border-neo-black"
              aria-hidden="true"
              style={{ backgroundColor: item.color }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
