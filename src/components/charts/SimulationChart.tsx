'use client'

import { SimulationResults } from '@/types'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'

interface SimulationChartProps {
  results: SimulationResults | null
  isLoading: boolean
}

interface ChartDataPoint {
  age: number
  assets_p10: number
  assets_p50: number
  assets_p90: number
  spending_p10: number
  spending_p50: number
  spending_p90: number
}

export function SimulationChart({ results, isLoading }: SimulationChartProps) {
  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Running Monte Carlo simulation...</p>
          <p className="text-sm text-gray-500 mt-1">This may take a few moments</p>
        </div>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-gray-600">No simulation data available</p>
          <p className="text-sm text-gray-500 mt-1">Adjust parameters to run simulation</p>
        </div>
      </div>
    )
  }

  // Transform data for the chart
  const chartData: ChartDataPoint[] = results.ages.map((age, index) => ({
    age,
    assets_p10: Math.round(results.assetPercentiles.p10[index]),
    assets_p50: Math.round(results.assetPercentiles.p50[index]),
    assets_p90: Math.round(results.assetPercentiles.p90[index]),
    spending_p10: Math.round(results.spendingPercentiles.p10[index]),
    spending_p50: Math.round(results.spendingPercentiles.p50[index]),
    spending_p90: Math.round(results.spendingPercentiles.p90[index]),
  }))

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatCurrencyShort = (value: number) => {
    if (value >= 1000000) {
      return `€${(value / 1000000).toFixed(1)}M`
    }
    if (value >= 1000) {
      return `€${(value / 1000).toFixed(0)}K`
    }
    return `€${value.toFixed(0)}`
  }

  return (
    <div className="space-y-8">
      {/* Asset Projections Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-6 transition-all duration-300 hover:shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h4 id="asset-chart-title" className="text-lg font-semibold text-gray-900">Asset Projections Over Time</h4>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-500">Live Data</span>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          This chart shows projected asset values over time using Monte Carlo simulation. 
          The three lines represent optimistic (90th percentile), median (50th percentile), 
          and pessimistic (10th percentile) scenarios.
        </p>
        <div 
          className="h-80 group" 
          role="img" 
          aria-labelledby="asset-chart-title"
          aria-describedby="asset-chart-description"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={chartData} 
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              className="transition-all duration-300 ease-in-out"
            >
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
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
                label={{ value: 'Age', position: 'insideBottom', offset: -10, style: { textAnchor: 'middle', fontSize: '12px', fill: '#6b7280' } }}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickLine={{ stroke: '#d1d5db' }}
                axisLine={{ stroke: '#d1d5db' }}
                tickFormatter={formatCurrencyShort}
                label={{ value: 'Assets (€)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: '12px', fill: '#6b7280' } }}
              />
              <Tooltip 
                formatter={(value: number, name: string) => [formatCurrency(value), name]}
                labelFormatter={(age) => `Age: ${age}`}
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  fontSize: '12px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  backdropFilter: 'blur(10px)'
                }}
                labelStyle={{ fontWeight: 'semibold', color: '#374151' }}
                cursor={{ stroke: '#6b7280', strokeWidth: 1, strokeDasharray: '3 3' }}
              />
              <ReferenceLine 
                x={results.params.retirementAge} 
                stroke="#dc2626" 
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{ 
                  value: "Retirement", 
                  position: "top",
                  style: { fill: '#dc2626', fontSize: '11px', fontWeight: 'semibold' }
                }}
                className="transition-all duration-300 hover:stroke-red-400"
              />
              <ReferenceLine 
                x={results.params.legalRetirementAge} 
                stroke="#059669" 
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{ 
                  value: "Pension Starts", 
                  position: "top",
                  style: { fill: '#059669', fontSize: '11px', fontWeight: 'semibold' }
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
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div id="asset-chart-description" className="sr-only">
          Asset projection chart showing three scenarios: worst case (10th percentile) in red declining to {formatCurrency(chartData[chartData.length-1].assets_p10)}, 
          median case (50th percentile) in blue ending at {formatCurrency(chartData[chartData.length-1].assets_p50)}, 
          and best case (90th percentile) in green reaching {formatCurrency(chartData[chartData.length-1].assets_p90)} 
          by age {chartData[chartData.length-1].age}.
        </div>
        <div className="flex flex-wrap justify-center gap-6 mt-6 p-4 bg-gray-50/50 rounded-lg border border-gray-200/50" role="list" aria-label="Chart legend">
          <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
            <div className="w-6 h-1 bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-300 group-hover:shadow-lg group-hover:shadow-red-200" aria-hidden="true"></div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-red-600 transition-colors">10th Percentile (Pessimistic)</span>
          </div>
          <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
            <div className="w-6 h-1 bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-300 group-hover:shadow-lg group-hover:shadow-blue-200" aria-hidden="true"></div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">50th Percentile (Median)</span>
          </div>
          <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
            <div className="w-6 h-1 bg-gradient-to-r from-green-500 to-green-400 rounded-full transition-all duration-300 group-hover:shadow-lg group-hover:shadow-green-200" aria-hidden="true"></div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-green-600 transition-colors">90th Percentile (Optimistic)</span>
          </div>
        </div>
        
        {/* Data Table for Accessibility */}
        <details className="mt-4">
          <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-800">
            View data table for screen readers
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-xs border border-gray-300">
              <caption className="sr-only">Asset projections by age and percentile</caption>
              <thead>
                <tr className="bg-gray-50">
                  <th className="border px-2 py-1">Age</th>
                  <th className="border px-2 py-1">10th Percentile</th>
                  <th className="border px-2 py-1">50th Percentile</th>
                  <th className="border px-2 py-1">90th Percentile</th>
                </tr>
              </thead>
              <tbody>
                {chartData.filter((_, i) => i % 5 === 0).map((data, index) => (
                  <tr key={index}>
                    <td className="border px-2 py-1">{data.age}</td>
                    <td className="border px-2 py-1">{formatCurrency(data.assets_p10)}</td>
                    <td className="border px-2 py-1">{formatCurrency(data.assets_p50)}</td>
                    <td className="border px-2 py-1">{formatCurrency(data.assets_p90)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* Monthly Spending Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200/50 p-6 transition-all duration-300 hover:shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h4 id="spending-chart-title" className="text-lg font-semibold text-gray-900">Total Monthly Spending During Retirement</h4>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-gray-500">Retirement Phase</span>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          This bar chart displays projected monthly spending during retirement across different scenarios.
          Higher spending occurs when asset growth allows for it, lower spending occurs when assets are constrained.
        </p>
        <div 
          className="h-64 group"
          role="img" 
          aria-labelledby="spending-chart-title"
          aria-describedby="spending-chart-description"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={chartData.filter(d => d.age >= results.params.retirementAge)}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              className="transition-all duration-300 ease-in-out"
            >
              <defs>
                <linearGradient id="spendingGradient1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.4}/>
                </linearGradient>
                <linearGradient id="spendingGradient2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.9}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.5}/>
                </linearGradient>
                <linearGradient id="spendingGradient3" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0.4}/>
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
                label={{ value: 'Age', position: 'insideBottom', offset: -10, style: { textAnchor: 'middle', fontSize: '12px', fill: '#6b7280' } }}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickLine={{ stroke: '#d1d5db' }}
                axisLine={{ stroke: '#d1d5db' }}
                tickFormatter={formatCurrencyShort}
                label={{ value: 'Total Monthly Spending (€)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: '12px', fill: '#6b7280' } }}
              />
              <Tooltip 
                formatter={(value: number, name: string) => [formatCurrency(value), name]}
                labelFormatter={(age) => `Age: ${age}`}
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  fontSize: '12px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  backdropFilter: 'blur(10px)'
                }}
                labelStyle={{ fontWeight: 'semibold', color: '#374151' }}
                cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
              />
              <Bar 
                dataKey="spending_p10" 
                fill="url(#spendingGradient1)" 
                name="10th Percentile"
                radius={[2, 2, 0, 0]}
                animationBegin={0}
                animationDuration={1500}
                className="transition-all duration-300 hover:opacity-80"
              />
              <Bar 
                dataKey="spending_p50" 
                fill="url(#spendingGradient2)" 
                name="50th Percentile"
                radius={[2, 2, 0, 0]}
                animationBegin={200}
                animationDuration={1700}
                className="transition-all duration-300 hover:opacity-80"
              />
              <Bar 
                dataKey="spending_p90" 
                fill="url(#spendingGradient3)" 
                name="90th Percentile"
                radius={[2, 2, 0, 0]}
                animationBegin={400}
                animationDuration={1900}
                className="transition-all duration-300 hover:opacity-80"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div id="spending-chart-description" className="sr-only">
          Monthly spending bar chart showing spending patterns from retirement age {results.params.retirementAge} 
          onwards, with three scenarios ranging from conservative spending in the 10th percentile to 
          more comfortable spending in the 90th percentile.
        </div>
        <div className="flex flex-wrap justify-center gap-6 mt-6 p-4 bg-gray-50/50 rounded-lg border border-gray-200/50" role="list" aria-label="Chart legend">
          <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
            <div className="w-4 h-4 bg-gradient-to-b from-amber-400 to-amber-500 rounded transition-all duration-300 group-hover:shadow-lg group-hover:shadow-amber-200" aria-hidden="true"></div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-amber-600 transition-colors">10th Percentile</span>
          </div>
          <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
            <div className="w-4 h-4 bg-gradient-to-b from-purple-500 to-purple-600 rounded transition-all duration-300 group-hover:shadow-lg group-hover:shadow-purple-200" aria-hidden="true"></div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-purple-600 transition-colors">50th Percentile</span>
          </div>
          <div className="flex items-center gap-3 group cursor-pointer" role="listitem">
            <div className="w-4 h-4 bg-gradient-to-b from-orange-500 to-orange-600 rounded transition-all duration-300 group-hover:shadow-lg group-hover:shadow-orange-200" aria-hidden="true"></div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-orange-600 transition-colors">90th Percentile</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 text-center mt-2">
          Includes monthly expenses plus annualized annual expenses (vacations, repairs, etc.)
        </p>
        
        {/* Data Table for Accessibility */}
        <details className="mt-4">
          <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-800">
            View spending data table
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-xs border border-gray-300">
              <caption className="sr-only">Monthly spending projections during retirement by age and percentile</caption>
              <thead>
                <tr className="bg-gray-50">
                  <th className="border px-2 py-1">Age</th>
                  <th className="border px-2 py-1">10th Percentile</th>
                  <th className="border px-2 py-1">50th Percentile</th>
                  <th className="border px-2 py-1">90th Percentile</th>
                </tr>
              </thead>
              <tbody>
                {chartData.filter(d => d.age >= results.params.retirementAge && d.age % 5 === 0).map((data, index) => (
                  <tr key={index}>
                    <td className="border px-2 py-1">{data.age}</td>
                    <td className="border px-2 py-1">{formatCurrency(data.spending_p10)}</td>
                    <td className="border px-2 py-1">{formatCurrency(data.spending_p50)}</td>
                    <td className="border px-2 py-1">{formatCurrency(data.spending_p90)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  )
}