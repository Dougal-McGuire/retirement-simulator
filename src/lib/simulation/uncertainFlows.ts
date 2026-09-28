import type { CashFlow, SimulationParams } from '@/types'
import {
  applyCashFlows,
  isCashFlowEnabled,
  pensionStartAge,
  STATUTORY_PENSION_FLOW_ID,
  withCashFlowEnabled,
} from '@/lib/simulation/cashFlows'

/**
 * "Unsichere Posten": the flows a plan could plausibly be without — an
 * inheritance, a lump sum, a few years of rent, care costs late in life, a
 * company pension. Their on/off switch is the scenario question the levers
 * section answers ("what does the plan achieve without it?").
 *
 * The baseline living costs (lifetime recurring expenses) and the statutory
 * pension are not events: they have their own sliders.
 */
export function isEventLikeFlow(flow: CashFlow): boolean {
  if (flow.kind === 'pension') return flow.id !== STATUTORY_PENSION_FLOW_ID
  // Extra income of any shape is the classic uncertain item (a part-time job,
  // rent, a windfall).
  if (flow.kind === 'income') return true
  return flow.frequency === 'once' || flow.startAge !== undefined || flow.endAge !== undefined
}

/** Years a flow pays within the plan horizon (a single payment counts once). */
function yearsInHorizon(flow: CashFlow, params: SimulationParams): number {
  const first =
    flow.kind === 'pension'
      ? pensionStartAge(flow, params.legalRetirementAge)
      : (flow.startAge ?? params.currentAge)
  const start = Math.max(params.currentAge, first)
  if (flow.frequency === 'once') return start <= params.endAge ? 1 : 0
  const last = Math.min(params.endAge, flow.endAge ?? params.endAge)
  return Math.max(0, last - start + 1)
}

/**
 * Size of a flow over the plan, in today's euros and before tax: how much of
 * the plan it could move. Only used to pick and order the list before any
 * measurement exists.
 */
export function flowPlanTotal(flow: CashFlow, params: SimulationParams): number {
  const perPayment = Math.max(0, flow.amount)
  const perYear =
    flow.frequency === 'monthly' ? perPayment * 12 : flow.frequency === 'annual' ? perPayment : 0
  return flow.frequency === 'once'
    ? perPayment * yearsInHorizon(flow, params)
    : perYear * yearsInHorizon(flow, params)
}

export const MAX_UNCERTAIN_FLOWS = 8

/**
 * The event-like flows worth a switch in the levers section: the largest
 * `limit` by plan total (switched-off ones included — switching one back on
 * is the same question the other way round), largest first.
 */
export function selectUncertainFlows(
  params: SimulationParams,
  limit = MAX_UNCERTAIN_FLOWS
): { flows: CashFlow[]; hidden: number } {
  const candidates = (params.cashFlows ?? [])
    .filter(isEventLikeFlow)
    .map((flow, index) => ({ flow, index, total: flowPlanTotal(flow, params) }))
    .sort((a, b) => b.total - a.total || a.index - b.index)
  return {
    flows: candidates.slice(0, limit).map((entry) => entry.flow),
    hidden: Math.max(0, candidates.length - limit),
  }
}

/** The flow list with one flow switched the other way. */
export function toggleCashFlow(flows: readonly CashFlow[], id: string): CashFlow[] {
  return flows.map((flow) =>
    flow.id === id ? withCashFlowEnabled(flow, !isCashFlowEnabled(flow)) : flow
  )
}

/**
 * The plan with one flow switched: "without it" for a switched-on flow,
 * "with it" for a switched-off one. Flows-first, so the legacy projections
 * follow the switch instead of reconciling it back.
 */
export function buildFlowToggleParams(params: SimulationParams, id: string): SimulationParams {
  return applyCashFlows({ ...params, cashFlows: toggleCashFlow(params.cashFlows ?? [], id) })
}
