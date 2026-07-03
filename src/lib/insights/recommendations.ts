import type { SimulationParams, SimulationResults } from '@/types'
import type { Recommendation } from '@/lib/pdf-generator/schema/reportData'

export type RecommendationId =
  | 'increaseSavings'
  | 'delayRetirement'
  | 'optimizeMix'
  | 'reviewSpending'
  | 'maximizeTaxDeferred'
  | 'reduceVolatility'
  | 'reviewInsurance'

export type PlanRecommendation = Recommendation & { id: RecommendationId }

export type RecommendationUplift = { title: string; upliftMin: number; upliftMax: number }

export function generateRecommendations(
  params: SimulationParams,
  results: SimulationResults
): PlanRecommendation[] {
  const recommendations: PlanRecommendation[] = []

  // Success rate-based recommendations
  if (results.successRate < 70) {
    recommendations.push({
      id: 'increaseSavings',
      title: 'Increase Savings Rate',
      category: 'Savings Strategy',
      body: 'Your current success rate indicates potential challenges. Consider increasing your annual savings by 10-20% to improve retirement security.',
      impact: 'High',
    })

    recommendations.push({
      id: 'delayRetirement',
      title: 'Delay Retirement',
      category: 'Timing',
      body: 'Working an additional 2-3 years could significantly improve your success rate by allowing more time for asset accumulation.',
      impact: 'High',
    })
  }

  if (results.successRate >= 70 && results.successRate < 85) {
    recommendations.push({
      id: 'optimizeMix',
      title: 'Optimize Investment Mix',
      category: 'Investment Strategy',
      body: 'Review your asset allocation to ensure appropriate balance between growth and stability for your risk tolerance.',
      impact: 'Medium',
    })
  }

  // Expense-based recommendations
  const monthlyExpensesList = params.customExpenses.filter((e) => e.interval === 'monthly')
  const annualExpensesList = params.customExpenses.filter((e) => e.interval === 'annual')
  const totalMonthlyExpenses = monthlyExpensesList.reduce((sum, e) => sum + e.amount, 0)
  const totalAnnualExpenses = annualExpensesList.reduce((sum, e) => sum + e.amount, 0)
  const totalYearlyExpenses = totalMonthlyExpenses * 12 + totalAnnualExpenses

  if (totalYearlyExpenses > params.annualSavings * 3) {
    recommendations.push({
      id: 'reviewSpending',
      title: 'Review Spending Plan',
      category: 'Expense Management',
      body: 'Your expenses are high relative to savings. Consider reviewing discretionary spending to improve financial flexibility.',
      impact: 'Medium',
    })
  }

  // Tax optimization (always relevant)
  recommendations.push({
    id: 'maximizeTaxDeferred',
    title: 'Maximize Tax-Deferred Contributions',
    category: 'Tax Planning',
    body: 'Ensure you are taking full advantage of tax-advantaged retirement accounts to reduce current tax liability and enhance long-term growth.',
    impact: params.capitalGainsTax > 25 ? 'High' : 'Medium',
  })

  // Risk management
  if (params.roiVolatility > 0.18) {
    recommendations.push({
      id: 'reduceVolatility',
      title: 'Consider Volatility Reduction',
      category: 'Risk Management',
      body: 'Your portfolio has high volatility. As you approach retirement, consider gradually shifting to more stable investments.',
      impact: 'Medium',
    })
  }

  // Insurance recommendation
  recommendations.push({
    id: 'reviewInsurance',
    title: 'Review Insurance Coverage',
    category: 'Protection',
    body: 'Evaluate current insurance policies including health, long-term care, and life insurance to ensure adequate protection.',
    impact: 'Low',
  })

  // Limit to 6 most relevant recommendations
  return recommendations.slice(0, 6)
}

export function estimateRecommendationUplift(
  recommendation: Recommendation,
  params: SimulationParams,
  results: SimulationResults
): RecommendationUplift | null {
  const successGap = Math.max(0, 85 - results.successRate)
  const clampUplift = (value: number) => Math.max(1, Math.min(20, Math.round(value)))

  if (/Increase Savings/i.test(recommendation.title)) {
    const yearlySavingsMonths = params.annualSavings / 12
    const min = clampUplift(successGap * 0.35 + Math.min(4, yearlySavingsMonths / 1000))
    return {
      title: recommendation.title,
      upliftMin: min,
      upliftMax: clampUplift(min + 4),
    }
  }

  if (/Optimize Investment Mix|Asset Allocation|Investment/i.test(recommendation.title)) {
    const min = clampUplift(successGap * 0.2 + params.roiVolatility * 12)
    return {
      title: recommendation.title,
      upliftMin: min,
      upliftMax: clampUplift(min + 3),
    }
  }

  if (/Delay Retirement/i.test(recommendation.title)) {
    const bridgeYears = Math.max(0, params.legalRetirementAge - params.retirementAge)
    const min = clampUplift(successGap * 0.28 + bridgeYears * 1.5)
    return {
      title: recommendation.title,
      upliftMin: min,
      upliftMax: clampUplift(min + 5),
    }
  }

  if (/Review Spending Plan/i.test(recommendation.title)) {
    const monthlyExpenseLoad = params.customExpenses.reduce((sum, expense) => {
      return sum + (expense.interval === 'monthly' ? expense.amount : expense.amount / 12)
    }, 0)
    const min = clampUplift(successGap * 0.18 + monthlyExpenseLoad / 3000)
    return {
      title: recommendation.title,
      upliftMin: min,
      upliftMax: clampUplift(min + 3),
    }
  }

  return null
}
