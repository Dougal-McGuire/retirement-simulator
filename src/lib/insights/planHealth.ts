import type { SimulationParams, SimulationResults } from '@/types'
import { getPlanHealth, type PlanHealth } from '@/lib/simulation/planInsights'
import { firstYearWithdrawalRate } from './ledger'

/**
 * The plan score printed in the report.
 *
 * A weighted mean of sub-scores that are each **measured on this run**:
 *
 * - `success` — the success rate itself (0–100);
 * - `withdrawal` — the first-year withdrawal rate from the ledger (see
 *   `firstYearWithdrawalRate`): 100 up to 4 %, minus 25 points for every
 *   percentage point above, 0 from 8 %.
 *
 * There is no third component. The score used to carry a "liquidity" part that
 * was the constant 100 — fifteen points every plan got for nothing — and a
 * spending part computed as if the plan retired today on the gross pension.
 * When the withdrawal rate cannot be read (no ledger, no retirement inside the
 * horizon) the score is the success rate alone rather than a guess.
 *
 * The **band** is not derived from the score. It is `getPlanHealth` of the
 * success rate — the app's one definition of strong / watch / strained — so
 * the report can never grade a plan differently from the rest of the app.
 */

export type PlanHealthComponentId = 'success' | 'withdrawal'

/** One weighted input to the plan score. */
export type PlanHealthComponent = {
  id: PlanHealthComponentId
  /** 0–100 sub-score. */
  value: number
  /** Weight applied to `value` (weights sum to 1). */
  weight: number
}

export const PLAN_SCORE_WEIGHTS = { success: 0.7, withdrawal: 0.3 } as const

/** Withdrawal rate that still earns the full sub-score. */
export const WITHDRAWAL_COMFORT_RATE = 0.04
/** Sub-score points lost per percentage point above the comfort rate. */
export const WITHDRAWAL_PENALTY_PER_POINT = 25

export type PlanHealthScore = {
  /** 0–100, rounded from `components`. */
  score: number
  /** `getPlanHealth(successRate)` — never derived from `score`. */
  band: PlanHealth
  /** The weighted parts `score` is rounded from — same numbers, itemised. */
  components: PlanHealthComponent[]
  /** The rate behind the `withdrawal` component; `null` when it could not be read. */
  withdrawalRate: number | null
}

/** 0–100 sub-score of a first-year withdrawal rate. */
export function withdrawalSubScore(rate: number): number {
  const pointsAbove = Math.max(0, rate - WITHDRAWAL_COMFORT_RATE) * 100
  return Math.max(0, Math.min(100, 100 - pointsAbove * WITHDRAWAL_PENALTY_PER_POINT))
}

export function computePlanHealthScore(
  params: SimulationParams,
  results: SimulationResults
): PlanHealthScore {
  const successRate = Math.max(0, Math.min(100, results.successRate))
  const withdrawalRate = firstYearWithdrawalRate(params, results)

  const components: PlanHealthComponent[] =
    withdrawalRate === null
      ? [{ id: 'success', value: successRate, weight: 1 }]
      : [
          { id: 'success', value: successRate, weight: PLAN_SCORE_WEIGHTS.success },
          {
            id: 'withdrawal',
            value: withdrawalSubScore(withdrawalRate),
            weight: PLAN_SCORE_WEIGHTS.withdrawal,
          },
        ]

  const score = Math.round(
    components.reduce((sum, component) => sum + component.weight * component.value, 0)
  )

  return { score, band: getPlanHealth(results.successRate), components, withdrawalRate }
}
