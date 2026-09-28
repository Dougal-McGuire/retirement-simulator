import type { AnnualCashFlow, CashFlow, SimulationParams } from '@/types'
import {
  buildCashFlowSeries,
  isBaselineExpenseFlow,
  isCashFlowEnabled,
  isOnceIncomeFlow,
  isPensionFlow,
} from './cashFlows'
import { taxContext } from './engine'

/**
 * Booked ledger categories -> the plan's own cash flows.
 *
 * The engine books one {@link AnnualCashFlow} row per year and *category*
 * (pensions, other income, one-off income, the baseline budget, scheduled
 * expenses) — it never records which flow paid what. This module splits each
 * category of a booked row back into its member flows so the Geldfluss diagram
 * and table can show "Gesetzliche Rente", "Lebensmittel", … instead of totals.
 *
 * Rules (see docs/specs/2026-09-28-cashflow-drilldown.md):
 *
 * - **The booked total wins.** Members are weights, never amounts: each item is
 *   `categoryTotal × weight / Σ weights`, so the items add up to exactly what
 *   the engine booked and the diagram still balances.
 * - **Weights** are each flow's expected amount that year, from
 *   `buildCashFlowSeries([flow])` (today's euros). An inflation-linked flow is
 *   re-priced with the median realised price level (`inflationIndexP50`), a
 *   fixed-euro one is not — the same distinction the engine makes per path.
 *   In real terms the roles swap: linked flows stay put, fixed ones shrink.
 * - **Taxes** of a category are split by each member's own tax (a pension's
 *   taxable share × rate is booked per pension, so that split is exact); where
 *   income is taxed jointly (ordinary income, the one-fifth rule) the split is
 *   proportional and marked `taxEstimated`.
 * - **The baseline budget** is one pooled amount. Under `fixedReal` it is the
 *   sum of its items, so the split is exact; every other withdrawal rule scales
 *   the pool as a whole, so the items are proportional shares (`estimated`).
 * - **One-off income** keeps the engine's convention: it lands in the year
 *   *after* its booked age, together with its tax.
 * - **Switched-off flows** never appear; they are listed in `disabled`.
 *
 * Nothing here moves money. `cashFlows.ts` and the engine stay the only model.
 */

/** A ledger category that holds plan flows. `income`/`spending`: rows without a breakdown. */
export type FlowCategory =
  | 'pension'
  | 'otherIncome'
  | 'oneOffIncome'
  | 'income'
  | 'baselineSpending'
  | 'scheduledExpenses'
  | 'spending'

export const SOURCE_CATEGORIES: readonly FlowCategory[] = [
  'pension',
  'otherIncome',
  'oneOffIncome',
  'income',
]
export const SINK_CATEGORIES: readonly FlowCategory[] = [
  'baselineSpending',
  'scheduledExpenses',
  'spending',
]

export const FLOW_CATEGORIES: readonly FlowCategory[] = [...SOURCE_CATEGORIES, ...SINK_CATEGORIES]

export const isFlowCategory = (value: string): value is FlowCategory =>
  (SOURCE_CATEGORIES as readonly string[]).includes(value) ||
  (SINK_CATEGORIES as readonly string[]).includes(value)

const positive = (value: number | undefined) =>
  Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0

/** The ledger row split into the parts the diagram draws. All values >= 0. */
export interface LedgerParts {
  /** Gross amount and tax per income source; `income` only without a breakdown. */
  incomes: {
    id: 'pension' | 'otherIncome' | 'income' | 'oneOffIncome'
    gross: number
    tax: number
  }[]
  savings: number
  withdrawal: number
  capitalGainsTax: number
  shortfall: number
  /** `spending` only when the row carries no expense breakdown. */
  expenses: { id: 'baselineSpending' | 'scheduledExpenses' | 'spending'; value: number }[]
  reinvested: number
}

export function ledgerParts(row: AnnualCashFlow): LedgerParts {
  const incomeGross = positive(row.incomeGross)
  const incomeTax = positive(row.incomeTax)
  const hasIncomeDetail = row.pensionGross !== undefined && row.oneOffIncomeGross !== undefined
  let incomes: LedgerParts['incomes']
  if (hasIncomeDetail) {
    const pensionGross = positive(row.pensionGross)
    const pensionTax = positive(row.pensionTax)
    const oneOffGross = positive(row.oneOffIncomeGross)
    const oneOffTax = positive(row.oneOffIncomeTax)
    // "Other" is whatever the total holds beyond the two booked parts, so the
    // three always add back up to the ledger's own total.
    incomes = [
      { id: 'pension', gross: pensionGross, tax: pensionTax },
      {
        id: 'otherIncome',
        gross: positive(incomeGross - pensionGross - oneOffGross),
        tax: positive(incomeTax - pensionTax - oneOffTax),
      },
      { id: 'oneOffIncome', gross: oneOffGross, tax: oneOffTax },
    ]
  } else {
    incomes = [{ id: 'income', gross: incomeGross, tax: incomeTax }]
  }

  const expenses = positive(row.expenses)
  const scheduled = row.scheduledExpenses
  return {
    incomes,
    savings: positive(row.savings),
    withdrawal: positive(row.portfolioWithdrawal),
    capitalGainsTax: positive(row.capitalGainsTax),
    shortfall: Math.min(positive(row.shortfall), expenses),
    expenses:
      scheduled === undefined
        ? [{ id: 'spending', value: expenses }]
        : [
            { id: 'baselineSpending', value: positive(expenses - positive(scheduled)) },
            { id: 'scheduledExpenses', value: Math.min(positive(scheduled), expenses) },
          ],
    reinvested: positive(row.portfolioContribution),
  }
}

type CategoryTotals = Partial<Record<FlowCategory, { total: number; tax: number }>>

/**
 * Booked total (gross for income) and tax of every flow category in a row.
 * `shape` folds a row's breakdown into the fallback categories (`income`,
 * `spending`) when the row that is drawn has none — a retirement sum over
 * rows booked before the breakdown existed.
 */
export function categoryTotals(
  row: AnnualCashFlow,
  shape: { incomeDetail: boolean; expenseDetail: boolean } = {
    incomeDetail: true,
    expenseDetail: true,
  }
): CategoryTotals {
  const parts = ledgerParts(row)
  const totals: CategoryTotals = {}
  const put = (key: FlowCategory, total: number, tax: number) => {
    const entry = totals[key] ?? { total: 0, tax: 0 }
    entry.total += total
    entry.tax += tax
    totals[key] = entry
  }
  for (const income of parts.incomes) {
    put(shape.incomeDetail ? income.id : 'income', income.gross, Math.min(income.tax, income.gross))
  }
  for (const expense of parts.expenses) {
    put(shape.expenseDetail ? expense.id : 'spending', expense.value, 0)
  }
  return totals
}

/** Below this a booked category is float noise (a working year's "baseline"). */
const MIN_TOTAL = 1e-6

// ---------------------------------------------------------------------------
// Flow tracks: each enabled flow expanded per year, once per result
// ---------------------------------------------------------------------------

type PrimaryCategory = Exclude<FlowCategory, 'income' | 'spending'>

/** One flow's expected amounts per year offset, in today's euros. */
export interface FlowTrack {
  flow: CashFlow
  category: PrimaryCategory
  /** Re-priced with inflation (true) or fixed in nominal euros. */
  linked: boolean
  /** Gross amount per year offset from `currentAge`. */
  gross: readonly number[]
  /** The flow's own income tax per year offset, taxed on its own. */
  tax: readonly number[]
}

export interface FlowTracks {
  currentAge: number
  tracks: FlowTrack[]
  /** Switched-off flows, in plan order. They are never part of a category. */
  disabled: CashFlow[]
  /** Whether the withdrawal rule scales the baseline budget as a whole. */
  pooledBaseline: boolean
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
const add = (a: readonly number[], b: readonly number[]) => a.map((value, i) => value + b[i])

function primaryCategory(flow: CashFlow): PrimaryCategory {
  if (isPensionFlow(flow)) return 'pension'
  if (flow.kind === 'income') return isOnceIncomeFlow(flow) ? 'oneOffIncome' : 'otherIncome'
  return isBaselineExpenseFlow(flow) ? 'baselineSpending' : 'scheduledExpenses'
}

/**
 * Expands every enabled flow of a simulated parameter set (`results.params`)
 * into per-year amounts. The expensive part; memoise it per result.
 */
export function buildFlowTracks(params: SimulationParams): FlowTracks {
  const flows = params.cashFlows ?? []
  const context = taxContext(params)
  const years = Math.max(0, params.endAge - params.currentAge + 1)
  const tracks: FlowTrack[] = []
  const disabled: CashFlow[] = []

  for (const flow of flows) {
    if (!isCashFlowEnabled(flow)) {
      disabled.push(flow)
      continue
    }
    if (!(flow.amount > 0)) continue
    const series = buildCashFlowSeries([flow], params.currentAge, params.endAge, context)
    const category = primaryCategory(flow)
    let gross: number[]
    let tax: number[] = new Array<number>(years).fill(0)
    let linked: boolean

    if (category === 'baselineSpending') {
      const annual = series.baselineMonthly * 12 + series.baselineAnnual
      gross = new Array<number>(years).fill(annual)
      linked = true
    } else if (category === 'pension') {
      const pensionTax = add(series.pensionTaxLinked, series.pensionTaxFixed)
      gross = add(add(series.pensionNetLinked, series.pensionNetFixed), pensionTax)
      tax = pensionTax
      linked = sum(series.pensionNetLinked) + sum(series.pensionTaxLinked) > 0
    } else if (category === 'oneOffIncome') {
      tax = add(series.oneTimeIncomeTaxLinked, series.oneTimeIncomeTaxFixed)
      // Keyed by the age it is credited at — the year after its booked age.
      gross = tax.map(
        (value, offset) =>
          value +
          (series.oneTimeIncomeLinkedByAge.get(params.currentAge + offset) ?? 0) +
          (series.oneTimeIncomeFixedByAge.get(params.currentAge + offset) ?? 0)
      )
      linked = series.oneTimeIncomeLinkedByAge.size > 0
    } else if (category === 'otherIncome') {
      tax = add(series.incomeTaxLinked, series.incomeTaxFixed)
      gross = add(add(series.incomeLinked, series.incomeFixed), tax)
      linked = sum(series.incomeLinked) + sum(series.incomeTaxLinked) > 0
    } else {
      gross = add(series.expenseLinked, series.expenseFixed)
      linked = sum(series.expenseLinked) > 0
    }
    if (gross.every((value) => value <= 0)) continue
    tracks.push({ flow, category, linked, gross, tax })
  }

  return {
    currentAge: params.currentAge,
    tracks,
    disabled,
    pooledBaseline: params.withdrawalStrategy !== 'fixedReal',
  }
}

// ---------------------------------------------------------------------------
// Allocation
// ---------------------------------------------------------------------------

/**
 * Splits `total` in proportion to `weights`. The parts add up to `total`
 * exactly (the last positive weight takes the floating-point remainder).
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  const clean = weights.map((weight) => positive(weight))
  const weightSum = sum(clean)
  if (!(total > 0) || weightSum <= 0) return clean.map(() => 0)
  const parts = clean.map((weight) => (total * weight) / weightSum)
  let last = -1
  clean.forEach((weight, i) => {
    if (weight > 0) last = i
  })
  parts[last] = total - sum(parts.filter((_, i) => i !== last))
  return parts
}

/**
 * Like {@link allocate}, but no part may exceed its cap (a flow cannot pay
 * more tax than it earns). What a capped part cannot take goes to the others,
 * by weight while they have room, else by room left. `total` must not exceed
 * the sum of the caps.
 */
export function allocateCapped(
  total: number,
  weights: readonly number[],
  caps: readonly number[]
): number[] {
  const parts = weights.map(() => 0)
  let remaining = total
  let open = weights.map((_, i) => caps[i] > 0)
  for (let round = 0; round < weights.length + 1 && remaining > 1e-9; round++) {
    const openWeights = weights.map((weight, i) => (open[i] ? positive(weight) : 0))
    const useRoom = sum(openWeights) <= 0
    const shares = allocate(
      remaining,
      useRoom ? caps.map((cap, i) => (open[i] ? cap - parts[i] : 0)) : openWeights
    )
    let spilled = 0
    const next = [...open]
    shares.forEach((share, i) => {
      const room = caps[i] - parts[i]
      if (share > room) {
        parts[i] = caps[i]
        spilled += share - room
        next[i] = false
      } else {
        parts[i] += share
      }
    })
    remaining = spilled
    open = next
    if (!open.some(Boolean)) break
  }
  return parts
}

/**
 * Whole euros that add up to the rounded total (largest remainder), so a
 * column of rounded items always matches its rounded category line.
 */
export function roundToTotal(values: readonly number[], total = sum(values)): number[] {
  const target = Math.round(total)
  const floors = values.map((value) => Math.floor(Math.max(0, value)))
  let remainder = target - sum(floors)
  const order = values
    .map((value, i) => ({ i, fraction: Math.max(0, value) - floors[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i)
  const rounded = [...floors]
  for (let k = 0; remainder > 0 && order.length > 0; k = (k + 1) % order.length) {
    rounded[order[k].i] += 1
    remainder -= 1
  }
  for (let k = order.length - 1; remainder < 0 && k >= 0; k--) {
    const i = order[k].i
    if (rounded[i] > 0) {
      rounded[i] -= 1
      remainder += 1
    }
  }
  return rounded
}

export interface FlowBreakdownItem {
  /** Stable key within the category: the flow id, or `unassigned`. */
  key: string
  /** The plan flow; null for an amount no flow explains (older results). */
  flow: CashFlow | null
  category: FlowCategory
  /** Euros in the selected unit: gross for income, the spent amount for expenses. */
  amount: number
  /** Income tax on it (income categories only). */
  tax: number
  /** Whole-euro amount; a category's rounded items add up to its rounded total. */
  rounded: number
  roundedTax: number
  /** Share of the category total, 0–1. */
  share: number
  /** The amount is a proportional share of a pooled total ("anteilig"). */
  estimated: boolean
  /** The tax is a proportional share of a jointly taxed total. */
  taxEstimated: boolean
}

export interface CategoryBreakdown {
  category: FlowCategory
  /** The booked category total (gross for income). */
  total: number
  /** The booked tax of the category (income only). */
  tax: number
  /** Largest first. `Σ amount === total`, `Σ tax === tax`. */
  items: FlowBreakdownItem[]
}

export interface FlowBreakdown {
  categories: Partial<Record<FlowCategory, CategoryBreakdown>>
  /** Switched-off flows: kept in the plan, left out of every calculation. */
  disabled: CashFlow[]
}

export interface BreakdownSelection {
  /** Booked rows per age (nominal or real — the same series the row comes from). */
  series: readonly AnnualCashFlow[]
  ages: readonly number[]
  /** `results.inflationIndexP50`; without it inflation compounds at `fallbackInflation`. */
  priceLevel?: readonly number[]
  fallbackInflation?: number
  /** Amounts in today's euros (`cashFlowMeansReal`) instead of nominal ones. */
  real: boolean
  fromAge: number
  toAge: number
  /** The row the diagram draws: one year, or those years summed. */
  row: AnnualCashFlow
}

const MEMBERS: Record<FlowCategory, readonly PrimaryCategory[]> = {
  pension: ['pension'],
  otherIncome: ['otherIncome'],
  oneOffIncome: ['oneOffIncome'],
  income: ['pension', 'otherIncome', 'oneOffIncome'],
  baselineSpending: ['baselineSpending'],
  scheduledExpenses: ['scheduledExpenses'],
  spending: ['baselineSpending', 'scheduledExpenses'],
}

const UNASSIGNED = 'unassigned'

/**
 * How much of its category's income tax a flow carries, as a weight:
 * - a pension: its own tax — taxable share × rate is booked per pension;
 * - taxed income (ordinary, one-fifth rule): its gross — the engine splits a
 *   year's joint tax on ordinary income over those flows by gross;
 * - untaxed income (`none`, the default: already net): nothing.
 */
function taxWeight(
  track: FlowTrack,
  amount: number,
  priced: (track: FlowTrack, values: readonly number[]) => number
): number {
  if (track.category === 'pension') return priced(track, track.tax)
  const treatment = track.flow.taxTreatment
  return treatment === 'ordinary' || treatment === 'oneFifth' ? amount : 0
}

interface Accumulator {
  amount: Map<string, number>
  tax: Map<string, number>
  estimated: Set<string>
  taxEstimated: Set<string>
}

/**
 * Splits every flow category of the selected row into its member flows.
 * For a span of years (the retirement sum) each year is split on its own
 * booked row and the items are added up.
 */
export function breakdownLedger(tracks: FlowTracks, selection: BreakdownSelection): FlowBreakdown {
  const { series, ages, real, row } = selection
  const from = ages.indexOf(selection.fromAge)
  const to = ages.indexOf(selection.toAge)
  const shownTotals = categoryTotals(row)
  const shape = {
    incomeDetail: shownTotals.income === undefined,
    expenseDetail: shownTotals.spending === undefined,
  }
  const categories: Partial<Record<FlowCategory, CategoryBreakdown>> = {}
  if (from < 0 || to < from) return { categories, disabled: tracks.disabled }

  const inflation = selection.fallbackInflation ?? 0
  const level = (index: number) => {
    const value = selection.priceLevel?.[index]
    return value !== undefined && value > 0 ? value : Math.pow(1 + inflation, index)
  }
  const offsetOf = (index: number) => ages[index] - tracks.currentAge

  const accumulators = new Map<FlowCategory, Accumulator>()
  const accumulatorFor = (category: FlowCategory) => {
    let entry = accumulators.get(category)
    if (!entry) {
      entry = { amount: new Map(), tax: new Map(), estimated: new Set(), taxEstimated: new Set() }
      accumulators.set(category, entry)
    }
    return entry
  }
  const bump = (map: Map<string, number>, key: string, value: number) => {
    if (value > 0) map.set(key, (map.get(key) ?? 0) + value)
  }

  // A single year is split on the row itself (it *is* series[from]); a span
  // on each of its booked rows.
  const single = from === to
  for (let index = from; index <= Math.min(to, series.length - 1); index++) {
    const booked = single ? row : series[index]
    const totals = categoryTotals(booked, shape)
    const offset = offsetOf(index)
    const price = level(index)
    const priced = (track: FlowTrack, values: readonly number[]) => {
      const value = values[offset] ?? 0
      if (value <= 0) return 0
      if (real) return track.linked ? value : value / price
      return track.linked ? value * price : value
    }

    for (const [key, booking] of Object.entries(totals) as [
      FlowCategory,
      { total: number; tax: number },
    ][]) {
      if (!(booking.total > MIN_TOTAL)) continue
      const members = tracks.tracks.filter((track) => MEMBERS[key].includes(track.category))
      const weights = members.map((track) => priced(track, track.gross))
      const acc = accumulatorFor(key)
      if (sum(weights) <= 0) {
        bump(acc.amount, UNASSIGNED, booking.total)
        bump(acc.tax, UNASSIGNED, booking.tax)
        acc.estimated.add(UNASSIGNED)
        continue
      }
      const amounts = allocate(booking.total, weights)
      // The rule scaled the pooled budget: every member of a category that
      // holds it is a proportional share, not its own booked amount.
      const pooled = tracks.pooledBaseline && MEMBERS[key].includes('baselineSpending')
      members.forEach((track, i) => {
        bump(acc.amount, track.flow.id, amounts[i])
        if (pooled && amounts[i] > 0) acc.estimated.add(track.flow.id)
      })

      if (booking.tax > MIN_TOTAL) {
        const weights = members.map((track, i) => taxWeight(track, amounts[i], priced))
        // Nothing taxed on its own terms (should not happen): spread by gross.
        const byGross = sum(weights) <= 0
        const taxes = allocateCapped(booking.tax, byGross ? amounts : weights, amounts)
        const taxedMembers = members.filter((_, i) => taxes[i] > 0)
        // Exact where the engine books tax per flow (pensions) or splits a
        // joint tax by gross (ordinary income); a share wherever rules mix.
        const treatments = new Set(taxedMembers.map((track) => track.flow.taxTreatment))
        const split = taxedMembers.length > 1 && (byGross || treatments.size > 1)
        members.forEach((track, i) => {
          bump(acc.tax, track.flow.id, taxes[i])
          if (taxes[i] > 0 && split) acc.taxEstimated.add(track.flow.id)
        })
      }
    }
  }

  const byId = new Map(tracks.tracks.map((track) => [track.flow.id, track.flow]))
  for (const [category, acc] of accumulators) {
    const booking = shownTotals[category]
    if (!booking || !(booking.total > MIN_TOTAL)) continue
    const keys = [...acc.amount.keys()]
    // Summed years drift from the summed row by float noise only; rescale so
    // the items add up to the drawn total exactly.
    const amounts = allocate(
      booking.total,
      keys.map((key) => acc.amount.get(key) ?? 0)
    )
    const taxes =
      booking.tax > MIN_TOTAL
        ? allocateCapped(
            booking.tax,
            keys.map((key) => acc.tax.get(key) ?? 0),
            amounts
          )
        : keys.map(() => 0)
    const order = keys
      .map((key, i) => ({ key, i }))
      .filter(({ i }) => amounts[i] > 0)
      .sort(
        (a, b) =>
          (a.key === UNASSIGNED ? 1 : 0) - (b.key === UNASSIGNED ? 1 : 0) ||
          amounts[b.i] - amounts[a.i]
      )
    const rounded = roundToTotal(
      order.map(({ i }) => amounts[i]),
      booking.total
    )
    const roundedTax = roundToTotal(
      order.map(({ i }) => taxes[i]),
      booking.tax
    )
    categories[category] = {
      category,
      total: booking.total,
      tax: booking.tax,
      items: order.map(({ key, i }, position) => ({
        key,
        flow: key === UNASSIGNED ? null : (byId.get(key) ?? null),
        category,
        amount: amounts[i],
        tax: taxes[i],
        rounded: rounded[position],
        roundedTax: roundedTax[position],
        share: amounts[i] / booking.total,
        estimated: acc.estimated.has(key),
        taxEstimated: acc.taxEstimated.has(key),
      })),
    }
  }

  return { categories, disabled: tracks.disabled }
}
