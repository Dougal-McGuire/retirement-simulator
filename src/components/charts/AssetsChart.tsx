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
import type { ChartDataPoint } from '@/types'

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
}

export function AssetsChart({
  data,
  retirementAge,
  legalRetirementAge,
  indexRange,
  onBrushChange,
  onResetZoom,
  formatCurrency,
}: AssetsChartProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-6 transition-all duration-300 hover:shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h4 id="asset-chart-title" className="text-lg font-semibold text-gray-900">
          Asset Projections Over Time
        </h4>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-500">Live Data</span>
          <button
            type="button"
            onClick={onResetZoom}
            className="ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
            aria-label="Reset zoom"
          >
            Reset Zoom
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-6">
        This chart shows projected asset values over time using Monte Carlo simulation. The three
        lines represent optimistic (90th percentile), median (50th percentile), and pessimistic
        (10th percentile) scenarios.
      </p>
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
            <CartesianGrid
              strokeDasharray="3 3"
              opacity={0.3}
              stroke="#e5e7eb"
              className="transition-opacity duration-300 group-hover:opacity-40"
            />
            <XAxis
              dataKey="age"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={{ stroke: '#d1d5db' }}
              axisLine={{ stroke: '#d1d5db' }}
              label={{
                value: 'Age',
                position: 'insideBottom',
                offset: -10,
                style: { textAnchor: 'middle', fontSize: '12px', fill: '#6b7280' },
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={{ stroke: '#d1d5db' }}
              axisLine={{ stroke: '#d1d5db' }}
              tickFormatter={(v) => {
                if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`
                if (v >= 1_000) return `€${(v / 1_000).toFixed(0)}K`
                return `€${v.toFixed(0)}`
              }}
              label={{
                value: 'Assets (€)',
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fontSize: '12px', fill: '#6b7280' },
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
              fill="#60a5fa"
              fillOpacity={0.18}
              name="P20–P80 Band"
              isAnimationActive={false}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatCurrency(value), name]}
              labelFormatter={(age) => `Age: ${age}`}
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
            <ReferenceLine
              x={retirementAge}
              stroke="#dc2626"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{
                value: 'Retirement',
                position: 'top',
                style: { fill: '#dc2626', fontSize: '11px', fontWeight: 'semibold' },
              }}
              className="transition-all duration-300 hover:stroke-red-400"
            />
            <ReferenceLine
              x={legalRetirementAge}
              stroke="#059669"
              strokeDasharray="5 5"
              strokeWidth={2}
              label={{
                value: 'Pension Starts',
                position: 'top',
                style: { fill: '#059669', fontSize: '11px', fontWeight: 'semibold' },
              }}
              className="transition-all duration-300 hover:stroke-green-400"
            />
            <Line
              type="monotone"
              dataKey="assets_p10"
              stroke="#ef4444"
              strokeWidth={2.5}
              dot={false}
              name="10th Percentile (Pessimistic)"
              className="transition-all duration-1000 ease-out"
              strokeDasharray="0"
              animationBegin={0}
              animationDuration={2000}
            />
            <Line
              type="monotone"
              dataKey="assets_p20"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              name="20th Percentile"
              className="transition-all duration-1000 ease-out"
              strokeDasharray="4 4"
              animationBegin={100}
              animationDuration={2100}
            />
            <Line
              type="monotone"
              dataKey="assets_p50"
              stroke="#3b82f6"
              strokeWidth={3.5}
              dot={false}
              name="50th Percentile (Median)"
              className="transition-all duration-1000 ease-out"
              strokeDasharray="0"
              animationBegin={200}
              animationDuration={2200}
            />
            <Line
              type="monotone"
              dataKey="assets_p80"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              name="80th Percentile"
              className="transition-all duration-1000 ease-out"
              strokeDasharray="4 4"
              animationBegin={300}
              animationDuration={2300}
            />
            <Line
              type="monotone"
              dataKey="assets_p90"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={false}
              name="90th Percentile (Optimistic)"
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
        Asset projection chart showing three scenarios: worst case (10th percentile) in red, median
        (50th percentile) in blue, and best case (90th percentile) in green.
      </div>
      <div
        className="flex flex-wrap justify-center gap-6 mt-6 p-4 bg-gray-50/50 rounded-lg border border-gray-200/50"
        role="list"
        aria-label="Chart legend"
      >
        <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
          <div
            className="w-6 h-1 bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-300 group-hover:shadow-lg group-hover:shadow-red-200"
            aria-hidden="true"
          ></div>
          <span className="text-sm font-medium text-gray-700 group-hover:text-red-600 transition-colors">
            10th Percentile (Pessimistic)
          </span>
        </div>
        <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
          <div
            className="w-6 h-1 bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-300 group-hover:shadow-lg group-hover:shadow-amber-200"
            aria-hidden="true"
          ></div>
          <span className="text-sm font-medium text-gray-700 group-hover:text-amber-600 transition-colors">
            20th Percentile
          </span>
        </div>
        <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
          <div
            className="w-6 h-1 bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300 group-hover:shadow-lg group-hover:shadow-blue-200"
            aria-hidden="true"
          ></div>
          <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
            50th Percentile (Median)
          </span>
        </div>
        <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
          <div
            className="w-6 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-300 group-hover:shadow-lg group-hover:shadow-emerald-200"
            aria-hidden="true"
          ></div>
          <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-600 transition-colors">
            80th Percentile
          </span>
        </div>
        <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
          <div
            className="w-6 h-1 bg-gradient-to-r from-teal-500 to-teal-400 rounded-full transition-all duration-300 group-hover:shadow-lg group-hover:shadow-teal-200"
            aria-hidden="true"
          ></div>
          <span className="text-sm font-medium text-gray-700 group-hover:text-teal-600 transition-colors">
            90th Percentile (Optimistic)
          </span>
        </div>
      </div>
    </div>
  )
}
