'use client'

import { useEffect, useRef } from 'react'
import { SimulationResults } from '@/types'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

interface AssetProjectionsProps {
  results: SimulationResults
  reportDate: string
  reportId: string
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function AssetProjections({ results, reportDate, reportId }: AssetProjectionsProps) {
  const chartRef = useRef<ChartJS<'line'>>(null)
  
  // Prepare chart data
  const chartData = {
    labels: results.ages.map(age => age.toString()),
    datasets: [
      {
        label: '10th Percentile (Pessimistic)',
        data: results.assetPercentiles.p10,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
      },
      {
        label: '50th Percentile (Most Likely)',
        data: results.assetPercentiles.p50,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 3,
        fill: false,
        pointRadius: 0,
      },
      {
        label: '90th Percentile (Optimistic)',
        data: results.assetPercentiles.p90,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        right: 20,
      },
    },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          boxWidth: 12,
          padding: 15,
          font: {
            size: 12,
          },
        },
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Age',
          font: {
            size: 14,
            weight: 'bold' as const,
          },
        },
        grid: {
          display: false,
        },
        ticks: {
          callback: function(value: any, index: number) {
            // Show every 5th age to avoid crowding
            return index % 5 === 0 ? results.ages[index] : ''
          },
        },
      },
      y: {
        title: {
          display: true,
          text: 'Assets (EUR)',
          font: {
            size: 14,
            weight: 'bold' as const,
          },
        },
        ticks: {
          callback: function(value: any) {
            return formatCurrency(value)
          },
        },
      },
    },
    elements: {
      line: {
        tension: 0.1,
      },
    },
  }

  // Key milestones data
  const milestones = [
    { age: results.params.currentAge, label: 'Today' },
    { age: results.params.retirementAge, label: 'Retirement' },
    { age: results.params.legalRetirementAge, label: 'Pension Starts' },
    { age: results.params.endAge, label: 'End of Plan' }
  ].map(milestone => {
    const index = results.ages.findIndex(age => age === milestone.age)
    return {
      ...milestone,
      p10: index >= 0 ? results.assetPercentiles.p10[index] : 0,
      p50: index >= 0 ? results.assetPercentiles.p50[index] : 0,
      p90: index >= 0 ? results.assetPercentiles.p90[index] : 0,
    }
  }).filter(m => m.p50 > 0)

  return (
    <div className="report-section p-8 bg-white">
      {/* Header */}
      <div className="print-only mb-6 text-right text-sm text-gray-500">
        <p>Report Generated: {reportDate}</p>
        <p>Report ID: {reportId}</p>
      </div>
      
      <h1 className="text-3xl font-bold text-blue-600 mb-8">Asset Projections Analysis</h1>
      
      {/* Description */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Asset Growth Over Time</h2>
        <p className="text-gray-600 mb-6">
          This chart shows how your assets are projected to grow and decline over your lifetime under three different 
          scenarios: pessimistic (10th percentile), most likely (50th percentile), and optimistic (90th percentile).
        </p>
      </div>

      {/* Chart */}
      <div className="chart-container mb-8 bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">Asset Projections by Age</h3>
        <div className="h-96 w-full">
          <Line ref={chartRef} data={chartData} options={chartOptions} />
        </div>
        <p className="text-sm text-gray-500 mt-4 text-center">
          Line chart showing pessimistic (red), median (blue), and optimistic (green) percentile asset projections from current age through retirement planning horizon.
        </p>
      </div>

      {/* Chart Legend and Observations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-blue-50 p-6 rounded-lg">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Chart Legend</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-6 h-1 bg-red-500 rounded"></div>
              <span className="text-sm">
                <strong>Red Line (10th Percentile):</strong> Pessimistic scenario - only 10% of simulations perform worse than this
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-1 bg-blue-500 rounded"></div>
              <span className="text-sm">
                <strong>Blue Line (50th Percentile):</strong> Most likely scenario - median outcome across all simulations
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-1 bg-green-500 rounded"></div>
              <span className="text-sm">
                <strong>Green Line (90th Percentile):</strong> Optimistic scenario - 90% of simulations perform worse than this
              </span>
            </div>
          </div>
        </div>

        <div className="bg-green-50 p-6 rounded-lg">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Key Observations</h3>
          <div className="space-y-3">
            <p className="text-sm">
              <strong>Accumulation Phase:</strong> Assets grow from savings and investment returns
            </p>
            <p className="text-sm">
              <strong>Retirement Transition:</strong> Assets peak around retirement age
            </p>
            <p className="text-sm">
              <strong>Distribution Phase:</strong> Assets decline as you fund retirement expenses
            </p>
          </div>
        </div>
      </div>

      {/* Asset Values Table */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Asset Values at Key Milestones</h2>
        
        <div className="bg-gray-50 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-4 text-left font-bold text-gray-800">Age</th>
                <th className="px-6 py-4 text-right font-bold text-gray-800">Pessimistic (P10)</th>
                <th className="px-6 py-4 text-right font-bold text-gray-800">Most Likely (P50)</th>
                <th className="px-6 py-4 text-right font-bold text-gray-800">Optimistic (P90)</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((milestone, index) => (
                <tr key={milestone.age} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 font-medium text-gray-800">
                    {milestone.age} ({milestone.label})
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-right font-mono">
                    {formatCurrency(milestone.p10)}
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-right font-mono">
                    {formatCurrency(milestone.p50)}
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-right font-mono">
                    {formatCurrency(milestone.p90)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Risk Analysis */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Risk Analysis</h2>
        
        {milestones[milestones.length - 1]?.p10 > 0 ? (
          <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-green-800 mb-2">✓ Asset Sustainability</h3>
            <p className="text-green-700">
              Even in pessimistic scenarios, your assets are projected to last through the planning period.
            </p>
          </div>
        ) : (
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-red-800 mb-2">⚠ Asset Depletion Risk</h3>
            <p className="text-red-700">
              In the pessimistic scenario (10th percentile), your assets may be depleted before the end 
              of the planning period. Consider strategies to reduce this risk.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}