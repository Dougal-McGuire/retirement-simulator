'use client'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
} from 'recharts'
import { useTranslations } from 'next-intl'
import type { ChartDataPoint } from '@/types'

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
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-6 transition-all duration-300 hover:shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h4 id="spending-chart-title" className="text-lg font-semibold text-gray-900">
          {t('title')}
        </h4>
        <button
          type="button"
          onClick={onResetZoom}
          className="ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
        >
          {t('reset')}
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        {t('description')}
      </p>
      <div
        className="h-80"
        role="img"
        aria-labelledby="spending-chart-title"
        aria-describedby="spending-chart-description"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
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
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} stroke="#e5e7eb" />
            <XAxis
              dataKey="age"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={{ stroke: '#d1d5db' }}
              axisLine={{ stroke: '#d1d5db' }}
              label={{
                value: t('axis.age'),
                position: 'insideBottom',
                offset: -10,
                style: { textAnchor: 'middle', fontSize: '12px', fill: '#6b7280' },
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={{ stroke: '#d1d5db' }}
              axisLine={{ stroke: '#d1d5db' }}
              tickFormatter={formatCurrencyShort}
              label={{
                value: t('axis.spending'),
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fontSize: '12px', fill: '#6b7280' },
              }}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatCurrency(value), name]}
              labelFormatter={(age) => t('tooltip.label', { age })}
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                fontSize: '12px',
                boxShadow:
                  '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                backdropFilter: 'blur(10px)',
              }}
              labelStyle={{ fontWeight: 'semibold', color: '#374151' }}
              cursor={{ stroke: '#6b7280', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Bar
              dataKey="spending_p10"
              fill="url(#spendingGradient1)"
              name={t('legend.p10')}
              radius={[2, 2, 0, 0]}
              animationBegin={200}
              animationDuration={1700}
              className="transition-all duration-300 hover:opacity-80"
            />
            <Bar
              dataKey="spending_p50"
              fill="url(#spendingGradient2)"
              name={t('legend.p50')}
              radius={[2, 2, 0, 0]}
              animationBegin={300}
              animationDuration={1800}
              className="transition-all duration-300 hover:opacity-80"
            />
            <Bar
              dataKey="spending_p80"
              fill="#34d399"
              name={t('legend.p80')}
              radius={[2, 2, 0, 0]}
              animationBegin={300}
              animationDuration={1800}
              className="transition-all duration-300 hover:opacity-80"
            />
            <Bar
              dataKey="spending_p90"
              fill="url(#spendingGradient3)"
              name={t('legend.p90')}
              radius={[2, 2, 0, 0]}
              animationBegin={400}
              animationDuration={1900}
              className="transition-all duration-300 hover:opacity-80"
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
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div id="spending-chart-description" className="sr-only">
        {t('aria.description', { retirementAge })}
      </div>
      <div
        className="flex flex-wrap justify-center gap-6 mt-6 p-4 bg-gray-50/50 rounded-lg border border-gray-200/50"
        role="list"
        aria-label={t('legend.title')}
      >
        <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
          <div
            className="w-4 h-4 bg-gradient-to-b from-amber-400 to-amber-500 rounded transition-all duration-300 group-hover:shadow-lg group-hover:shadow-amber-200"
            aria-hidden="true"
          ></div>
          <span className="text-sm font-medium text-gray-700 group-hover:text-amber-600 transition-colors">
            {t('legend.p10')}
          </span>
        </div>
        <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
          <div
            className="w-4 h-4 bg-gradient-to-b from-purple-500 to-purple-600 rounded transition-all duration-300 group-hover:shadow-lg group-hover:shadow-purple-200"
            aria-hidden="true"
          ></div>
          <span className="text-sm font-medium text-gray-700 group-hover:text-purple-600 transition-colors">
            {t('legend.p50')}
          </span>
        </div>
        <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
          <div
            className="w-4 h-4 bg-gradient-to-b from-orange-500 to-orange-600 rounded transition-all duration-300 group-hover:shadow-lg group-hover:shadow-orange-200"
            aria-hidden="true"
          ></div>
          <span className="text-sm font-medium text-gray-700 group-hover:text-orange-600 transition-colors">
            {t('legend.p90')}
          </span>
        </div>
      </div>
      <p className="text-xs text-gray-500 text-center mt-2">{t('legend.note')}</p>
    </div>
  )
}
