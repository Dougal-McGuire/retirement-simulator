import type { CashFlow, OneTimeIncome } from '@/types'
import { isCashFlowEnabled, withCashFlowEnabled } from '@/lib/simulation/cashFlows'

/**
 * The setup wizard's one-off income list, read from and written to the flow
 * list itself.
 *
 * The legacy `oneTimeIncomes` projection omits switched-off flows (it cannot
 * say "off"), so a list built on it made a switched-off windfall vanish with
 * no way back. These helpers work on `params.cashFlows` directly: every
 * one-off income is listed, on or off, and every write is flows-first
 * (`updateParams({ cashFlows })`), keeping the flow's id, switch and extra
 * attributes.
 */
export interface OneOffIncomeEntry extends OneTimeIncome {
  /** The flow's id. */
  id: string
  enabled: boolean
}

/** A fresh flow id, unique enough for one browser's plans. */
export const createFlowId = (): string =>
  `flow-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

/** A one-off income flow, switched on or off. */
export const isOneOffIncomeFlow = (flow: CashFlow): boolean =>
  flow.kind === 'income' && flow.frequency === 'once'

/** Every one-off income in list order, named as the UI names it. */
export function oneOffIncomeEntries(
  flows: readonly CashFlow[] | undefined,
  currentAge: number,
  displayName: (flow: CashFlow) => string = (flow) => flow.name
): OneOffIncomeEntry[] {
  return (flows ?? []).filter(isOneOffIncomeFlow).map((flow) => ({
    id: flow.id,
    name: displayName(flow),
    age: flow.startAge ?? currentAge,
    amount: flow.amount,
    enabled: isCashFlowEnabled(flow),
  }))
}

/** Appends a new, switched-on one-off income. */
export function addOneOffIncome(
  flows: readonly CashFlow[] | undefined,
  income: OneTimeIncome,
  id: string
): CashFlow[] {
  return [
    ...(flows ?? []),
    {
      id,
      kind: 'income',
      name: income.name,
      amount: income.amount,
      frequency: 'once',
      startAge: income.age,
    },
  ]
}

/**
 * Rewrites one one-off income's name, age and amount. Everything else stays:
 * the id, the switch (editing a switched-off income keeps it off), the tax
 * treatment and the note. An untouched seeded name keeps its key; a payment
 * month is kept only while the age it pins stays the same.
 */
export function updateOneOffIncome(
  flows: readonly CashFlow[] | undefined,
  id: string,
  income: OneTimeIncome,
  displayName: (flow: CashFlow) => string = (flow) => flow.name
): CashFlow[] {
  return (flows ?? []).map((flow) => {
    if (flow.id !== id || !isOneOffIncomeFlow(flow)) return flow
    const { nameKey, startDate, ...rest } = flow
    const keepsName = income.name === displayName(flow)
    const keepsAge = income.age === flow.startAge
    return {
      ...rest,
      name: keepsName ? flow.name : income.name,
      ...(keepsName && nameKey !== undefined ? { nameKey } : {}),
      amount: income.amount,
      startAge: income.age,
      ...(keepsAge && startDate !== undefined ? { startDate } : {}),
    }
  })
}

/** Drops one flow by id. */
export function removeFlow(flows: readonly CashFlow[] | undefined, id: string): CashFlow[] {
  return (flows ?? []).filter((flow) => flow.id !== id)
}

/** Flips one flow's switch, as the flow list does. */
export function toggleFlow(flows: readonly CashFlow[] | undefined, id: string): CashFlow[] {
  return (flows ?? []).map((flow) =>
    flow.id === id ? withCashFlowEnabled(flow, !isCashFlowEnabled(flow)) : flow
  )
}
