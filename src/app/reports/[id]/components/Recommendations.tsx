import { SimulationResults } from '@/types'

interface RecommendationsProps {
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

export function Recommendations({ results, reportDate, reportId }: RecommendationsProps) {
  const totalMonthlyExpenses = Object.values(results.params.monthlyExpenses).reduce((sum, exp) => sum + exp, 0)
  const totalAnnualExpenses = Object.values(results.params.annualExpenses).reduce((sum, exp) => sum + exp, 0)
  const totalAnnualCost = (totalMonthlyExpenses * 12) + totalAnnualExpenses
  
  // Calculate bridge fund needed for early retirement
  const yearsBeforePension = results.params.legalRetirementAge - results.params.retirementAge
  const bridgeFundNeeded = yearsBeforePension > 0 ? totalAnnualCost * yearsBeforePension : 0

  const getSavingsRate = () => {
    // Estimate income from savings (rough calculation)
    const estimatedIncome = results.params.annualSavings / 0.15 // Assume 15% savings rate
    return results.params.annualSavings / estimatedIncome
  }

  return (
    <div className="report-section p-8 bg-white">
      {/* Header */}
      <div className="print-only mb-6 text-right text-sm text-gray-500">
        <p>Report Generated: {reportDate}</p>
        <p>Report ID: {reportId}</p>
      </div>
      
      <h1 className="text-3xl font-bold text-blue-600 mb-8">Personalized Recommendations</h1>
      
      {/* Action Plan */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Action Plan for Retirement Success</h2>
        <p className="text-gray-600 mb-6">
          Based on your specific situation and simulation results, here are personalized recommendations to improve your 
          retirement security and optimize your financial strategy.
        </p>

        {/* Priority Actions */}
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Priority Actions</h3>
          
          {yearsBeforePension > 0 && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg mb-4">
              <h4 className="text-md font-bold text-blue-800 mb-2">Early Retirement Funding Gap</h4>
              <p className="text-sm text-blue-700 mb-2">
                <strong>Category:</strong> Bridge Strategy
              </p>
              <p className="text-blue-700 mb-3">
                You have a {yearsBeforePension}-year gap between retirement and pension eligibility. 
                Build a separate fund of approximately {formatCurrency(bridgeFundNeeded)} to bridge this period.
              </p>
              <div className="bg-blue-100 px-3 py-1 rounded text-sm font-medium text-blue-800 inline-block">
                Expected Impact: High
              </div>
            </div>
          )}

          {results.successRate < 85 && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-lg mb-4">
              <h4 className="text-md font-bold text-yellow-800 mb-2">Improve Success Rate</h4>
              <p className="text-sm text-yellow-700 mb-2">
                <strong>Category:</strong> Risk Reduction
              </p>
              <p className="text-yellow-700 mb-3">
                Consider increasing annual savings by 10-20% or reducing expenses to improve your success probability 
                from {results.successRate.toFixed(1)}% to above 85%.
              </p>
              <div className="bg-yellow-100 px-3 py-1 rounded text-sm font-medium text-yellow-800 inline-block">
                Expected Impact: High
              </div>
            </div>
          )}
        </div>

        {/* Additional Opportunities */}
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Additional Opportunities</h3>
          
          <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-lg mb-4">
            <h4 className="text-md font-bold text-green-800 mb-2">Begin Retirement Transition</h4>
            <p className="text-sm text-green-700 mb-2">
              <strong>Category:</strong> Investment Strategy
            </p>
            <p className="text-green-700 mb-3">
              With {results.params.retirementAge - results.params.currentAge} years to retirement, 
              gradually shift toward more conservative allocations (60-70% equities).
            </p>
            <div className="bg-green-100 px-3 py-1 rounded text-sm font-medium text-green-800 inline-block">
              Expected Impact: Medium
            </div>
          </div>

          {results.params.monthlyPension * 12 < totalAnnualCost && (
            <div className="bg-purple-50 border-l-4 border-purple-500 p-6 rounded-lg mb-4">
              <h4 className="text-md font-bold text-purple-800 mb-2">Pension Gap Analysis</h4>
              <p className="text-sm text-purple-700 mb-2">
                <strong>Category:</strong> Income Planning
              </p>
              <p className="text-purple-700 mb-3">
                Your expected pension ({formatCurrency(results.params.monthlyPension * 12)} annually) 
                will not cover your full expenses ({formatCurrency(totalAnnualCost)} annually). 
                Plan for additional asset withdrawals of {formatCurrency(totalAnnualCost - (results.params.monthlyPension * 12))} per year.
              </p>
              <div className="bg-purple-100 px-3 py-1 rounded text-sm font-medium text-purple-800 inline-block">
                Expected Impact: Medium
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Implementation Timeline */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Implementation Timeline</h2>
        
        <div className="bg-gray-50 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-4 text-left font-bold text-gray-800">Timeframe</th>
                <th className="px-6 py-4 text-left font-bold text-gray-800">Priority Actions</th>
                <th className="px-6 py-4 text-left font-bold text-gray-800">Review Frequency</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Next 30 Days</td>
                <td className="px-6 py-4 text-gray-600">Review investment allocation</td>
                <td className="px-6 py-4 text-gray-600">Immediate</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Next 3 Months</td>
                <td className="px-6 py-4 text-gray-600">Implement high-priority changes</td>
                <td className="px-6 py-4 text-gray-600">Monthly</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Next 6-12 Months</td>
                <td className="px-6 py-4 text-gray-600">Execute medium-priority optimizations</td>
                <td className="px-6 py-4 text-gray-600">Quarterly</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-gray-800">Ongoing</td>
                <td className="px-6 py-4 text-gray-600">Monitor progress and adjust</td>
                <td className="px-6 py-4 text-gray-600">Annual</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Professional Guidance */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">When to Consult a Financial Advisor</h2>
        
        <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-bold text-blue-800 mb-4">Consider Professional Guidance If:</h3>
          <ul className="space-y-2 text-sm text-blue-700">
            <li>• Your success rate is below 80%</li>
            <li>• You have complex tax situations or multiple income sources</li>
            <li>• You're within 5 years of retirement</li>
            <li>• You have significant life changes (marriage, divorce, inheritance)</li>
            <li>• You're considering early retirement</li>
            <li>• You need help with estate planning or tax optimization</li>
          </ul>
        </div>

        <p className="text-gray-600 mb-6">
          A qualified financial advisor can provide personalized strategies, tax optimization, estate planning, 
          and ongoing portfolio management tailored to your specific situation.
        </p>
      </div>

      {/* Plan Management */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Ongoing Plan Management</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Annual Review Checklist</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>☐ Update income and expense projections</li>
              <li>☐ Review investment performance and allocation</li>
              <li>☐ Reassess risk tolerance and time horizon</li>
              <li>☐ Update beneficiaries and estate documents</li>
              <li>☐ Re-run retirement simulation</li>
              <li>☐ Adjust savings rate if needed</li>
            </ul>
          </div>

          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Major Life Event Reviews</h3>
            <p className="text-sm text-gray-600 mb-3">Update your plan when experiencing:</p>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>• Job changes or promotions</li>
              <li>• Marriage or divorce</li>
              <li>• Birth of children</li>
              <li>• Health issues</li>
              <li>• Inheritance or windfalls</li>
              <li>• Major market events</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Progress Tracking */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Track Your Progress</h2>
        
        <div className="bg-gray-50 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-4 text-left font-bold text-gray-800">Key Metric</th>
                <th className="px-6 py-4 text-left font-bold text-gray-800">Target/Current Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Annual Savings Rate</td>
                <td className="px-6 py-4 text-gray-600">Target: 15-20% | Current: {formatCurrency(results.params.annualSavings)}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Asset Growth Rate</td>
                <td className="px-6 py-4 text-gray-600">Target: 4.5% real return</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="px-6 py-4 font-medium text-gray-800">Retirement Readiness</td>
                <td className="px-6 py-4 text-gray-600">Current: {results.successRate.toFixed(1)}% | Target: 85%+</td>
              </tr>
              <tr>
                <td className="px-6 py-4 font-medium text-gray-800">Emergency Fund</td>
                <td className="px-6 py-4 text-gray-600">Target: 3-6 months expenses</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Final Message */}
      <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-lg">
        <h3 className="text-lg font-bold text-green-800 mb-2">✓ You're on the Right Track</h3>
        <p className="text-green-700 mb-4">
          Creating a comprehensive retirement plan puts you ahead of many people. By regularly reviewing and 
          adjusting your strategy, you're building a foundation for financial security and peace of mind in retirement.
        </p>
        <p className="text-sm text-green-600">
          Remember that retirement planning is a journey, not a destination. Stay consistent with your savings, 
          remain flexible with your strategies, and celebrate the progress you make along the way.
        </p>
      </div>
    </div>
  )
}