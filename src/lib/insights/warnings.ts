import type { SimulationParams, SimulationResults } from '@/types'
import { buildPlanInsightMetrics } from '@/lib/simulation/planInsights'
import { computeBridgeAnalysis } from './bridge'
import { deriveDepletionAges } from './depletion'

export const SUSTAINABLE_WITHDRAWAL_RATE = 0.06

export type PlanWarning =
  | { id: 'inconsistentAges' }
  | { id: 'highWithdrawal'; rate: number }
  | { id: 'medianDepletion'; age: number }
  | { id: 'bridgeGap'; cashNeed: number; retirementAssets: number }

export function buildPlanWarnings(
  params: SimulationParams,
  results: SimulationResults | null
): PlanWarning[] {
  const warnings: PlanWarning[] = []

  if (params.currentAge >= params.retirementAge || params.retirementAge >= params.endAge) {
    warnings.push({ id: 'inconsistentAges' })
  }

  if (!results) return warnings

  const metrics = buildPlanInsightMetrics(params, results)

  // The sustainable-withdrawal ceiling is a fixed-real-withdrawal heuristic (à la the
  // 4% rule). Under the dynamic strategy, spending flexes with the portfolio within the
  // floor/ceiling guardrails, so a static first-year rate cap does not apply — the
  // success rate already reflects whether the drawdown is sustainable.
  if (
    params.withdrawalStrategy === 'fixedReal' &&
    metrics.firstYearWithdrawalRate !== null &&
    metrics.firstYearWithdrawalRate > SUSTAINABLE_WITHDRAWAL_RATE
  ) {
    warnings.push({ id: 'highWithdrawal', rate: metrics.firstYearWithdrawalRate })
  }

  const { p50DepletionAge } = deriveDepletionAges(results)
  if (p50DepletionAge !== null) {
    warnings.push({ id: 'medianDepletion', age: p50DepletionAge })
  }

  const bridge = computeBridgeAnalysis(params)
  if (bridge.yearsInBridge > 0 && bridge.cashNeedEUR > metrics.retirementMedianAssets) {
    warnings.push({
      id: 'bridgeGap',
      cashNeed: Math.round(bridge.cashNeedEUR),
      retirementAssets: metrics.retirementMedianAssets,
    })
  }

  return warnings
}
