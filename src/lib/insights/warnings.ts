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
  // 4% rule), so it only applies to the one strategy that actually withdraws a fixed
  // real amount. Every other rule in the library flexes with the portfolio — Vanguard
  // within its guardrails, Guyton-Klinger through its ±20% bands, percent-of-portfolio
  // completely — and for those the success rate already says whether the drawdown is
  // sustainable, while a static first-year rate cap would not.
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
