import type { CashFlow } from '@/types'
import { isCashFlowEnabled, withCashFlowEnabled } from '@/lib/simulation/cashFlows'

/**
 * The generic edits on a plan's flow list — shared by the flow list, the
 * setup wizard's one-off list and Stellschrauben, so "switch" and "remove"
 * mean one thing everywhere.
 */

/**
 * A fresh flow id, unique enough for one browser's plans. Never positional:
 * a comparison lines up flows of two plans by id, and `flow-0` in two plans
 * says nothing about the two flows being the same.
 */
export const createFlowId = (): string =>
  `flow-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

/** Drops one flow by id. */
export function removeFlow(flows: readonly CashFlow[] | undefined, id: string): CashFlow[] {
  return (flows ?? []).filter((flow) => flow.id !== id)
}

/** Flips one flow's switch; every other flow stays as it is. */
export function toggleFlow(flows: readonly CashFlow[] | undefined, id: string): CashFlow[] {
  return (flows ?? []).map((flow) =>
    flow.id === id ? withCashFlowEnabled(flow, !isCashFlowEnabled(flow)) : flow
  )
}
