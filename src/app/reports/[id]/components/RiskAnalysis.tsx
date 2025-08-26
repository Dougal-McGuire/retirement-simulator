import { SimulationResults } from '@/types'

interface RiskAnalysisProps {
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

export function RiskAnalysis({ results, reportDate, reportId }: RiskAnalysisProps) {
  const getRiskLevel = (successRate: number) => {
    if (successRate >= 90) return { level: 'Low', color: 'text-green-600', bgColor: 'bg-green-50' }
    if (successRate >= 80) return { level: 'Medium', color: 'text-yellow-600', bgColor: 'bg-yellow-50' }
    if (successRate >= 70) return { level: 'High', color: 'text-orange-600', bgColor: 'bg-orange-50' }
    return { level: 'Very High', color: 'text-red-600', bgColor: 'bg-red-50' }
  }

  const overallRisk = getRiskLevel(results.successRate)
  
  // Get asset values at key points
  const retirementIndex = results.ages.findIndex(age => age === results.params.retirementAge)
  const endIndex = results.ages.length - 1
  
  const pessimisticRetirement = retirementIndex >= 0 ? results.assetPercentiles.p10[retirementIndex] : 0
  const optimisticRetirement = retirementIndex >= 0 ? results.assetPercentiles.p90[retirementIndex] : 0
  const pessimisticEnd = results.assetPercentiles.p10[endIndex]
  const optimisticEnd = results.assetPercentiles.p90[endIndex]

  return (
    <div className="report-section p-8 bg-white">
      {/* Header */}
      <div className="print-only mb-6 text-right text-sm text-gray-500">
        <p>Report Generated: {reportDate}</p>
        <p>Report ID: {reportId}</p>
      </div>
      
      <h1 className="text-3xl font-bold text-blue-600 mb-8">Risk Analysis & Scenario Testing</h1>
      
      {/* Risk Assessment Summary */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Risk Assessment Summary</h2>
        
        <div className={`p-6 rounded-lg mb-6 ${overallRisk.bgColor}`}>
          <h3 className="text-lg font-bold text-gray-800 mb-4">Overall Risk Profile</h3>
          <div className="flex items-center gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-600">Success Probability</p>
              <p className={`text-3xl font-bold ${overallRisk.color}`}>
                {results.successRate.toFixed(1)}%
              </p>
            </div>
            <div className={`px-4 py-2 rounded-full ${overallRisk.color} bg-white border-2 border-current`}>
              <p className="font-medium">Risk Level: {overallRisk.level}</p>
            </div>
          </div>
          <p className="text-gray-600">
            This represents the percentage of simulations where your assets lasted through age {results.params.endAge} 
            while maintaining your desired spending level.
          </p>
        </div>

        {/* Risk Factors Table */}
        <div className="bg-gray-50 rounded-lg overflow-hidden">
          <h3 className="text-lg font-bold text-gray-800 p-6 bg-gray-100">Risk Factor Assessment</h3>
          <table className="w-full">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Asset Depletion Risk</td>
                <td className="px-6 py-4 text-gray-600">
                  {pessimisticEnd <= 0 ? 'High - Assets may be depleted' : 'Medium - Significant asset reduction possible'}
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Sequence of Returns Risk</td>
                <td className="px-6 py-4 text-gray-600">
                  {results.params.retirementAge < results.params.legalRetirementAge ? 'High' : 'Medium'}
                </td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Inflation Risk</td>
                <td className="px-6 py-4 text-gray-600">
                  {results.params.averageInflation > 0.025 ? 'Medium' : 'Low'}
                </td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-gray-800">Longevity Risk</td>
                <td className="px-6 py-4 text-gray-600">
                  {results.params.endAge > 90 ? 'Medium' : results.params.endAge > 85 ? 'Low' : 'Very Low'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Scenario Analysis */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Scenario Analysis</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pessimistic Scenario */}
          <div className="bg-red-50 border border-red-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-red-800 mb-4">Pessimistic Scenario (10th Percentile)</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-red-600">At Retirement:</p>
                <p className="text-xl font-bold text-red-800">{formatCurrency(pessimisticRetirement)}</p>
              </div>
              <div>
                <p className="text-sm text-red-600">At Age {results.params.endAge}:</p>
                <p className="text-xl font-bold text-red-800">{formatCurrency(pessimisticEnd)}</p>
              </div>
              <p className="text-xs text-red-600 mt-4">
                This scenario assumes poor market performance, high inflation, or other adverse conditions.
              </p>
            </div>
          </div>

          {/* Optimistic Scenario */}
          <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-green-800 mb-4">Optimistic Scenario (90th Percentile)</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-green-600">At Retirement:</p>
                <p className="text-xl font-bold text-green-800">{formatCurrency(optimisticRetirement)}</p>
              </div>
              <div>
                <p className="text-sm text-green-600">At Age {results.params.endAge}:</p>
                <p className="text-xl font-bold text-green-800">{formatCurrency(optimisticEnd)}</p>
              </div>
              <p className="text-xs text-green-600 mt-4">
                This scenario assumes favorable market conditions and controlled inflation.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sensitivity Analysis */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Sensitivity to Key Variables</h2>
        <p className="text-gray-600 mb-4">Your retirement plan's sensitivity to changes in key assumptions:</p>
        
        <div className="bg-gray-50 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-4 text-left font-bold text-gray-800">Variable</th>
                <th className="px-6 py-4 text-center font-bold text-gray-800">Current</th>
                <th className="px-6 py-4 text-center font-bold text-gray-800">+1% Impact</th>
                <th className="px-6 py-4 text-center font-bold text-gray-800">-1% Impact</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Investment Return</td>
                <td className="px-6 py-4 text-center text-gray-600">{(results.params.averageROI * 100).toFixed(1)}%</td>
                <td className="px-6 py-4 text-center text-green-600 font-medium">Significant +</td>
                <td className="px-6 py-4 text-center text-red-600 font-medium">Significant -</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Inflation Rate</td>
                <td className="px-6 py-4 text-center text-gray-600">{(results.params.averageInflation * 100).toFixed(1)}%</td>
                <td className="px-6 py-4 text-center text-red-600 font-medium">Moderate -</td>
                <td className="px-6 py-4 text-center text-green-600 font-medium">Moderate +</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Annual Savings</td>
                <td className="px-6 py-4 text-center text-gray-600">{formatCurrency(results.params.annualSavings)}</td>
                <td className="px-6 py-4 text-center text-green-600 font-medium">High +</td>
                <td className="px-6 py-4 text-center text-red-600 font-medium">High -</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-gray-800">Retirement Age</td>
                <td className="px-6 py-4 text-center text-gray-600">{results.params.retirementAge}</td>
                <td className="px-6 py-4 text-center text-green-600 font-medium">1 yr later: +</td>
                <td className="px-6 py-4 text-center text-red-600 font-medium">1 yr earlier: -</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Risk Mitigation Strategies */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Risk Mitigation Strategies</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-blue-800 mb-4">Sequence of Returns Risk</h3>
            <p className="text-sm text-blue-700 mb-3">
              Risk of poor returns early in retirement when withdrawals are high.
            </p>
            <div className="text-sm text-blue-600">
              <p className="font-medium mb-2">Mitigation:</p>
              <ul className="space-y-1 ml-4">
                <li>• Maintain 2-3 years expenses in cash/bonds</li>
                <li>• Use bond tent strategy approaching retirement</li>
                <li>• Consider flexible withdrawal strategies</li>
                <li>• Consider annuities for guaranteed income</li>
              </ul>
            </div>
          </div>

          <div className="bg-purple-50 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-purple-800 mb-4">Longevity Risk</h3>
            <p className="text-sm text-purple-700 mb-3">
              Risk of outliving your assets due to longer than expected lifespan.
            </p>
            <div className="text-sm text-purple-600">
              <p className="font-medium mb-2">Mitigation:</p>
              <ul className="space-y-1 ml-4">
                <li>• Plan for age 90+ even if optimistic</li>
                <li>• Maintain some equity exposure in retirement</li>
                <li>• Consider long-term care insurance</li>
                <li>• Review healthcare cost projections</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="bg-yellow-50 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-yellow-800 mb-4">Inflation Risk</h3>
            <p className="text-sm text-yellow-700 mb-3">
              Risk of reduced purchasing power over long retirement periods.
            </p>
            <div className="text-sm text-yellow-600">
              <p className="font-medium mb-2">Mitigation:</p>
              <ul className="space-y-1 ml-4">
                <li>• Maintain equity allocations in retirement</li>
                <li>• Consider TIPS or I-Bonds</li>
                <li>• Plan for variable spending in retirement</li>
                <li>• Review assumptions annually</li>
              </ul>
            </div>
          </div>

          <div className="bg-green-50 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-green-800 mb-4">Healthcare Cost Risk</h3>
            <p className="text-sm text-green-700 mb-3">
              Risk of healthcare costs exceeding planned medical expenses.
            </p>
            <div className="text-sm text-green-600">
              <p className="font-medium mb-2">Mitigation:</p>
              <ul className="space-y-1 ml-4">
                <li>• Budget extra 20-30% for healthcare</li>
                <li>• Consider long-term care insurance</li>
                <li>• Maintain HSA if available</li>
                <li>• Research healthcare options for retirees</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}