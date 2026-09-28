import type { AnnualCashFlow } from '@/types'
import {
  isFlowCategory,
  ledgerParts,
  type CategoryBreakdown,
  type FlowBreakdown,
  type FlowBreakdownItem,
  type FlowCategory,
} from '@/lib/simulation/flowBreakdown'

export { ledgerParts, type LedgerParts } from '@/lib/simulation/flowBreakdown'

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
 *
 * **Drill-down.** A category that holds plan flows (pensions, other income,
 * one-off income, regular spending, scheduled expenses) can be *expanded*: its
 * node is replaced, in place, by one node per flow from the
 * {@link FlowBreakdown} — whose items add up to the booked category — so the
 * expanded diagram balances exactly like the overview. At most
 * {@link MAX_VISIBLE_ITEMS} nodes per category; the smallest fold into one
 * "more" node until the category is shown in full.
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

/** A category as booked, one of its flows, or the flows folded into "more". */
export type SankeyNodeKind = 'category' | 'item' | 'more'

export interface CashflowSankeyNode {
  /**
   * Category nodes: their {@link SankeyNodeId}. Items: `<category>:<flow id>`;
   * the folded rest: `<category>:more`.
   */
  id: string
  /** The category the node is (or belongs to). */
  category: SankeyNodeId
  kind: SankeyNodeKind
  column: SankeyColumn
  /** Euros through the node (sum of its links on either side). */
  value: number
  /** Whole euros for the label; a category's items add up to its rounded total. */
  rounded: number
  /** Spending nodes only: the part fed by the unfunded gap. */
  unfunded?: number
  /** Income items: the part that went to income tax. */
  tax?: number
  /** `item`: the flow's share of its category. */
  item?: FlowBreakdownItem
  /** `more`: the items it stands for. */
  folded?: FlowBreakdownItem[]
}

export interface CashflowSankeyLink {
  source: string
  target: string
  value: number
}

/** An expanded category, as drawn. */
export interface SankeyGroup {
  category: FlowCategory
  column: SankeyColumn
  /** Booked total of the category. */
  value: number
  /** Node ids of its items, in drawing order. */
  nodeIds: string[]
  /** True while the smallest items are folded into a "more" node. */
  folded: boolean
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
  /** Categories drawn as their items. */
  groups: SankeyGroup[]
  /** Categories in this row that can be expanded into items. */
  expandable: FlowCategory[]
}

/**
 * Amounts below this are left out of the drawing. Ledger rows are averages over
 * every simulated path, so a single path's rare shortfall shows up as cents;
 * drawing a hairline labelled "0 €" would say nothing. Matches the ledger's own
 * "rounded amounts may differ by a euro".
 */
export const SANKEY_MIN_AMOUNT = 0.5

/** Nodes per expanded category before the smallest fold into "more". */
export const MAX_VISIBLE_ITEMS = 6

/** How far a category is opened: its largest items, or every item. */
export type ExpansionMode = 'top' | 'all'
export type Expansion = Partial<Record<FlowCategory, ExpansionMode>>

export interface Drilldown {
  breakdown: FlowBreakdown
  expanded: Expansion
  maxItems?: number
}

const TAX_NODES: readonly string[] = ['incomeTax', 'capitalGainsTax']

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

export const itemNodeId = (category: FlowCategory, key: string) => `${category}:${key}`
export const moreNodeId = (category: FlowCategory) => `${category}:more`

/** The category a node id belongs to (itself for a category node). */
export const nodeCategory = (id: string): SankeyNodeId => id.split(':')[0] as SankeyNodeId

/**
 * Which items of a category get their own node: all of them when there are
 * few or the category is shown in full, else the largest `max - 1` and a
 * "more" node for the rest. Items too small to draw always fold.
 */
export function visibleItems(
  breakdown: CategoryBreakdown,
  mode: ExpansionMode,
  max = MAX_VISIBLE_ITEMS,
  minAmount = SANKEY_MIN_AMOUNT
): { shown: FlowBreakdownItem[]; folded: FlowBreakdownItem[] } {
  const drawable = breakdown.items.filter((item) => item.amount >= minAmount)
  const tiny = breakdown.items.filter((item) => item.amount < minAmount)
  if (mode === 'all' || drawable.length <= max) return { shown: drawable, folded: tiny }
  const keep = Math.max(1, max - 1)
  return { shown: drawable.slice(0, keep), folded: [...drawable.slice(keep), ...tiny] }
}

/** Categories of this breakdown that name at least one plan flow. */
function expandableCategories(breakdown: FlowBreakdown | undefined): FlowCategory[] {
  if (!breakdown) return []
  return (Object.values(breakdown.categories) as CategoryBreakdown[])
    .filter((entry) => entry.items.some((item) => item.flow !== null))
    .map((entry) => entry.category)
}

export function buildCashflowSankey(
  row: AnnualCashFlow,
  minAmount = SANKEY_MIN_AMOUNT,
  drilldown?: Drilldown
): CashflowSankeyModel {
  const parts = ledgerParts(row)
  const links: CashflowSankeyLink[] = []
  const add = (source: string, target: string, value: number) => {
    if (value >= minAmount) links.push({ source, target, value })
  }

  const expandable = expandableCategories(drilldown?.breakdown)
  const groups: SankeyGroup[] = []
  const itemNodes = new Map<string, Omit<CashflowSankeyNode, 'value'>>()
  /** The nodes a category is drawn as: itself, or its items and "more". */
  const expand = (
    category: SankeyNodeId
  ): { id: string; share: number; item?: FlowBreakdownItem; folded?: FlowBreakdownItem[] }[] => {
    const mode = isFlowCategory(category) ? drilldown?.expanded[category] : undefined
    const entry = isFlowCategory(category) ? drilldown?.breakdown.categories[category] : undefined
    if (!mode || !entry || !expandable.includes(entry.category) || !(entry.total > 0)) {
      return [{ id: category, share: 1 }]
    }
    const { shown, folded } = visibleItems(entry, mode, drilldown?.maxItems, minAmount)
    const nodes: {
      id: string
      share: number
      item?: FlowBreakdownItem
      folded?: FlowBreakdownItem[]
    }[] = shown.map((item) => ({
      id: itemNodeId(entry.category, item.key),
      share: item.share,
      item,
    }))
    const rest = folded.reduce((sum, item) => sum + item.amount, 0)
    if (folded.length > 0 && rest >= minAmount) {
      nodes.push({ id: moreNodeId(entry.category), share: rest / entry.total, folded })
    }
    for (const node of nodes) {
      itemNodes.set(node.id, {
        id: node.id,
        category,
        kind: node.item ? 'item' : 'more',
        column: COLUMN[category],
        rounded: node.item
          ? node.item.rounded
          : (node.folded ?? []).reduce((sum, item) => sum + item.rounded, 0),
        ...(node.item ? { item: node.item } : {}),
        ...(node.folded ? { folded: node.folded } : {}),
      })
    }
    groups.push({
      category: entry.category,
      column: COLUMN[category],
      value: entry.total,
      nodeIds: nodes.map((node) => node.id),
      folded: nodes.some((node) => node.id === moreNodeId(entry.category)),
    })
    return nodes
  }

  for (const income of parts.incomes) {
    const tax = Math.min(income.tax, income.gross)
    const drawn = expand(income.id)
    for (const node of drawn) {
      if (!node.item && !node.folded) {
        add(node.id, 'incomeTax', tax)
        add(node.id, 'available', income.gross - tax)
        continue
      }
      const members = node.item ? [node.item] : (node.folded ?? [])
      const amount = members.reduce((sum, item) => sum + item.amount, 0)
      const itemTax = Math.min(
        amount,
        members.reduce((sum, item) => sum + item.tax, 0)
      )
      const itemNode = itemNodes.get(node.id)
      if (itemNode) itemNode.tax = itemTax
      add(node.id, 'incomeTax', itemTax)
      add(node.id, 'available', amount - itemTax)
    }
  }
  add('savings', 'available', parts.savings)
  const saleTax = Math.min(parts.capitalGainsTax, parts.withdrawal)
  add('withdrawal', 'capitalGainsTax', saleTax)
  add('withdrawal', 'available', parts.withdrawal - saleTax)

  // The engine books one unfunded amount per year, not per expense; spread it
  // in proportion to what each part asked for rather than guessing an order.
  const requested = parts.expenses.reduce((sum, part) => sum + part.value, 0)
  const unfunded = new Map<string, number>()
  for (const part of parts.expenses) {
    const gap = requested > 0 ? (parts.shortfall * part.value) / requested : 0
    for (const node of expand(part.id)) {
      const members = node.item ? [node.item] : (node.folded ?? [])
      const value =
        node.item || node.folded ? members.reduce((sum, item) => sum + item.amount, 0) : part.value
      const share = part.value > 0 ? value / part.value : 0
      unfunded.set(node.id, gap * share)
      add('shortfall', node.id, gap * share)
      add('available', node.id, value - gap * share)
    }
  }
  add('available', 'reinvested', parts.reinvested)

  const inflow = new Map<string, number>()
  const outflow = new Map<string, number>()
  for (const link of links) {
    outflow.set(link.source, (outflow.get(link.source) ?? 0) + link.value)
    inflow.set(link.target, (inflow.get(link.target) ?? 0) + link.value)
  }

  const nodes: CashflowSankeyNode[] = []
  const pushNode = (base: Omit<CashflowSankeyNode, 'value'>) => {
    const value = Math.max(inflow.get(base.id) ?? 0, outflow.get(base.id) ?? 0)
    if (value <= 0) return
    const node: CashflowSankeyNode = { ...base, value }
    const gap = unfunded.get(base.id)
    if (gap !== undefined && gap >= minAmount) node.unfunded = gap
    nodes.push(node)
  }
  for (const id of NODE_ORDER) {
    const group = groups.find((entry) => entry.category === id)
    if (group) {
      for (const nodeId of group.nodeIds) {
        const base = itemNodes.get(nodeId)
        if (base) pushNode(base)
      }
      continue
    }
    pushNode({ id, category: id, kind: 'category', column: COLUMN[id], rounded: 0 })
  }
  for (const node of nodes) {
    if (node.kind === 'category') node.rounded = Math.round(node.value)
  }
  // A group whose items all fell below the threshold is not drawn.
  const drawnGroups = groups
    .map((group) => ({
      ...group,
      nodeIds: group.nodeIds.filter((id) => nodes.some((node) => node.id === id)),
    }))
    .filter((group) => group.nodeIds.length > 0)

  const totalIn = nodes
    .filter((node) => node.column === 0)
    .reduce((sum, node) => sum + node.value, 0)
  const terminal = nodes.filter((node) => !outflow.has(node.id))
  const totalOut = terminal.reduce((sum, node) => sum + node.value, 0)
  const taxes = nodes
    .filter((node) => TAX_NODES.includes(node.id))
    .reduce((sum, node) => sum + node.value, 0)

  return {
    nodes,
    links,
    totalIn,
    totalOut,
    taxes,
    groups: drawnGroups,
    expandable: expandable.filter((category) => nodes.some((node) => node.category === category)),
  }
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
