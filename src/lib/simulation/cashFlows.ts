import {
  isCashFlowFrequency,
  isCashFlowKind,
  type CashFlow,
  type CustomExpense,
  type OneTimeIncome,
  type SimulationParams,
} from '@/types'

/**
 * Cash flows are the plan's one list of money movements. Two older shapes are
 * kept alive as *projections* of it:
 *
 *   `customExpenses`  <-> expense flows that are monthly/annual and unbounded
 *   `oneTimeIncomes`  <-> income flows with frequency `once`
 *
 * Everything a projection cannot express (an income window, a one-off expense,
 * a nominally fixed amount, extra real growth) simply has no counterpart there,
 * which is why the projections are a strict *subset* view and never the source
 * of truth.
 *
 * The two directions are reconciled in one place — {@link reconcileCashFlows} —
 * so that a caller that only knows the legacy arrays (an old persisted plan, a
 * stress lever that scales `customExpenses`, a test that overrides them) still
 * gets exactly what it asked for, while windowed flows survive untouched.
 */

const MAX_GROWTH_RATE = 0.5

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const finiteOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

const optionalAge = (value: unknown): number | undefined => {
  const parsed = finiteOrNull(value)
  return parsed === null ? undefined : Math.round(parsed)
}

/** A flow that `customExpenses` can represent: lifetime, recurring, expense. */
export function isLifetimeExpenseFlow(flow: CashFlow): boolean {
  return (
    flow.kind === 'expense' &&
    (flow.frequency === 'monthly' || flow.frequency === 'annual') &&
    flow.startAge === undefined &&
    flow.endAge === undefined
  )
}

/** A flow that `oneTimeIncomes` can represent. */
export function isOnceIncomeFlow(flow: CashFlow): boolean {
  return flow.kind === 'income' && flow.frequency === 'once'
}

/**
 * A lifetime expense with no per-flow overrides: exactly the thing the engine's
 * inflation-indexed spending baseline (and the Vanguard guardrails) has always
 * modelled. Everything else is scheduled per age and rides on top.
 */
export function isBaselineExpenseFlow(flow: CashFlow): boolean {
  return (
    isLifetimeExpenseFlow(flow) &&
    flow.inflationLinked !== false &&
    (flow.growthRate === undefined || flow.growthRate === 0)
  )
}

export function sanitizeCashFlow(entry: unknown, fallbackId: string): CashFlow | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const raw = entry as Record<string, unknown>

  const amount = finiteOrNull(raw.amount)
  if (amount === null || amount < 0) return null

  const id = typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id.trim() : fallbackId
  const kind = isCashFlowKind(raw.kind) ? raw.kind : 'expense'
  const frequency = isCashFlowFrequency(raw.frequency) ? raw.frequency : 'monthly'
  const name = typeof raw.name === 'string' ? raw.name : ''
  const startAge = optionalAge(raw.startAge)
  // A window is meaningless for a single payment, and keeping a stray `endAge`
  // around would make two otherwise identical flows compare unequal.
  const endAge = frequency === 'once' ? undefined : optionalAge(raw.endAge)
  const growth = finiteOrNull(raw.growthRate)

  return {
    id,
    kind,
    name,
    amount: Math.max(0, amount),
    frequency,
    ...(startAge !== undefined ? { startAge } : {}),
    ...(endAge !== undefined ? { endAge } : {}),
    ...(raw.inflationLinked === false ? { inflationLinked: false } : {}),
    ...(raw.inflationLinked === true ? { inflationLinked: true } : {}),
    ...(growth !== null && growth !== 0
      ? { growthRate: clamp(growth, -MAX_GROWTH_RATE, MAX_GROWTH_RATE) }
      : {}),
  }
}

/** Drops malformed entries and makes ids unique (ids address flows in the UI). */
export function sanitizeCashFlows(value: unknown): CashFlow[] {
  if (!Array.isArray(value)) return []
  const taken = new Set<string>()

  return value
    .map((entry, index) => sanitizeCashFlow(entry, `flow-${index}`))
    .filter((flow): flow is CashFlow => flow !== null)
    .map((flow) => {
      if (!taken.has(flow.id)) {
        taken.add(flow.id)
        return flow
      }
      let suffix = 2
      while (taken.has(`${flow.id}-${suffix}`)) suffix += 1
      const id = `${flow.id}-${suffix}`
      taken.add(id)
      return { ...flow, id }
    })
}

/** Legacy expense array, permissively cleaned (matches the engine's old rules). */
function readLegacyExpenses(value: unknown): CustomExpense[] | null {
  if (!Array.isArray(value)) return null
  return value
    .map((entry, index): CustomExpense | null => {
      if (!entry || typeof entry !== 'object') return null
      const raw = entry as Record<string, unknown>
      const amount = finiteOrNull(raw.amount)
      if (amount === null || amount < 0) return null
      if (raw.interval !== 'monthly' && raw.interval !== 'annual') return null
      return {
        id: typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id.trim() : `expense-${index}`,
        name: typeof raw.name === 'string' ? raw.name : '',
        amount,
        interval: raw.interval,
      }
    })
    .filter((expense): expense is CustomExpense => expense !== null)
}

function readLegacyIncomes(value: unknown): OneTimeIncome[] | null {
  if (!Array.isArray(value)) return null
  return value
    .map((entry): OneTimeIncome | null => {
      if (!entry || typeof entry !== 'object') return null
      const raw = entry as Record<string, unknown>
      const amount = finiteOrNull(raw.amount)
      const age = finiteOrNull(raw.age)
      if (amount === null || amount < 0 || age === null) return null
      return {
        name: typeof raw.name === 'string' ? raw.name : '',
        age: Math.round(age),
        amount,
      }
    })
    .filter((income): income is OneTimeIncome => income !== null)
}

export function projectCustomExpenses(flows: readonly CashFlow[]): CustomExpense[] {
  return flows.filter(isLifetimeExpenseFlow).map((flow) => ({
    id: flow.id,
    name: flow.name,
    amount: flow.amount,
    interval: flow.frequency === 'annual' ? ('annual' as const) : ('monthly' as const),
  }))
}

export function projectOneTimeIncomes(
  flows: readonly CashFlow[],
  currentAge: number
): OneTimeIncome[] {
  return flows.filter(isOnceIncomeFlow).map((flow) => ({
    name: flow.name,
    age: flow.startAge ?? currentAge,
    amount: flow.amount,
  }))
}

const incomeKey = (name: string, age: number, amount: number) => `${name}|${age}|${amount}`

/**
 * Folds the legacy arrays back into the flow list.
 *
 * When `customExpenses` / `oneTimeIncomes` are present they are authoritative
 * for *their own subset* — that is what makes `{...params, customExpenses: [x]}`
 * (stress levers, older persisted plans, tests) still mean what it says. Flows
 * they cannot express are carried through untouched, and a flow that is still
 * represented keeps its id and its extra attributes (`inflationLinked`,
 * `growthRate`), matched by id for expenses and by value for incomes.
 *
 * Idempotent: reconciling params whose projections are already in sync returns
 * the same list, in the same order.
 */
export function reconcileCashFlows(params: {
  cashFlows?: unknown
  customExpenses?: unknown
  oneTimeIncomes?: unknown
  currentAge?: number
}): CashFlow[] {
  const flows = sanitizeCashFlows(params.cashFlows)
  const legacyExpenses = readLegacyExpenses(params.customExpenses)
  const legacyIncomes = readLegacyIncomes(params.oneTimeIncomes)
  if (!legacyExpenses && !legacyIncomes) return flows

  const currentAge = finiteOrNull(params.currentAge) ?? 0

  const expenseFlowById = new Map<string, CashFlow>()
  flows.filter(isLifetimeExpenseFlow).forEach((flow) => expenseFlowById.set(flow.id, flow))

  const incomeFlowsByValue = new Map<string, CashFlow[]>()
  flows.filter(isOnceIncomeFlow).forEach((flow) => {
    const key = incomeKey(flow.name, flow.startAge ?? currentAge, flow.amount)
    const bucket = incomeFlowsByValue.get(key)
    if (bucket) bucket.push(flow)
    else incomeFlowsByValue.set(key, [flow])
  })

  const takenIds = new Set(flows.map((flow) => flow.id))
  const uniqueId = (preferred: string) => {
    if (!takenIds.has(preferred)) {
      takenIds.add(preferred)
      return preferred
    }
    let suffix = 2
    while (takenIds.has(`${preferred}-${suffix}`)) suffix += 1
    const id = `${preferred}-${suffix}`
    takenIds.add(id)
    return id
  }

  const replacements = new Map<string, CashFlow>()
  const appended: CashFlow[] = []

  legacyExpenses?.forEach((expense) => {
    const existing = expenseFlowById.get(expense.id)
    if (existing) {
      replacements.set(existing.id, {
        ...existing,
        name: expense.name,
        amount: expense.amount,
        frequency: expense.interval,
      })
      expenseFlowById.delete(expense.id)
      return
    }
    appended.push({
      id: uniqueId(expense.id),
      kind: 'expense',
      name: expense.name,
      amount: expense.amount,
      frequency: expense.interval,
    })
  })

  legacyIncomes?.forEach((income, index) => {
    const bucket = incomeFlowsByValue.get(incomeKey(income.name, income.age, income.amount))
    const existing = bucket?.shift()
    if (existing) {
      replacements.set(existing.id, existing)
      return
    }
    appended.push({
      id: uniqueId(`income-${index}`),
      kind: 'income',
      name: income.name,
      amount: income.amount,
      frequency: 'once',
      startAge: income.age,
    })
  })

  const dropped = new Set<string>()
  if (legacyExpenses) expenseFlowById.forEach((flow) => dropped.add(flow.id))
  if (legacyIncomes) {
    incomeFlowsByValue.forEach((bucket) => bucket.forEach((flow) => dropped.add(flow.id)))
  }

  const kept = flows
    .filter((flow) => !dropped.has(flow.id))
    .map((flow) => replacements.get(flow.id) ?? flow)

  return [...kept, ...appended]
}

/**
 * Reconciles the flow list and rewrites the legacy arrays from it, so the three
 * fields of a parameter set are always describing the same plan.
 *
 * Legacy-first: use it when the *arrays* carry the intent (persisted state, an
 * older client, a caller that scales `customExpenses`).
 */
export function withCashFlowProjections<T extends SimulationParams>(params: T): T {
  const cashFlows = reconcileCashFlows(params)
  return {
    ...params,
    cashFlows,
    customExpenses: projectCustomExpenses(cashFlows),
    oneTimeIncomes: projectOneTimeIncomes(cashFlows, params.currentAge),
  }
}

/**
 * Same result, flows-first: the legacy arrays are *overwritten* from the flow
 * list instead of being reconciled into it.
 *
 * This is what writing `cashFlows` means — the store's `updateParams` uses it,
 * and so should anything that builds a parameter set with flows by hand.
 * Skipping it leaves stale projections that the legacy-first path would then
 * happily reconcile *back*, quietly undoing the edit.
 */
export function applyCashFlows<T extends SimulationParams>(params: T): T {
  const cashFlows = sanitizeCashFlows(params.cashFlows)
  return {
    ...params,
    cashFlows,
    customExpenses: projectCustomExpenses(cashFlows),
    oneTimeIncomes: projectOneTimeIncomes(cashFlows, params.currentAge),
  }
}

/** Per-age base amounts in today's euros, split by how inflation treats them. */
export interface CashFlowSeries {
  /** Base-year monthly expense total handled by the spending baseline. */
  baselineMonthly: number
  /** Base-year annual expense total handled by the spending baseline. */
  baselineAnnual: number
  /**
   * age -> one-off income credited at the *following* age (legacy convention),
   * in today's euros, split the same way as the recurring series.
   */
  oneTimeIncomeLinkedByAge: ReadonlyMap<number, number>
  oneTimeIncomeFixedByAge: ReadonlyMap<number, number>
  /** Extra income per year offset, re-priced with inflation in the loop. */
  incomeLinked: number[]
  /** Extra income per year offset, fixed in nominal euros. */
  incomeFixed: number[]
  expenseLinked: number[]
  expenseFixed: number[]
}

/**
 * Expands the flow list into per-age totals.
 *
 * Everything here is in today's euros: the year loop multiplies by that path's
 * realised price level, which is what makes an inflation-linked flow and a
 * nominally fixed one differ by a single factor at the point of use.
 */
export function buildCashFlowSeries(
  flows: readonly CashFlow[],
  currentAge: number,
  endAge: number
): CashFlowSeries {
  const years = Math.max(0, endAge - currentAge + 1)
  const incomeLinked = new Array<number>(years).fill(0)
  const incomeFixed = new Array<number>(years).fill(0)
  const expenseLinked = new Array<number>(years).fill(0)
  const expenseFixed = new Array<number>(years).fill(0)
  const oneTimeIncomeLinkedByAge = new Map<number, number>()
  const oneTimeIncomeFixedByAge = new Map<number, number>()

  let baselineMonthly = 0
  let baselineAnnual = 0

  for (const flow of flows) {
    const amount = Math.max(0, flow.amount)

    if (isBaselineExpenseFlow(flow)) {
      if (flow.frequency === 'annual') baselineAnnual += amount
      else baselineMonthly += amount
      continue
    }

    if (amount <= 0) continue

    // One-off income keeps its long-standing convention: it lands at the start
    // of the year *after* the age it is booked for. Changing that would move
    // every existing plan's numbers.
    if (isOnceIncomeFlow(flow)) {
      const depositAge = (flow.startAge ?? currentAge) + 1
      if (depositAge < currentAge || depositAge > endAge) continue
      const target =
        flow.inflationLinked === false ? oneTimeIncomeFixedByAge : oneTimeIncomeLinkedByAge
      target.set(depositAge, (target.get(depositAge) ?? 0) + amount)
      continue
    }

    const perYear = flow.frequency === 'monthly' ? amount * 12 : amount
    const linked = flow.inflationLinked !== false
    const growth = flow.growthRate ?? 0
    const start = Math.max(currentAge, flow.startAge ?? currentAge)
    const last = flow.frequency === 'once' ? start : Math.min(endAge, flow.endAge ?? endAge)
    if (start > endAge || last < start) continue

    const income = flow.kind === 'income'
    const target = income
      ? linked
        ? incomeLinked
        : incomeFixed
      : linked
        ? expenseLinked
        : expenseFixed

    for (let age = start; age <= last; age++) {
      const grown = growth === 0 ? perYear : perYear * Math.pow(1 + growth, age - start)
      target[age - currentAge] += grown
    }
  }

  return {
    baselineMonthly,
    baselineAnnual,
    oneTimeIncomeLinkedByAge,
    oneTimeIncomeFixedByAge,
    incomeLinked,
    incomeFixed,
    expenseLinked,
    expenseFixed,
  }
}

/**
 * Order-independent signature of a flow list, for identity hashes and staleness
 * checks: reordering the list in the UI must not look like a model change.
 */
export function cashFlowSignature(flows: readonly CashFlow[]): string[] {
  return flows
    .map((flow) =>
      [
        flow.id,
        flow.kind,
        flow.name,
        flow.amount,
        flow.frequency,
        flow.startAge ?? '',
        flow.endAge ?? '',
        flow.inflationLinked === false ? 'fixed' : 'linked',
        flow.growthRate ?? 0,
      ].join('|')
    )
    .sort()
}

/** True when both lists describe the same set of flows (order ignored). */
export function cashFlowsEqual(a: readonly CashFlow[], b: readonly CashFlow[]): boolean {
  if (a.length !== b.length) return false
  const left = cashFlowSignature(a)
  const right = cashFlowSignature(b)
  return left.every((value, index) => value === right[index])
}
