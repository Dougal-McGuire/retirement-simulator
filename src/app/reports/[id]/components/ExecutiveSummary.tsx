import { SimulationResults } from '@/types'

interface ExecutiveSummaryProps {
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

export function ExecutiveSummary({ results, reportDate, reportId }: ExecutiveSummaryProps) {
  const { params } = results
  
  // Calculate total monthly expenses
  const totalMonthlyExpenses = Object.values(params.monthlyExpenses).reduce((sum, exp) => sum + exp, 0)
  const totalAnnualExpenses = Object.values(params.annualExpenses).reduce((sum, exp) => sum + exp, 0)
  const monthlyEquivalentAnnual = totalAnnualExpenses / 12
  const totalMonthlyNeeds = totalMonthlyExpenses + monthlyEquivalentAnnual
  
  // Get projected assets at retirement
  const retirementIndex = results.ages.findIndex(age => age === params.retirementAge)
  const assetsAtRetirement = retirementIndex >= 0 ? results.assetPercentiles.p50[retirementIndex] : 0
  
  const getSuccessRating = (rate: number) => {
    if (rate >= 90) return { label: 'Excellent', color: 'text-green-600', bgColor: 'bg-green-50' }
    if (rate >= 80) return { label: 'Very Good', color: 'text-blue-600', bgColor: 'bg-blue-50' }
    if (rate >= 70) return { label: 'Good', color: 'text-yellow-600', bgColor: 'bg-yellow-50' }
    if (rate >= 60) return { label: 'Fair', color: 'text-orange-600', bgColor: 'bg-orange-50' }
    return { label: 'Poor', color: 'text-red-600', bgColor: 'bg-red-50' }
  }
  
  const successRating = getSuccessRating(results.successRate)

  return (
    <div className="report-section p-8 bg-white">
      {/* Header */}
      <div className="print-only mb-6 text-right text-sm text-gray-500">
        <p>Report Generated: {reportDate}</p>
        <p>Report ID: {reportId}</p>
      </div>
      
      <h1 className="text-3xl font-bold text-blue-600 mb-8">Executive Summary</h1>
      
      {/* Key Findings */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Key Findings</h2>
        
        {/* Success Rate */}
        <div className={`p-6 rounded-lg mb-6 ${successRating.bgColor}`}>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Retirement Success Probability</h3>
          <div className="flex items-center gap-4">
            <div className={`text-3xl font-bold ${successRating.color}`}>
              {results.successRate.toFixed(1)}%
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${successRating.color} bg-white`}>
              {successRating.label}
            </div>
          </div>
          <p className="text-gray-600 mt-2">
            Probability of maintaining your desired lifestyle throughout retirement
          </p>
        </div>
        
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Current Position */}
          <div className="bg-blue-50 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Current Position</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Current Assets</p>
                <p className="text-xl font-bold text-blue-600">{formatCurrency(params.currentAssets)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Annual Savings</p>
                <p className="text-xl font-bold text-blue-600">{formatCurrency(params.annualSavings)}</p>
              </div>
              <p className="text-xs text-gray-500 mt-4">Starting point for your retirement journey</p>
            </div>
          </div>
          
          {/* Retirement Projection */}
          <div className="bg-green-50 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Retirement Projection</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Assets at Age {params.retirementAge}</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(assetsAtRetirement)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Monthly Pension</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(params.monthlyPension)}</p>
              </div>
              <p className="text-xs text-gray-500 mt-4">Expected financial position at retirement</p>
            </div>
          </div>
        </div>
        
        {/* Spending Requirements */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Monthly Spending Requirement</h3>
            <p className="text-2xl font-bold text-gray-800 mb-4">{formatCurrency(totalMonthlyNeeds)}</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Health:</span>
                <span>{formatCurrency(params.monthlyExpenses.health)}</span>
              </div>
              <div className="flex justify-between">
                <span>Food:</span>
                <span>{formatCurrency(params.monthlyExpenses.food)}</span>
              </div>
              <div className="flex justify-between">
                <span>Utilities:</span>
                <span>{formatCurrency(params.monthlyExpenses.utilities)}</span>
              </div>
              <div className="flex justify-between">
                <span>Other:</span>
                <span>{formatCurrency(params.monthlyExpenses.entertainment + params.monthlyExpenses.shopping)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span>Annual expenses (monthly avg):</span>
                <span>{formatCurrency(monthlyEquivalentAnnual)}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-purple-50 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Critical Milestones</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm">Age {params.currentAge}: Current age (today)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-sm">Age {params.retirementAge}: Planned retirement</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm">Age {params.legalRetirementAge}: Pension starts</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span className="text-sm">Age {params.endAge}: Planning horizon</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Key Recommendations */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Key Recommendations</h2>
        
        {results.successRate >= 85 ? (
          <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-green-800 mb-2">✓ Excellent Planning</h3>
            <p className="text-green-700 mb-4">
              Your retirement plan is very robust. You may have opportunities for early retirement or increased spending.
            </p>
          </div>
        ) : results.successRate >= 70 ? (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-yellow-800 mb-2">⚠ Good Planning with Room for Improvement</h3>
            <p className="text-yellow-700 mb-4">
              Your plan is on track but could benefit from optimization to improve security.
            </p>
          </div>
        ) : (
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-red-800 mb-2">⚠ Plan Needs Attention</h3>
            <p className="text-red-700 mb-4">
              Consider increasing savings, reducing expenses, or delaying retirement to improve your success rate.
            </p>
          </div>
        )}
        
        <div className="mt-6 space-y-2 text-sm text-gray-600">
          <p>• <strong>Risk Assessment:</strong> Review the detailed risk analysis on pages 5-6</p>
          <p>• <strong>Asset Allocation:</strong> Consider age-appropriate investment strategies</p>
          <p>• <strong>Regular Reviews:</strong> Reassess your plan annually or after major life changes</p>
          <p>• <strong>Professional Guidance:</strong> Consider consulting with a certified financial planner</p>
        </div>
      </div>
      
      {/* Report Structure */}
      <div className="bg-gray-50 p-6 rounded-lg">
        <h2 className="text-xl font-bold text-gray-800 mb-4">Report Structure</h2>
        <p className="text-gray-600 mb-4">This comprehensive report contains:</p>
        <ul className="space-y-2 text-sm text-gray-600">
          <li>• Personal profile and financial assumptions (Page 3)</li>
          <li>• Asset and spending projections with interactive charts (Pages 4-5)</li>
          <li>• Risk analysis and scenario testing (Page 6)</li>
          <li>• Personalized recommendations and action plan (Page 7)</li>
          <li>• Technical appendix and methodology (Page 8)</li>
        </ul>
      </div>
    </div>
  )
}