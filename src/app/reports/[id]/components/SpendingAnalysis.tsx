'use client'

import { useRef } from 'react'
import { SimulationResults } from '@/types'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

interface SpendingAnalysisProps {
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

export function SpendingAnalysis({ results, reportDate, reportId }: SpendingAnalysisProps) {
  const chartRef = useRef<ChartJS<'bar'>>(null)
  
  // Get first 20 years of retirement spending data
  const retirementStartIndex = results.ages.findIndex(age => age === results.params.retirementAge)
  const spendingData = results.ages
    .slice(retirementStartIndex, retirementStartIndex + 20)
    .map((age, index) => ({
      age,
      spending: results.spendingPercentiles.p50[retirementStartIndex + index] || 0
    }))
    .filter((item, index) => index % 2 === 0) // Show every other year to avoid crowding

  const chartData = {
    labels: spendingData.map(item => item.age.toString()),
    datasets: [
      {
        label: 'Monthly Spending (EUR)',
        data: spendingData.map(item => item.spending),
        backgroundColor: 'rgba(139, 92, 246, 0.8)',
        borderColor: 'rgb(139, 92, 246)',
        borderWidth: 1,
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
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            return `Monthly Spending: ${formatCurrency(context.parsed.y)}`
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
      },
      y: {
        title: {
          display: true,
          text: 'Monthly Spending (EUR)',
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
  }

  const totalMonthlyExpenses = Object.values(results.params.monthlyExpenses).reduce((sum, exp) => sum + exp, 0)
  const totalAnnualExpenses = Object.values(results.params.annualExpenses).reduce((sum, exp) => sum + exp, 0)
  const monthlyEquivalentAnnual = totalAnnualExpenses / 12

  return (
    <div className="report-section p-8 bg-white">
      {/* Header */}
      <div className="print-only mb-6 text-right text-sm text-gray-500">
        <p>Report Generated: {reportDate}</p>
        <p>Report ID: {reportId}</p>
      </div>
      
      <h1 className="text-3xl font-bold text-blue-600 mb-8">Retirement Spending Analysis</h1>
      
      {/* Description */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Monthly Spending During Retirement</h2>
        <p className="text-gray-600 mb-6">
          This analysis shows your total monthly spending needs during retirement, including both 
          regular monthly expenses and the monthly portion of annual expenses (vacations, repairs, etc.), 
          all adjusted for inflation.
        </p>
      </div>

      {/* Chart */}
      <div className="chart-container mb-8 bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">Monthly Spending by Age</h3>
        <div className="h-80 w-full">
          <Bar ref={chartRef} data={chartData} options={chartOptions} />
        </div>
        <p className="text-sm text-gray-500 mt-4 text-center">
          Bar chart showing monthly spending requirements during retirement across different scenarios, including inflation-adjusted expenses.
        </p>
      </div>

      {/* Spending Components and Inflation Impact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-purple-50 p-6 rounded-lg">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Spending Components</h3>
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-800 mb-2">Monthly Expenses:</p>
            <div className="space-y-1 text-sm text-gray-600 ml-4">
              <div className="flex justify-between">
                <span>• Health:</span>
                <span>{formatCurrency(results.params.monthlyExpenses.health)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Food:</span>
                <span>{formatCurrency(results.params.monthlyExpenses.food)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Entertainment:</span>
                <span>{formatCurrency(results.params.monthlyExpenses.entertainment)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Shopping:</span>
                <span>{formatCurrency(results.params.monthlyExpenses.shopping)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Utilities:</span>
                <span>{formatCurrency(results.params.monthlyExpenses.utilities)}</span>
              </div>
            </div>
          </div>
          
          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">Annual Expenses (Monthly Avg):</p>
            <div className="space-y-1 text-sm text-gray-600 ml-4">
              <div className="flex justify-between">
                <span>• Vacations:</span>
                <span>{formatCurrency(results.params.annualExpenses.vacations / 12)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Repairs:</span>
                <span>{formatCurrency(results.params.annualExpenses.repairs / 12)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Car:</span>
                <span>{formatCurrency(results.params.annualExpenses.carMaintenance / 12)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 p-6 rounded-lg">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Inflation Impact</h3>
          <p className="text-sm text-gray-600 mb-4">
            All expenses are adjusted for inflation at {(results.params.averageInflation * 100).toFixed(1)}% annually. 
            This means your spending power requirements increase over time to maintain the same lifestyle.
          </p>
          
          <div className="bg-white p-4 rounded border border-blue-200">
            <p className="text-sm font-medium text-blue-800 mb-2">Example:</p>
            <p className="text-sm text-blue-700">
              An expense of €1,000 today will require approximately €1,344 in 10 years and €1,806 in 20 years 
              to maintain the same purchasing power.
            </p>
          </div>
        </div>
      </div>

      {/* Income vs. Expenses Analysis */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Income vs. Expenses Analysis</h2>
        
        <p className="text-gray-600 mb-6">
          Starting at age {results.params.legalRetirementAge}, you'll receive a monthly pension of {formatCurrency(results.params.monthlyPension)} 
          (in today's purchasing power). This pension will also be adjusted for inflation.
        </p>

        <div className="bg-gray-50 rounded-lg overflow-hidden mb-6">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-4 text-left font-bold text-gray-800">Phase</th>
                <th className="px-6 py-4 text-left font-bold text-gray-800">Primary Funding Source</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 text-gray-800">Age {results.params.retirementAge}-{results.params.legalRetirementAge}</td>
                <td className="px-6 py-4 text-gray-600">Personal Assets Only</td>
              </tr>
              <tr>
                <td className="px-6 py-4 text-gray-800">Age {results.params.legalRetirementAge}+</td>
                <td className="px-6 py-4 text-gray-600">Pension + Asset Withdrawals</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Pension Coverage Analysis */}
        {results.params.monthlyPension * 12 > (totalMonthlyExpenses * 12 + totalAnnualExpenses) && (
          <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-green-800 mb-2">✓ Pension Coverage</h3>
            <p className="text-green-700">
              Your expected pension income exceeds your planned expenses, providing additional security 
              in later retirement years.
            </p>
          </div>
        )}
        
        {results.params.retirementAge < results.params.legalRetirementAge && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-lg mt-4">
            <h3 className="text-lg font-bold text-yellow-800 mb-2">⚠ Early Retirement Gap</h3>
            <p className="text-yellow-700 mb-2">
              You plan to retire {results.params.legalRetirementAge - results.params.retirementAge} years before 
              pension eligibility. During this period, you'll rely entirely on personal assets.
            </p>
            <p className="text-sm text-yellow-600">
              Consider building a separate "bridge fund" or ensuring sufficient liquid assets for this period.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}