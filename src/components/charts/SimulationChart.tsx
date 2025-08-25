'use client'

import { SimulationResults } from '@/types'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

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
      <div>
        <h4 className="text-lg font-semibold mb-4 text-gray-900">Asset Projections Over Time</h4>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis 
                dataKey="age" 
                tick={{ fontSize: 12 }}
                label={{ value: 'Age', position: 'insideBottom', offset: -10 }}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickFormatter={formatCurrencyShort}
                label={{ value: 'Assets (€)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value: number) => [formatCurrency(value), '']}
                labelFormatter={(age) => `Age: ${age}`}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <ReferenceLine 
                x={results.params.retirementAge} 
                stroke="#dc2626" 
                strokeDasharray="5 5"
                label={{ value: "Retirement", position: "top" }}
              />
              <ReferenceLine 
                x={results.params.legalRetirementAge} 
                stroke="#059669" 
                strokeDasharray="5 5"
                label={{ value: "Pension Starts", position: "top" }}
              />
              <Line 
                type="monotone" 
                dataKey="assets_p10" 
                stroke="#ef4444" 
                strokeWidth={2}
                dot={false}
                name="10th Percentile (Pessimistic)"
              />
              <Line 
                type="monotone" 
                dataKey="assets_p50" 
                stroke="#3b82f6" 
                strokeWidth={3}
                dot={false}
                name="50th Percentile (Median)"
              />
              <Line 
                type="monotone" 
                dataKey="assets_p90" 
                stroke="#10b981" 
                strokeWidth={2}
                dot={false}
                name="90th Percentile (Optimistic)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap justify-center gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-red-500"></div>
            <span>10th Percentile (Pessimistic)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-blue-500 border-2"></div>
            <span>50th Percentile (Median)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-green-500"></div>
            <span>90th Percentile (Optimistic)</span>
          </div>
        </div>
      </div>

      {/* Monthly Spending Chart */}
      <div>
        <h4 className="text-lg font-semibold mb-4 text-gray-900">Total Monthly Spending During Retirement</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={chartData.filter(d => d.age >= results.params.retirementAge)}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis 
                dataKey="age" 
                tick={{ fontSize: 12 }}
                label={{ value: 'Age', position: 'insideBottom', offset: -10 }}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickFormatter={formatCurrencyShort}
                label={{ value: 'Total Monthly Spending (€)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value: number) => [formatCurrency(value), '']}
                labelFormatter={(age) => `Age: ${age}`}
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="spending_p10" fill="#fbbf24" opacity={0.6} name="10th Percentile" />
              <Bar dataKey="spending_p50" fill="#8b5cf6" opacity={0.8} name="50th Percentile" />
              <Bar dataKey="spending_p90" fill="#f97316" opacity={0.6} name="90th Percentile" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap justify-center gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-400 opacity-60"></div>
            <span>10th Percentile</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-purple-500 opacity-80"></div>
            <span>50th Percentile</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-500 opacity-60"></div>
            <span>90th Percentile</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 text-center mt-2">
          Includes monthly expenses plus annualized annual expenses (vacations, repairs, etc.)
        </p>
      </div>
    </div>
  )
}