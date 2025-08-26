import { SimulationParams } from '@/types'

interface PersonalProfileProps {
  params: SimulationParams
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

export function PersonalProfile({ params, reportDate, reportId }: PersonalProfileProps) {
  return (
    <div className="report-section p-8 bg-white">
      {/* Header */}
      <div className="print-only mb-6 text-right text-sm text-gray-500">
        <p>Report Generated: {reportDate}</p>
        <p>Report ID: {reportId}</p>
      </div>
      
      <h1 className="text-3xl font-bold text-blue-600 mb-8">Personal Profile & Financial Assumptions</h1>
      
      {/* Personal Information */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Personal Information</h2>
        
        <div className="bg-gray-50 rounded-lg overflow-hidden">
          <table className="w-full">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Current Age</td>
                <td className="px-6 py-4 text-gray-600">{params.currentAge} years</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Planned Retirement Age</td>
                <td className="px-6 py-4 text-gray-600">{params.retirementAge} years</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Legal Retirement Age (Pension Starts)</td>
                <td className="px-6 py-4 text-gray-600">{params.legalRetirementAge} years</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-gray-800">Planning Horizon</td>
                <td className="px-6 py-4 text-gray-600">{params.endAge} years</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> The planning horizon represents the age until which we model your financial needs. 
            This provides a comprehensive long-term view while acknowledging that actual longevity may vary.
          </p>
        </div>
      </div>
      
      {/* Current Financial Position */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Current Financial Position</h2>
        
        <div className="bg-gray-50 rounded-lg overflow-hidden">
          <table className="w-full">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Current Total Assets</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{formatCurrency(params.currentAssets)}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Annual Savings</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{formatCurrency(params.annualSavings)}</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-gray-800">Expected Monthly Pension</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{formatCurrency(params.monthlyPension)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div className="mt-6 p-6 bg-blue-50 rounded-lg">
          <h3 className="text-lg font-bold text-blue-800 mb-4">Assumptions Explained</h3>
          <div className="space-y-3 text-sm text-blue-700">
            <p>
              <strong>Current Assets:</strong> Total value of all invested assets, including 401(k), IRA, brokerage accounts, 
              and other retirement savings. This excludes your primary residence and emergency funds.
            </p>
            <p>
              <strong>Annual Savings:</strong> Amount you plan to save each year until retirement. This should include 
              employer matching contributions and all retirement account contributions.
            </p>
            <p>
              <strong>Monthly Pension:</strong> Expected monthly pension or Social Security benefits starting at your 
              legal retirement age. This amount is inflation-adjusted in our projections.
            </p>
          </div>
        </div>
      </div>
      
      {/* Monthly Expenses */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Monthly Expenses During Retirement</h2>
        
        <div className="bg-gray-50 rounded-lg overflow-hidden">
          <table className="w-full">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Health & Medical</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{formatCurrency(params.monthlyExpenses.health)}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Food & Groceries</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{formatCurrency(params.monthlyExpenses.food)}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Entertainment & Leisure</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{formatCurrency(params.monthlyExpenses.entertainment)}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Shopping & Miscellaneous</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{formatCurrency(params.monthlyExpenses.shopping)}</td>
              </tr>
              <tr className="border-b border-gray-200 bg-white">
                <td className="px-6 py-4 font-medium text-gray-800">Utilities & Housing</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{formatCurrency(params.monthlyExpenses.utilities)}</td>
              </tr>
              <tr className="bg-blue-100">
                <td className="px-6 py-4 font-bold text-gray-800">Total Monthly</td>
                <td className="px-6 py-4 text-gray-800 text-right font-mono font-bold">
                  {formatCurrency(Object.values(params.monthlyExpenses).reduce((sum, exp) => sum + exp, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Annual Expenses */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Annual Expenses</h2>
        
        <div className="bg-gray-50 rounded-lg overflow-hidden">
          <table className="w-full">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Vacations & Travel</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{formatCurrency(params.annualExpenses.vacations)}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Home Repairs & Maintenance</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{formatCurrency(params.annualExpenses.repairs)}</td>
              </tr>
              <tr className="border-b border-gray-200 bg-white">
                <td className="px-6 py-4 font-medium text-gray-800">Car Maintenance & Insurance</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{formatCurrency(params.annualExpenses.carMaintenance)}</td>
              </tr>
              <tr className="border-b border-gray-200 bg-blue-100">
                <td className="px-6 py-4 font-bold text-gray-800">Total Annual</td>
                <td className="px-6 py-4 text-gray-800 text-right font-mono font-bold">
                  {formatCurrency(Object.values(params.annualExpenses).reduce((sum, exp) => sum + exp, 0))}
                </td>
              </tr>
              <tr className="bg-green-100">
                <td className="px-6 py-4 font-bold text-gray-800">Monthly Equivalent</td>
                <td className="px-6 py-4 text-gray-800 text-right font-mono font-bold">
                  {formatCurrency(Object.values(params.annualExpenses).reduce((sum, exp) => sum + exp, 0) / 12)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
          <p className="text-sm text-yellow-800">
            Annual expenses are distributed evenly across each year in the simulation and adjusted for inflation.
          </p>
        </div>
      </div>
      
      {/* Market Assumptions */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Market & Economic Assumptions</h2>
        
        <div className="bg-gray-50 rounded-lg overflow-hidden">
          <table className="w-full">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Average Return on Investment (ROI)</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{(params.averageROI * 100).toFixed(2)}%</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">ROI Volatility (Standard Deviation)</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{(params.roiVolatility * 100).toFixed(2)}%</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Average Inflation Rate</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{(params.averageInflation * 100).toFixed(2)}%</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Inflation Volatility</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{(params.inflationVolatility * 100).toFixed(2)}%</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Capital Gains Tax Rate</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{(params.capitalGainsTax * 100).toFixed(2)}%</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-gray-800">Monte Carlo Simulation Runs</td>
                <td className="px-6 py-4 text-gray-600 text-right font-mono">{params.simulationRuns.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}