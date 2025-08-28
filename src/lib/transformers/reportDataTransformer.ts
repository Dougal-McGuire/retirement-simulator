import type { SimulationParams, SimulationResults } from '@/types'
import type { ReportData, Recommendation } from '@/lib/pdf-generator/schema/reportData'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { defaultPdfConfig } from '@/lib/pdf-generator/utils/config'

export function transformToReportData(
  params: SimulationParams,
  results: SimulationResults
): ReportData {
  // Generate milestones from simulation results
  const milestones = results.ages.map((age, index) => ({
    age,
    p10: results.assetPercentiles.p10[index] || 0,
    p20: results.assetPercentiles.p20?.[index] || 0,
    p50: results.assetPercentiles.p50[index] || 0,
    p80: results.assetPercentiles.p80?.[index] || 0,
    p90: results.assetPercentiles.p90[index] || 0,
  }))

  // Generate recommendations based on success rate
  const recommendations = generateRecommendations(params, results)

  // Derived figures
  const totalMonthlyExpenses = Object.values(params.monthlyExpenses).reduce((a, b) => a + b, 0)
  const totalAnnualExpenses = Object.values(params.annualExpenses).reduce((a, b) => a + b, 0)
  const totalYearlyExpenses = totalMonthlyExpenses * 12 + totalAnnualExpenses

  // Bridge years (gap between retirement and pension start)
  const bridgeStart = Math.max(params.retirementAge, params.currentAge)
  const bridgeEnd = Math.max(params.legalRetirementAge - 1, bridgeStart - 1)
  const yearsInBridge = Math.max(0, bridgeEnd - bridgeStart + 1)
  // Approximate inflation-adjusted cash need across bridge years
  const inf = params.averageInflation
  let bridgeCashNeedEUR = 0
  for (let i = 0; i < yearsInBridge; i++) {
    const spendThisYear = totalYearlyExpenses * Math.pow(1 + inf, i)
    const pensionThisYear = 0 // pre-pension years
    bridgeCashNeedEUR += Math.max(0, spendThisYear - pensionThisYear)
  }

  // Plan Health Score (v1.1): weighted by config
  const weights = defaultPdfConfig.score_weights
  const netAnnualSpendIfRetiredNow = Math.max(0, totalYearlyExpenses - params.monthlyPension * 12)
  const withdrawalRateNow = params.currentAssets > 0 ? netAnnualSpendIfRetiredNow / params.currentAssets : 1
  const spendPenaltyPerPoint = 2500 // -25 points per +1pp above 4%
  const spendingScore = Math.max(0, Math.min(100, 100 - Math.max(0, (withdrawalRateNow - 0.04)) * spendPenaltyPerPoint))
  const liquidityScore = 100 // placeholder until explicit liquidity coverage metric is added
  const planHealthScoreRaw = (
    weights.success_pct * results.successRate +
    weights.spend_rate * spendingScore +
    weights.liquidity * liquidityScore
  )
  const planHealthScore = Math.round(planHealthScoreRaw)
  const planHealthLabel = planHealthScore >= defaultPdfConfig.label_bands.strong[0]
    ? 'Strong'
    : planHealthScore >= defaultPdfConfig.label_bands.moderate[0]
    ? 'Moderate'
    : 'Needs Attention'

  // Why clause for plan health
  const whyBits: string[] = []
  if (spendingScore >= 85) whyBits.push('solid savings rate')
  if (yearsInBridge <= 6 && bridgeCashNeedEUR <= params.currentAssets * 0.3) whyBits.push('moderate bridge drawdown')
  if (results.successRate >= 80) whyBits.push('high success probability')
  const planHealthWhy = whyBits.length ? whyBits.join(' + ') : 'balanced assumptions'

  const topRecs = generateRecommendations(params, results)
  const topActions = topRecs.slice(0, 2).map(r => r.title)

  // Sensitivity-based uplift estimates (lightweight)
  function withModifiedParams(mod: Partial<SimulationParams>): SimulationResults {
    const p: SimulationParams = { ...params, ...mod }
    // Use fewer runs for speed in sensitivity (cap at 300)
    p.simulationRuns = Math.min(300, Math.max(200, Math.floor(params.simulationRuns / 2)))
    return runMonteCarloSimulation(p)
  }

  function deltaScoreFrom(resultsBase: SimulationResults, resultsAlt: SimulationResults): number {
    const baseSuccess = resultsBase.successRate
    const altSuccess = resultsAlt.successRate
    const baseSpendingScore = spendingScore
    // Spending score might change for savings tweaks at retirement; we keep it constant for simplicity
    const altSpendingScore = baseSpendingScore
    const delta = (
      weights.success_pct * (altSuccess - baseSuccess) +
      weights.spend_rate * (altSpendingScore - baseSpendingScore)
    )
    return Math.round(delta)
  }

  const uplifts: { title: string; upliftMin: number; upliftMax: number }[] = []

  // Map recommendations to concrete parameter tweaks
  const baseResults = results
  for (const rec of topRecs.slice(0, 2)) {
    if (/Increase Savings/i.test(rec.title)) {
      const altLow = withModifiedParams({ annualSavings: params.annualSavings + 7200 })
      const altHigh = withModifiedParams({ annualSavings: params.annualSavings + 9600 })
      uplifts.push({
        title: rec.title,
        upliftMin: deltaScoreFrom(baseResults, altLow),
        upliftMax: deltaScoreFrom(baseResults, altHigh),
      })
    } else if (/Optimize Investment Mix|Asset Allocation|Investment/i.test(rec.title)) {
      const altLow = withModifiedParams({ averageROI: params.averageROI + 0.0075, roiVolatility: params.roiVolatility + 0.01 })
      const altHigh = withModifiedParams({ averageROI: params.averageROI + 0.0125, roiVolatility: params.roiVolatility + 0.02 })
      uplifts.push({
        title: rec.title,
        upliftMin: deltaScoreFrom(baseResults, altLow),
        upliftMax: deltaScoreFrom(baseResults, altHigh),
      })
    } else if (/Delay Retirement/i.test(rec.title)) {
      const altLow = withModifiedParams({ retirementAge: params.retirementAge + 1 })
      const altHigh = withModifiedParams({ retirementAge: params.retirementAge + 2 })
      uplifts.push({
        title: rec.title,
        upliftMin: deltaScoreFrom(baseResults, altLow),
        upliftMax: deltaScoreFrom(baseResults, altHigh),
      })
    }
  }

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
    summary: {
      planHealthScore,
      planHealthLabel,
      planHealthWhy,
      successProbabilityPct: results.successRate,
      bridge: {
        startAge: bridgeStart,
        endAge: bridgeEnd,
        cashNeedEUR: Math.round(bridgeCashNeedEUR),
        cashBucketYears: defaultPdfConfig.bridge_cash_bucket_years,
        cashBucketSharePct: yearsInBridge > 0 ? Math.round(
          (Array.from({ length: Math.min(defaultPdfConfig.bridge_cash_bucket_years, yearsInBridge) })
             .reduce((sum, _, i) => sum + totalYearlyExpenses * Math.pow(1 + inf, i), 0) / bridgeCashNeedEUR) * 100
        ) : 0,
        portfolioSharePct: yearsInBridge > 0 ? Math.max(0, 100 - Math.round(
          (Array.from({ length: Math.min(defaultPdfConfig.bridge_cash_bucket_years, yearsInBridge) })
             .reduce((sum, _, i) => sum + totalYearlyExpenses * Math.pow(1 + inf, i), 0) / bridgeCashNeedEUR) * 100
        )) : 0,
      },
      topActions,
      topActionsDetailed: uplifts,
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
