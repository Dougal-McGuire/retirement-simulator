import type { SimulationParams, SimulationResults } from '@/types'
import { defaultPdfConfig } from '@/lib/pdf-generator/utils/config'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { computeBridgeAnalysis } from './bridge'

export type PlanHealthLabel = 'Strong' | 'Moderate' | 'Needs Attention'

/** One weighted input to the plan score, in the units the score is built from. */
export type PlanHealthComponent = {
  id: 'success' | 'spending' | 'liquidity'
  /** 0–100 sub-score. */
  value: number
  /** Weight applied to `value` (weights sum to 1). */
  weight: number
}

export type PlanHealthScore = {
  score: number
  label: PlanHealthLabel
  why: string
  whyBits: string[]
  /** The weighted parts `score` is rounded from — same numbers, itemised. */
  components: PlanHealthComponent[]
}

export function computePlanHealthScore(
  params: SimulationParams,
  results: SimulationResults
): PlanHealthScore {
  const weights = defaultPdfConfig.score_weights
  const totalYearlyExpenses = calculateCombinedExpenses(params.customExpenses).combinedAnnual
  const netAnnualSpendIfRetiredNow = Math.max(0, totalYearlyExpenses - params.monthlyPension * 12)
  const withdrawalRateNow =
    params.currentAssets > 0 ? netAnnualSpendIfRetiredNow / params.currentAssets : 1
  const spendPenaltyPerPoint = 2500 // -25 points per +1pp above 4%
  const spendingScore = Math.max(
    0,
    Math.min(100, 100 - Math.max(0, withdrawalRateNow - 0.04) * spendPenaltyPerPoint)
  )
  const liquidityScore = 100 // placeholder until explicit liquidity coverage metric is added
  const components: PlanHealthComponent[] = [
    { id: 'success', value: results.successRate, weight: weights.success_pct },
    { id: 'spending', value: spendingScore, weight: weights.spend_rate },
    { id: 'liquidity', value: liquidityScore, weight: weights.liquidity },
  ]
  const score = Math.round(
    components.reduce((sum, component) => sum + component.weight * component.value, 0)
  )
  const label: PlanHealthLabel =
    score >= defaultPdfConfig.label_bands.strong[0]
      ? 'Strong'
      : score >= defaultPdfConfig.label_bands.moderate[0]
        ? 'Moderate'
        : 'Needs Attention'

  const bridge = computeBridgeAnalysis(params)
  const whyBits: string[] = []
  if (spendingScore >= 85) whyBits.push('solid savings rate')
  if (bridge.yearsInBridge <= 6 && bridge.cashNeedEUR <= params.currentAssets * 0.3)
    whyBits.push('moderate bridge drawdown')
  if (results.successRate >= 80) whyBits.push('high success probability')
  const finalBits = whyBits.length ? whyBits : ['balanced assumptions']

  return { score, label, why: finalBits.join(' + '), whyBits: finalBits, components }
}
