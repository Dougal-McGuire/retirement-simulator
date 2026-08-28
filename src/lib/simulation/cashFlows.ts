import {
  isCashFlowFrequency,
  isCashFlowKind,
  isIncomeTaxTreatment,
  isPensionTaxMode,
  type CashFlow,
  type CustomExpense,
  type OneTimeIncome,
  type SimulationParams,
} from '@/types'
import {
  besteuerungsanteil,
  oneFifthRuleTax,
  ordinaryIncomeTax,
  versorgungsfreibetrag,
} from '@/lib/simulation/germanTax'

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
const MAX_NOTE_LENGTH = 240
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * The one pension the wizard and the legacy `monthlyPension` field talk about.
 * Any further pension (a company scheme, a partner's pension, an annuity) is
 * an ordinary `pension` flow with its own id, start age and tax share.
 */
export const STATUTORY_PENSION_FLOW_ID = 'pension-statutory'
const STATUTORY_PENSION_NAME_KEY = 'statutoryPension'
const STATUTORY_PENSION_NAME = 'Statutory pension'

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

export function isPensionFlow(flow: CashFlow): boolean {
  return flow.kind === 'pension'
}

/** Tax and timing defaults the flows inherit from the plan. */
export interface PensionContext {
  legalRetirementAge: number
  pensionTaxablePortion?: number
  pensionTaxRate?: number
  /** A jointly assessed couple gets the splitting tariff on taxed income. */
  householdType?: 'single' | 'couple'
  /**
   * Calendar year `currentAge` falls in — what turns an age into the start
   * year the German pension tables are keyed by. Defaults to this year.
   */
  baseYear?: number
}

export const currentBaseYear = (): number => new Date().getFullYear()

/** Calendar year a plan age falls in. */
export function yearForAge(age: number, currentAge: number, context: PensionContext): number {
  return (context.baseYear ?? currentBaseYear()) + (age - currentAge)
}

/**
 * The taxable part of one year's pension, in the euros the pension is quoted
 * in. `yearIndex` counts from the pension's first year; `grossAt` gives the
 * gross annual amount for any year index, so the frozen allowances of the two
 * German modes can be pinned to their reference year.
 */
export function pensionTaxableAnnual(
  flow: CashFlow,
  yearIndex: number,
  grossAt: (index: number) => number,
  startYear: number,
  context: PensionContext
): number {
  const gross = grossAt(yearIndex)
  const mode = flow.pensionTaxMode ?? 'share'
  if (mode === 'statutory') {
    // § 22 EStG: the tax-free amount is fixed in euros from the second year
    // on; every later increase is fully taxable.
    const share = besteuerungsanteil(startYear)
    const allowance = (1 - share) * grossAt(1)
    return Math.max(0, gross - allowance)
  }
  if (mode === 'versorgungsbezuege') {
    // § 19 Abs. 2 EStG: Freibetrag (capped) plus Zuschlag, both fixed for life.
    const { share, cap, supplement } = versorgungsfreibetrag(startYear)
    const allowance = Math.min(grossAt(0) * share, cap) + supplement
    return Math.max(0, gross - allowance)
  }
  const portion = clamp(flow.taxablePortion ?? context.pensionTaxablePortion ?? 0, 0, 1)
  return gross * portion
}

/** What is left of a pension after income tax on its taxable share. */
export function pensionNetFactor(flow: CashFlow, context: PensionContext): number {
  const portion = clamp(flow.taxablePortion ?? context.pensionTaxablePortion ?? 0, 0, 1)
  const rate = clamp(context.pensionTaxRate ?? 0, 0, 1)
  return 1 - portion * rate
}

/** First age a pension pays out: its own start, else the statutory age. */
export function pensionStartAge(flow: CashFlow, legalRetirementAge: number): number {
  return flow.startAge ?? legalRetirementAge
}

/**
 * The age the first pension starts paying — what a "pension bridge" really
 * has to reach. The statutory age when the plan has no pension at all.
 */
export function firstPensionAge(flows: readonly CashFlow[], legalRetirementAge: number): number {
  const starts = flows
    .filter((flow) => isPensionFlow(flow) && flow.amount > 0)
    .map((flow) => pensionStartAge(flow, legalRetirementAge))
  return starts.length > 0 ? Math.min(...starts) : legalRetirementAge
}

const pensionMonthlyAmount = (flow: CashFlow) =>
  flow.frequency === 'annual' ? flow.amount / 12 : flow.amount

/**
 * Gross pension income per month at `age`, in the euros each pension is quoted
 * in, split by how inflation treats it. A pension that has not started, or has
 * ended, contributes nothing.
 */
export function pensionMonthlyAtAge(
  flows: readonly CashFlow[],
  age: number,
  legalRetirementAge: number
): { fixed: number; linked: number; total: number } {
  let fixed = 0
  let linked = 0
  for (const flow of flows) {
    if (!isPensionFlow(flow) || flow.amount <= 0) continue
    if (age < pensionStartAge(flow, legalRetirementAge)) continue
    if (flow.endAge !== undefined && age > flow.endAge) continue
    if (flow.inflationLinked === true) linked += pensionMonthlyAmount(flow)
    else fixed += pensionMonthlyAmount(flow)
  }
  return { fixed, linked, total: fixed + linked }
}

/** Net pension income per year at `age`, after the income tax on each pension. */
export function netPensionAnnualAtAge(
  flows: readonly CashFlow[],
  age: number,
  context: PensionContext
): number {
  let net = 0
  const rate = clamp(context.pensionTaxRate ?? 0, 0, 1)
  for (const flow of flows) {
    if (!isPensionFlow(flow) || flow.amount <= 0) continue
    const start = pensionStartAge(flow, context.legalRetirementAge)
    if (age < start) continue
    if (flow.endAge !== undefined && age > flow.endAge) continue
    const growth = flow.growthRate ?? 0
    const grossAt = (index: number) => pensionMonthlyAmount(flow) * 12 * Math.pow(1 + growth, index)
    const yearIndex = age - start
    const startYear = yearForAge(start, age - yearIndex, context)
    const taxable = pensionTaxableAnnual(flow, yearIndex, grossAt, startYear, context)
    net += grossAt(yearIndex) - taxable * rate
  }
  return Math.max(0, net)
}

/** The statutory pension's monthly amount — what `monthlyPension` projects. */
export function statutoryPensionMonthly(flows: readonly CashFlow[]): number {
  const flow = flows.find((entry) => entry.id === STATUTORY_PENSION_FLOW_ID && isPensionFlow(entry))
  return flow ? pensionMonthlyAmount(flow) : 0
}

/**
 * Writes `monthlyPension` into the flow list: updates the statutory pension's
 * amount, creates it when the plan has none, removes it at zero. Everything
 * else on an existing statutory flow (start age, tax share, indexing) is kept.
 */
export function withStatutoryPension(flows: readonly CashFlow[], amount: number): CashFlow[] {
  const monthly = Math.max(0, Number.isFinite(amount) ? amount : 0)
  const index = flows.findIndex((entry) => entry.id === STATUTORY_PENSION_FLOW_ID)
  if (monthly <= 0) return index === -1 ? [...flows] : flows.filter((_, i) => i !== index)
  if (index === -1) {
    return [
      {
        id: STATUTORY_PENSION_FLOW_ID,
        kind: 'pension',
        nameKey: STATUTORY_PENSION_NAME_KEY,
        name: STATUTORY_PENSION_NAME,
        amount: monthly,
        frequency: 'monthly',
        inflationLinked: false,
      },
      ...flows,
    ]
  }
  const existing = flows[index]
  if (
    existing.kind === 'pension' &&
    existing.frequency === 'monthly' &&
    existing.amount === monthly
  ) {
    return [...flows]
  }
  return flows.map((entry, i) =>
    i === index ? { ...entry, kind: 'pension', frequency: 'monthly', amount: monthly } : entry
  )
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
  const pension = kind === 'pension'
  // A pension is an income stream by definition — a single payment is a
  // one-off income, not a pension.
  const frequency =
    isCashFlowFrequency(raw.frequency) && !(pension && raw.frequency === 'once')
      ? raw.frequency
      : 'monthly'
  const taxablePortion = pension ? finiteOrNull(raw.taxablePortion) : null
  const taxTreatment =
    kind === 'income' && isIncomeTaxTreatment(raw.taxTreatment) && raw.taxTreatment !== 'none'
      ? raw.taxTreatment
      : undefined
  const pensionTaxMode =
    pension && isPensionTaxMode(raw.pensionTaxMode) && raw.pensionTaxMode !== 'share'
      ? raw.pensionTaxMode
      : undefined
  const startDate =
    frequency === 'once' && typeof raw.startDate === 'string' && MONTH_PATTERN.test(raw.startDate)
      ? raw.startDate
      : undefined
  const note =
    typeof raw.note === 'string' && raw.note.trim() !== ''
      ? raw.note.trim().slice(0, MAX_NOTE_LENGTH)
      : undefined
  const name = typeof raw.name === 'string' ? raw.name : ''
  // Seeded flows carry a translation key so they follow the UI language; it
  // survives round-tripping through storage but never affects the model.
  const nameKey =
    typeof raw.nameKey === 'string' && raw.nameKey.trim() !== '' ? raw.nameKey.trim() : undefined
  const startAge = optionalAge(raw.startAge)
  // A window is meaningless for a single payment, and keeping a stray `endAge`
  // around would make two otherwise identical flows compare unequal.
  const endAge = frequency === 'once' ? undefined : optionalAge(raw.endAge)
  const growth = finiteOrNull(raw.growthRate)

  return {
    id,
    kind,
    name,
    ...(nameKey !== undefined ? { nameKey } : {}),
    amount: Math.max(0, amount),
    frequency,
    ...(startAge !== undefined ? { startAge } : {}),
    ...(endAge !== undefined ? { endAge } : {}),
    // Pensions are nominal unless indexing is switched on explicitly; every
    // other flow is inflation-linked unless switched off.
    ...(raw.inflationLinked === false || (pension && raw.inflationLinked !== true)
      ? { inflationLinked: false }
      : {}),
    ...(raw.inflationLinked === true ? { inflationLinked: true } : {}),
    ...(growth !== null && growth !== 0
      ? { growthRate: clamp(growth, -MAX_GROWTH_RATE, MAX_GROWTH_RATE) }
      : {}),
    ...(taxablePortion !== null ? { taxablePortion: clamp(taxablePortion, 0, 1) } : {}),
    ...(taxTreatment !== undefined ? { taxTreatment } : {}),
    ...(pensionTaxMode !== undefined ? { pensionTaxMode } : {}),
    ...(startDate !== undefined ? { startDate } : {}),
    ...(note !== undefined ? { note } : {}),
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
        ...(typeof raw.nameKey === 'string' && raw.nameKey.trim() !== ''
          ? { nameKey: raw.nameKey.trim() }
          : {}),
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
    ...(flow.nameKey !== undefined ? { nameKey: flow.nameKey } : {}),
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
  /** Legacy statutory-pension field; a number here edits the statutory flow. */
  monthlyPension?: unknown
  currentAge?: number
}): CashFlow[] {
  const sanitized = sanitizeCashFlows(params.cashFlows)
  const legacyPension = finiteOrNull(params.monthlyPension)
  const flows = legacyPension === null ? sanitized : withStatutoryPension(sanitized, legacyPension)
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
      // A legacy array that still carries the key keeps it; one that has
      // dropped it (a user rename came through the projection) drops it here
      // too, so a localised label can never outlive the user's own text.
      const { nameKey: _dropped, ...rest } = existing
      void _dropped
      replacements.set(existing.id, {
        ...rest,
        name: expense.name,
        ...(expense.nameKey !== undefined ? { nameKey: expense.nameKey } : {}),
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
      ...(expense.nameKey !== undefined ? { nameKey: expense.nameKey } : {}),
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
    monthlyPension: statutoryPensionMonthly(cashFlows),
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
    monthlyPension: statutoryPensionMonthly(cashFlows),
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
  /**
   * What tax each taxed flow pays in its first paying year (a one-off: its
   * only year), keyed by flow id — for the editor to show "tax · net".
   */
  taxByFlow: ReadonlyMap<string, FlowTaxSummary>
}

export interface FlowTaxSummary {
  age: number
  gross: number
  tax: number
  net: number
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
  endAge: number,
  /** Needed for pension flows; without it they start at `currentAge` untaxed. */
  pension: PensionContext = { legalRetirementAge: currentAge }
): CashFlowSeries {
  const years = Math.max(0, endAge - currentAge + 1)
  const incomeLinked = new Array<number>(years).fill(0)
  const incomeFixed = new Array<number>(years).fill(0)
  const expenseLinked = new Array<number>(years).fill(0)
  const expenseFixed = new Array<number>(years).fill(0)
  const oneTimeIncomeLinkedByAge = new Map<number, number>()
  const oneTimeIncomeFixedByAge = new Map<number, number>()
  const taxByFlow = new Map<string, FlowTaxSummary>()

  let baselineMonthly = 0
  let baselineAnnual = 0

  const splitting = pension.householdType === 'couple'
  const pensionRate = clamp(pension.pensionTaxRate ?? 0, 0, 1)

  /** One flow expanded to gross euros per year offset (today's euros). */
  interface Expanded {
    flow: CashFlow
    linked: boolean
    /** Year offsets and the gross amount in each. */
    gross: number[]
    /** First offset the flow pays in, or -1. */
    firstOffset: number
    /** Pension only: taxable part of the gross per offset. */
    taxable?: number[]
  }

  const expanded: Expanded[] = []

  for (const flow of flows) {
    const amount = Math.max(0, flow.amount)

    if (isBaselineExpenseFlow(flow)) {
      if (flow.frequency === 'annual') baselineAnnual += amount
      else baselineMonthly += amount
      continue
    }

    if (amount <= 0) continue

    const gross = new Array<number>(years).fill(0)
    const isPension = isPensionFlow(flow)

    // One-off income keeps its long-standing convention: it lands at the start
    // of the year *after* the age it is booked for. Changing that would move
    // every existing plan's numbers.
    if (isOnceIncomeFlow(flow)) {
      const depositAge = (flow.startAge ?? currentAge) + 1
      if (depositAge < currentAge || depositAge > endAge) continue
      gross[depositAge - currentAge] = amount
      expanded.push({
        flow,
        linked: flow.inflationLinked !== false,
        gross,
        firstOffset: depositAge - currentAge,
      })
      continue
    }

    const perYear = flow.frequency === 'monthly' ? amount * 12 : amount
    const linked = isPension ? flow.inflationLinked === true : flow.inflationLinked !== false
    const growth = flow.growthRate ?? 0
    const start = Math.max(
      currentAge,
      isPension ? pensionStartAge(flow, pension.legalRetirementAge) : (flow.startAge ?? currentAge)
    )
    const last = flow.frequency === 'once' ? start : Math.min(endAge, flow.endAge ?? endAge)
    if (start > endAge || last < start) continue

    // Extra growth compounds from the first year regardless of indexing:
    // a fixed-euro pension with 1 % grows nominally, an indexed one grows on
    // top of inflation.
    const grossAt = (index: number) =>
      growth === 0 ? perYear : perYear * Math.pow(1 + growth, index)
    for (let age = start; age <= last; age++) gross[age - currentAge] = grossAt(age - start)

    let taxable: number[] | undefined
    if (isPension) {
      taxable = new Array<number>(years).fill(0)
      const startYear = yearForAge(start, currentAge, pension)
      for (let age = start; age <= last; age++) {
        taxable[age - currentAge] = pensionTaxableAnnual(
          flow,
          age - start,
          grossAt,
          startYear,
          pension
        )
      }
    }

    expanded.push({ flow, linked, gross, firstOffset: start - currentAge, taxable })
  }

  // The year's other taxable income, which is what taxed income flows are
  // taxed on top of: pensions' taxable parts plus every ordinary-income flow.
  const pensionBase = new Array<number>(years).fill(0)
  const ordinaryGross = new Array<number>(years).fill(0)
  for (const entry of expanded) {
    if (entry.taxable) {
      entry.taxable.forEach((value, offset) => {
        pensionBase[offset] += value
      })
    } else if (entry.flow.kind === 'income' && entry.flow.taxTreatment === 'ordinary') {
      entry.gross.forEach((value, offset) => {
        ordinaryGross[offset] += value
      })
    }
  }

  for (const entry of expanded) {
    const { flow, linked, gross } = entry
    const isPension = isPensionFlow(flow)
    const income = flow.kind === 'income' || isPension
    const once = isOnceIncomeFlow(flow)
    const target = once
      ? null
      : income
        ? linked
          ? incomeLinked
          : incomeFixed
        : linked
          ? expenseLinked
          : expenseFixed
    const onceTarget = linked ? oneTimeIncomeLinkedByAge : oneTimeIncomeFixedByAge

    for (let offset = 0; offset < years; offset++) {
      const amount = gross[offset]
      if (amount <= 0) continue

      let tax = 0
      if (isPension && entry.taxable) {
        tax = entry.taxable[offset] * pensionRate
      } else if (flow.kind === 'income' && flow.taxTreatment === 'ordinary') {
        // Every ordinary-income flow of the year is taxed jointly on top of the
        // pensions; each carries its share of that tax.
        const total = ordinaryGross[offset]
        const jointTax = ordinaryIncomeTax(total, pensionBase[offset], splitting)
        tax = total > 0 ? (jointTax * amount) / total : 0
      } else if (flow.kind === 'income' && flow.taxTreatment === 'oneFifth') {
        // A one-off is taxed in the year it is booked for, not the year the
        // engine credits it.
        const taxYear = once ? Math.max(0, offset - 1) : offset
        const rest = pensionBase[taxYear] + ordinaryGross[taxYear]
        tax = oneFifthRuleTax(amount, rest, splitting)
      }

      const net = Math.max(0, amount - tax)
      if (tax > 0 && !taxByFlow.has(flow.id)) {
        taxByFlow.set(flow.id, { age: currentAge + offset - (once ? 1 : 0), gross: amount, tax, net })
      }

      if (once) {
        const age = currentAge + offset
        onceTarget.set(age, (onceTarget.get(age) ?? 0) + net)
      } else if (target) {
        target[offset] += net
      }
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
    taxByFlow,
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
        flow.taxablePortion ?? '',
        flow.taxTreatment ?? '',
        flow.pensionTaxMode ?? '',
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
