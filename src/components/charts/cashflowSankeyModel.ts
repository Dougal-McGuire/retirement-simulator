import type { AnnualCashFlow } from '@/types'

/**
 * Ledger rows -> Sankey nodes and links.
 *
 * The diagram is a *drawing of the ledger*, not a second model: every node and
 * link is read or subtracted from one booked {@link AnnualCashFlow} row, so it
 * balances exactly where the ledger's three columns balance:
 *
 *   incomeGross + savings + portfolioWithdrawal + shortfall
 *     = incomeTax + capitalGainsTax + expenses + portfolioContribution
 *
 * Layout, left to right:
 *   sources  - gross pensions, other income, one-off income, savings, the gross
 *              portfolio sale, and (only when some paths run dry) the unfunded gap
 *   middle   - taxes peel off each source; the rest meets in "available after tax"
 *   sinks    - baseline spending, scheduled expenses, money paid into the portfolio
 *
 * The unfunded gap is not money: it feeds the spending nodes directly and never
 * passes through the "available" hub, so the hub only ever holds real cash.
 */

export type SankeyNodeId =
  | 'pension'
  | 'otherIncome'
  /** Fallback for rows booked before the income breakdown existed. */
  | 'income'
  | 'oneOffIncome'
  | 'savings'
  | 'withdrawal'
  | 'shortfall'
  | 'available'
  | 'incomeTax'
  | 'capitalGainsTax'
  | 'baselineSpending'
  | 'scheduledExpenses'
  /** Fallback for rows booked before the expense breakdown existed. */
  | 'spending'
  | 'reinvested'

/** 0 = where money comes from, 1 = taxes and the after-tax hub, 2 = where it goes. */
export type SankeyColumn = 0 | 1 | 2

export interface CashflowSankeyNode {
  id: SankeyNodeId
  column: SankeyColumn
  /** Euros through the node (sum of its links on either side). */
  value: number
  /** Spending nodes only: the part fed by the unfunded gap. */
  unfunded?: number
}

export interface CashflowSankeyLink {
  source: SankeyNodeId
  target: SankeyNodeId
  value: number
}

export interface CashflowSankeyModel {
  /** In display order: sources, then the middle column, then sinks. */
  nodes: CashflowSankeyNode[]
  links: CashflowSankeyLink[]
  /** Sum of the source nodes — the denominator for every share. */
  totalIn: number
  /** Sum of every terminal node (taxes and sinks). Equals `totalIn`. */
  totalOut: number
  /** Income tax plus capital gains tax. */
  taxes: number
}

/**
 * Amounts below this are left out of the drawing. Ledger rows are averages over
 * every simulated path, so a single path's rare shortfall shows up as cents;
 * drawing a hairline labelled "0 €" would say nothing. Matches the ledger's own
 * "rounded amounts may differ by a euro".
 */
export const SANKEY_MIN_AMOUNT = 0.5

const TAX_NODES: readonly SankeyNodeId[] = ['incomeTax', 'capitalGainsTax']

const NODE_ORDER: readonly SankeyNodeId[] = [
  'pension',
  'otherIncome',
  'income',
  'oneOffIncome',
  'savings',
  'withdrawal',
  'shortfall',
  // Middle column: income tax sits beside the income sources, capital gains
  // tax beside the portfolio sale, so neither tax link has to cross the hub.
  'incomeTax',
  'available',
  'capitalGainsTax',
  'baselineSpending',
  'scheduledExpenses',
  'spending',
  'reinvested',
]

const COLUMN: Record<SankeyNodeId, SankeyColumn> = {
  pension: 0,
  otherIncome: 0,
  income: 0,
  oneOffIncome: 0,
  savings: 0,
  withdrawal: 0,
  shortfall: 0,
  incomeTax: 1,
  available: 1,
  capitalGainsTax: 1,
  baselineSpending: 2,
  scheduledExpenses: 2,
  spending: 2,
  reinvested: 2,
}

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

export function buildCashflowSankey(
  row: AnnualCashFlow,
  minAmount = SANKEY_MIN_AMOUNT
): CashflowSankeyModel {
  const parts = ledgerParts(row)
  const links: CashflowSankeyLink[] = []
  const add = (source: SankeyNodeId, target: SankeyNodeId, value: number) => {
    if (value >= minAmount) links.push({ source, target, value })
  }

  for (const income of parts.incomes) {
    const tax = Math.min(income.tax, income.gross)
    add(income.id, 'incomeTax', tax)
    add(income.id, 'available', income.gross - tax)
  }
  add('savings', 'available', parts.savings)
  const saleTax = Math.min(parts.capitalGainsTax, parts.withdrawal)
  add('withdrawal', 'capitalGainsTax', saleTax)
  add('withdrawal', 'available', parts.withdrawal - saleTax)

  // The engine books one unfunded amount per year, not per expense; spread it
  // in proportion to what each part asked for rather than guessing an order.
  const requested = parts.expenses.reduce((sum, part) => sum + part.value, 0)
  const unfunded = new Map<SankeyNodeId, number>()
  for (const part of parts.expenses) {
    const gap = requested > 0 ? (parts.shortfall * part.value) / requested : 0
    unfunded.set(part.id, gap)
    add('shortfall', part.id, gap)
    add('available', part.id, part.value - gap)
  }
  add('available', 'reinvested', parts.reinvested)

  const inflow = new Map<SankeyNodeId, number>()
  const outflow = new Map<SankeyNodeId, number>()
  for (const link of links) {
    outflow.set(link.source, (outflow.get(link.source) ?? 0) + link.value)
    inflow.set(link.target, (inflow.get(link.target) ?? 0) + link.value)
  }

  const nodes: CashflowSankeyNode[] = []
  for (const id of NODE_ORDER) {
    const value = Math.max(inflow.get(id) ?? 0, outflow.get(id) ?? 0)
    if (value <= 0) continue
    const node: CashflowSankeyNode = { id, column: COLUMN[id], value }
    const gap = unfunded.get(id)
    if (gap !== undefined && gap >= minAmount) node.unfunded = gap
    nodes.push(node)
  }

  const totalIn = nodes
    .filter((node) => node.column === 0)
    .reduce((sum, node) => sum + node.value, 0)
  const terminal = nodes.filter((node) => !outflow.has(node.id))
  const totalOut = terminal.reduce((sum, node) => sum + node.value, 0)
  const taxes = nodes
    .filter((node) => TAX_NODES.includes(node.id))
    .reduce((sum, node) => sum + node.value, 0)

  return { nodes, links, totalIn, totalOut, taxes }
}

/** What the year selector can point at: one age, or every retirement year summed. */
export type LedgerSelection = number | 'retirement'

export const RETIREMENT_SUM: LedgerSelection = 'retirement'

/**
 * Adds ledger rows up into one row that still balances. Flows are summed; the
 * balance sheet keeps the first opening and the last closing balance, so the
 * asset reconciliation (opening + return + in - out = closing) holds for the
 * whole span exactly as it does for each year.
 */
export function sumLedgerRows(rows: readonly AnnualCashFlow[]): AnnualCashFlow | null {
  if (rows.length === 0) return null
  const flowKeys = [
    'investmentReturn',
    'savings',
    'incomeGross',
    'incomeTax',
    'capitalGainsTax',
    'expenses',
    'portfolioWithdrawal',
    'portfolioContribution',
    'shortfall',
  ] as const satisfies readonly (keyof AnnualCashFlow)[]
  const detailKeys = [
    'pensionGross',
    'pensionTax',
    'oneOffIncomeGross',
    'oneOffIncomeTax',
    'scheduledExpenses',
  ] as const satisfies readonly (keyof AnnualCashFlow)[]

  const total: AnnualCashFlow = {
    ...Object.fromEntries(flowKeys.map((key) => [key, 0])),
    openingAssets: rows[0].openingAssets,
    closingAssets: rows[rows.length - 1].closingAssets,
  } as AnnualCashFlow
  for (const row of rows) {
    for (const key of flowKeys) total[key] += row[key]
  }
  // A breakdown only survives if every row has it; otherwise the sum would
  // silently attribute old rows' totals to "other".
  for (const key of detailKeys) {
    if (rows.every((row) => row[key] !== undefined)) {
      total[key] = rows.reduce((sum, row) => sum + (row[key] ?? 0), 0)
    }
  }
  return total
}

export interface ResolvedLedgerSelection {
  row: AnnualCashFlow
  /** The age of a single year; for the retirement sum, its first age. */
  fromAge: number
  toAge: number
  /** Index of the single year in `ages`; -1 for a sum. */
  index: number
  phase: 'working' | 'retirement'
  sum: boolean
}

/**
 * The row the ledger and the diagram both show for a selection. A single age
 * that is not in the series falls back to the first retirement year.
 */
export function resolveLedgerSelection(
  series: readonly AnnualCashFlow[] | undefined,
  ages: readonly number[],
  retirementAge: number,
  selection: LedgerSelection | null
): ResolvedLedgerSelection | null {
  if (!series || series.length === 0 || ages.length === 0) return null
  const firstRetirementIndex = ages.findIndex((age) => age >= retirementAge)
  const defaultIndex = firstRetirementIndex >= 0 ? firstRetirementIndex : 0
  const phaseOf = (age: number) => (age < retirementAge ? 'working' : 'retirement')

  if (selection === 'retirement' && firstRetirementIndex >= 0) {
    const rows = series.slice(firstRetirementIndex, ages.length)
    const row = sumLedgerRows(rows)
    if (row) {
      return {
        row,
        fromAge: ages[firstRetirementIndex],
        toAge: ages[Math.min(ages.length, series.length) - 1],
        index: -1,
        phase: 'retirement',
        sum: true,
      }
    }
  }

  const found = typeof selection === 'number' ? ages.indexOf(selection) : -1
  const index = found >= 0 && found < series.length ? found : defaultIndex
  const age = ages[index]
  return {
    row: series[index],
    fromAge: age,
    toAge: age,
    index,
    phase: phaseOf(age),
    sum: false,
  }
}
