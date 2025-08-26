import type { SimulationParams, SimulationResults } from '@/types'
import type { ReportData, Recommendation } from '@/lib/pdf-generator/schema/reportData'

export function transformToReportData(
  params: SimulationParams,
  results: SimulationResults
): ReportData {
  // Generate milestones from simulation results
  const milestones = results.ages.map((age, index) => ({
    age,
    p10: results.assetPercentiles.p10[index] || 0,
    p50: results.assetPercentiles.p50[index] || 0,
    p90: results.assetPercentiles.p90[index] || 0,
  }))

  // Generate recommendations based on success rate
  const recommendations = generateRecommendations(params, results)

  // Transform the data to match PDF generator schema
  return {
    person: {
      currentAge: params.currentAge,
      retireAge: params.retirementAge,
      pensionAge: params.legalRetirementAge,
      horizonAge: params.endAge,
    },
    finances: {
      currentAssetsEUR: params.currentAssets,
      annualSavingsEUR: params.annualSavings,
      expectedMonthlyPensionEUR: params.monthlyPension,
    },
    spending: {
      monthly: {
        health: params.monthlyExpenses.health,
        food: params.monthlyExpenses.food,
        entertainment: params.monthlyExpenses.entertainment,
        shopping: params.monthlyExpenses.shopping,
        utilities: params.monthlyExpenses.utilities,
      },
      annual: {
        vacations: params.annualExpenses.vacations,
        homeRepairs: params.annualExpenses.repairs,
        car: params.annualExpenses.carMaintenance,
      },
    },
    assumptions: {
      roiMean: params.averageROI,
      roiStdev: params.roiVolatility,
      inflationMean: params.averageInflation,
      inflationStdev: params.inflationVolatility,
      capGainsTaxRatePct: params.capitalGainsTax,
      mcRuns: params.simulationRuns,
    },
    projections: {
      milestones,
      successRatePct: results.successRate,
    },
    recommendations,
    metadata: {
      reportId: `RPT-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
    },
  }
}

function generateRecommendations(
  params: SimulationParams,
  results: SimulationResults
): Recommendation[] {
  const recommendations: Recommendation[] = []
  
  // Success rate-based recommendations
  if (results.successRate < 70) {
    recommendations.push({
      title: 'Increase Savings Rate',
      category: 'Savings Strategy',
      body: 'Your current success rate indicates potential challenges. Consider increasing your annual savings by 10-20% to improve retirement security.',
      impact: 'High',
    })
    
    recommendations.push({
      title: 'Delay Retirement',
      category: 'Timing',
      body: 'Working an additional 2-3 years could significantly improve your success rate by allowing more time for asset accumulation.',
      impact: 'High',
    })
  }
  
  if (results.successRate >= 70 && results.successRate < 85) {
    recommendations.push({
      title: 'Optimize Investment Mix',
      category: 'Investment Strategy',
      body: 'Review your asset allocation to ensure appropriate balance between growth and stability for your risk tolerance.',
      impact: 'Medium',
    })
  }
  
  // Expense-based recommendations
  const totalMonthlyExpenses = Object.values(params.monthlyExpenses).reduce((a, b) => a + b, 0)
  const totalAnnualExpenses = Object.values(params.annualExpenses).reduce((a, b) => a + b, 0)
  const totalYearlyExpenses = totalMonthlyExpenses * 12 + totalAnnualExpenses
  
  if (totalYearlyExpenses > params.annualSavings * 3) {
    recommendations.push({
      title: 'Review Spending Plan',
      category: 'Expense Management',
      body: 'Your expenses are high relative to savings. Consider reviewing discretionary spending to improve financial flexibility.',
      impact: 'Medium',
    })
  }
  
  // Tax optimization (always relevant)
  recommendations.push({
    title: 'Maximize Tax-Deferred Contributions',
    category: 'Tax Planning',
    body: 'Ensure you are taking full advantage of tax-advantaged retirement accounts to reduce current tax liability and enhance long-term growth.',
    impact: params.capitalGainsTax > 25 ? 'High' : 'Medium',
  })
  
  // Risk management
  if (params.roiVolatility > 0.18) {
    recommendations.push({
      title: 'Consider Volatility Reduction',
      category: 'Risk Management',
      body: 'Your portfolio has high volatility. As you approach retirement, consider gradually shifting to more stable investments.',
      impact: 'Medium',
    })
  }
  
  // Insurance recommendation
  recommendations.push({
    title: 'Review Insurance Coverage',
    category: 'Protection',
    body: 'Evaluate current insurance policies including health, long-term care, and life insurance to ensure adequate protection.',
    impact: 'Low',
  })
  
  // Limit to 6 most relevant recommendations
  return recommendations.slice(0, 6)
}