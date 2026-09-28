import type { SimulationParams } from '@/types'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import {
  applyCashFlows,
  buildCashFlowSeries,
  cashFlowSignature,
  enabledCashFlows,
  isCashFlowEnabled,
  withCashFlowEnabled,
  isLifetimeExpenseFlow,
  isOnceIncomeFlow,
  isPensionFlow,
  pensionMonthlyAtAge,
} from '@/lib/simulation/cashFlows'

/**
 * Assumption diffing for plan comparison.
 *
 * Outcomes (success rate, median assets…) only mean something next to the
 * assumptions that produced them, so the comparison surfaces both. Everything
 * here is pure: rows carry raw values plus the unit they should be rendered
 * in, and the UI decides how to format them for the active locale.
 */

export type AssumptionGroupKey =
  | 'timeline'
  | 'income'
  | 'spending'
  | 'market'
  | 'tax'
  | 'strategy'
  | 'goals'

export type AssumptionKind =
  | 'age'
  | 'years'
  | 'currency'
  | 'rate'
  | 'percentPoints'
  | 'count'
  | 'strategy'
  | 'marketModel'
  | 'toggle'
  | 'householdType'
  /** A flow's switch: values are `FlowSwitchState`s. */
  | 'flowSwitch'

export interface AssumptionRow {
  /** Translation key suffix under `plans.comparison.assumptions.rows`. */
  key: string
  group: AssumptionGroupKey
  kind: AssumptionKind
  /** One entry per compared plan, in the order the plans were passed in. */
  values: Array<number | string>
  /** True when at least one plan disagrees with the others. */
  differs: boolean
}

export interface AssumptionGroup {
  key: AssumptionGroupKey
  rows: AssumptionRow[]
}

const groupOrder: AssumptionGroupKey[] = [
  'timeline',
  'income',
  'spending',
  'market',
  'tax',
  'strategy',
  'goals',
]

/** Rates are stored as fractions; compare them with a tolerance to avoid float noise. */
const EPSILON = 1e-9

const valuesDiffer = (values: Array<number | string>): boolean =>
  values.some((value) => {
    const first = values[0]
    if (typeof value === 'number' && typeof first === 'number') {
      return Math.abs(value - first) > EPSILON
    }
    return value !== first
  })

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

/**
 * Lifetime totals, in today's euros, of everything the two legacy arrays cannot
 * express: windowed or one-off flows, and anything with its own growth or a
 * fixed nominal amount. Lifetime living costs stay in the spending rows above
 * and one-off income keeps its own row, so nothing is counted twice.
 */
function scheduledTotals(params: SimulationParams): { income: number; expense: number } {
  const series = buildCashFlowSeries(
    // Pensions have their own row; here only the windowed extras count.
    (params.cashFlows ?? []).filter((flow) => !isPensionFlow(flow)),
    params.currentAge,
    Math.max(params.currentAge, params.endAge)
  )
  return {
    income: sum(series.incomeLinked) + sum(series.incomeFixed),
    expense: sum(series.expenseLinked) + sum(series.expenseFixed),
  }
}

/** How many (switched-on) flows are scheduled rather than lifetime-recurring. */
function countScheduledFlows(params: SimulationParams): number {
  return enabledCashFlows(params.cashFlows).filter(
    (flow) => !isLifetimeExpenseFlow(flow) && !isOnceIncomeFlow(flow) && !isPensionFlow(flow)
  ).length
}

/** Where a flow stands in one compared plan. */
export type FlowSwitchState = 'on' | 'off' | 'absent'

export interface FlowSwitchRow {
  /** The flow id the plans share (a duplicated plan keeps its flows' ids). */
  id: string
  /** Name and key from the first plan that has the flow, for display. */
  name: string
  nameKey?: string
  /** One entry per compared plan, in the order the plans were passed in. */
  values: FlowSwitchState[]
}

/**
 * Flows that are switched off in at least one compared plan and switched on
 * in another — "Erbschaft: berücksichtigt → ausgeschaltet". Matched by id,
 * because a scenario is normally a copy of its plan with one switch flipped.
 *
 * Only a real on/off difference makes a row: a flow off in every plan that
 * has it describes no difference, and a flow that exists in one plan only
 * already moves the amount rows.
 */
export function buildFlowSwitchRows(paramsList: SimulationParams[]): FlowSwitchRow[] {
  const rows: FlowSwitchRow[] = []
  const seen = new Set<string>()
  for (const params of paramsList) {
    for (const flow of params.cashFlows ?? []) {
      if (seen.has(flow.id)) continue
      seen.add(flow.id)
      const values = paramsList.map((other): FlowSwitchState => {
        const match = (other.cashFlows ?? []).find((entry) => entry.id === flow.id)
        if (!match) return 'absent'
        return isCashFlowEnabled(match) ? 'on' : 'off'
      })
      if (!values.includes('on') || !values.includes('off')) continue
      rows.push({
        id: flow.id,
        name: flow.name,
        ...(flow.nameKey !== undefined ? { nameKey: flow.nameKey } : {}),
        values,
      })
    }
  }
  return rows
}

interface RowSpec {
  key: string
  group: AssumptionGroupKey
  kind: AssumptionKind
  read: (params: SimulationParams) => number | string
  /** Row is dropped when it adds no information (e.g. all zero and identical). */
  optional?: boolean
  /**
   * Follows from another row (bridge years from the two ages, annual spending
   * from monthly). Shown in the full table, left out of the short change list
   * so a single edit does not read as three.
   */
  derived?: boolean
}

const rowSpecs: RowSpec[] = [
  { key: 'currentAge', group: 'timeline', kind: 'age', read: (p) => p.currentAge },
  { key: 'retirementAge', group: 'timeline', kind: 'age', read: (p) => p.retirementAge },
  { key: 'legalRetirementAge', group: 'timeline', kind: 'age', read: (p) => p.legalRetirementAge },
  { key: 'endAge', group: 'timeline', kind: 'age', read: (p) => p.endAge },
  {
    key: 'bridgeYears',
    group: 'timeline',
    kind: 'years',
    read: (p) => Math.max(0, p.legalRetirementAge - p.retirementAge),
    optional: true,
    derived: true,
  },

  { key: 'currentAssets', group: 'income', kind: 'currency', read: (p) => p.currentAssets },
  { key: 'annualSavings', group: 'income', kind: 'currency', read: (p) => p.annualSavings },
  {
    key: 'annualSavingsGrowthRate',
    group: 'income',
    kind: 'rate',
    read: (p) => p.annualSavingsGrowthRate,
    optional: true,
  },
  {
    key: 'monthlyPension',
    group: 'income',
    kind: 'currency',
    // Every pension paying out at the statutory age, so a second pension in
    // one plan shows up as the difference it is.
    read: (p) =>
      pensionMonthlyAtAge(p.cashFlows ?? [], p.legalRetirementAge, p.legalRetirementAge).total,
  },
  {
    key: 'oneTimeIncomes',
    group: 'income',
    kind: 'currency',
    read: (p) => (p.oneTimeIncomes ?? []).reduce((sum, income) => sum + income.amount, 0),
    optional: true,
  },

  {
    key: 'scheduledIncome',
    group: 'income',
    kind: 'currency',
    read: (p) => scheduledTotals(p).income,
    optional: true,
  },

  {
    key: 'monthlySpending',
    group: 'spending',
    kind: 'currency',
    read: (p) => calculateCombinedExpenses(p.customExpenses).combinedMonthly,
  },
  {
    key: 'annualSpending',
    group: 'spending',
    kind: 'currency',
    read: (p) => calculateCombinedExpenses(p.customExpenses).combinedAnnual,
    derived: true,
  },
  {
    key: 'expenseItems',
    group: 'spending',
    kind: 'count',
    read: (p) => (p.customExpenses ?? []).length,
    optional: true,
    derived: true,
  },
  {
    key: 'scheduledExpenses',
    group: 'spending',
    kind: 'currency',
    read: (p) => scheduledTotals(p).expense,
    optional: true,
  },
  {
    key: 'scheduledItems',
    group: 'spending',
    kind: 'count',
    read: (p) => countScheduledFlows(p),
    optional: true,
    derived: true,
  },

  { key: 'averageROI', group: 'market', kind: 'rate', read: (p) => p.averageROI },
  { key: 'roiVolatility', group: 'market', kind: 'rate', read: (p) => p.roiVolatility },
  { key: 'averageInflation', group: 'market', kind: 'rate', read: (p) => p.averageInflation },
  {
    key: 'inflationVolatility',
    group: 'market',
    kind: 'rate',
    read: (p) => p.inflationVolatility,
    optional: true,
  },
  { key: 'marketModel', group: 'market', kind: 'marketModel', read: (p) => p.marketModel },
  {
    key: 'glidePathEnabled',
    group: 'market',
    kind: 'toggle',
    read: (p) => (p.glidePathEnabled ? 'on' : 'off'),
  },
  {
    key: 'equityAllocationStart',
    group: 'market',
    kind: 'rate',
    read: (p) => p.equityAllocationStart,
  },
  {
    key: 'equityAllocationEnd',
    group: 'market',
    kind: 'rate',
    read: (p) => p.equityAllocationEnd,
  },
  { key: 'bondReturn', group: 'market', kind: 'rate', read: (p) => p.bondReturn },
  { key: 'bondVolatility', group: 'market', kind: 'rate', read: (p) => p.bondVolatility },

  // German taxation. Kept in its own group: five rows about Abgeltungsteuer
  // buried between volatility and the withdrawal rule is how nobody notices
  // that one plan is taxed as a couple.
  {
    key: 'capitalGainsTax',
    group: 'tax',
    kind: 'percentPoints',
    read: (p) => p.capitalGainsTax,
  },
  {
    key: 'taxAllowanceAnnual',
    group: 'tax',
    kind: 'currency',
    // The doubled figure, because that is the number the engine shelters with.
    read: (p) => (p.householdType === 'couple' ? p.taxAllowanceAnnual * 2 : p.taxAllowanceAnnual),
  },
  {
    key: 'householdType',
    group: 'tax',
    kind: 'householdType',
    read: (p) => p.householdType,
  },
  {
    key: 'equityFundExemption',
    group: 'tax',
    kind: 'rate',
    read: (p) => p.equityFundExemption,
  },
  {
    key: 'pensionTaxablePortion',
    group: 'tax',
    kind: 'rate',
    read: (p) => p.pensionTaxablePortion,
  },
  {
    key: 'pensionTaxRate',
    group: 'tax',
    kind: 'rate',
    read: (p) => p.pensionTaxRate,
  },

  {
    key: 'withdrawalStrategy',
    group: 'strategy',
    kind: 'strategy',
    read: (p) => p.withdrawalStrategy,
  },
  {
    key: 'dsWithdrawalRate',
    group: 'strategy',
    kind: 'rate',
    read: (p) => p.dsWithdrawalRate,
    optional: true,
  },
  {
    key: 'dsCeilingRate',
    group: 'strategy',
    kind: 'rate',
    read: (p) => p.dsCeilingRate,
    optional: true,
  },
  {
    key: 'dsFloorRate',
    group: 'strategy',
    kind: 'rate',
    read: (p) => p.dsFloorRate,
    optional: true,
  },
  {
    key: 'spendingFloorReal',
    group: 'strategy',
    kind: 'currency',
    read: (p) => p.spendingFloorReal,
    optional: true,
  },

  // Only shown once someone actually wants to leave something behind: a row
  // reading "€0" would suggest the plan has a goal it does not have.
  {
    key: 'legacyTargetReal',
    group: 'goals',
    kind: 'currency',
    read: (p) => p.legacyTargetReal,
    optional: true,
  },
]

/**
 * Which strategies actually read a given parameter row.
 *
 * A "DS ceiling" row next to two Guyton-Klinger plans is not just noise, it is
 * a lie: the engine never looks at that number for those plans. Every strategy
 * parameter therefore declares its readers, and the row only appears when one
 * of the compared plans runs such a strategy.
 */
const strategyRowReaders: Record<string, ReadonlySet<SimulationParams['withdrawalStrategy']>> = {
  dsWithdrawalRate: new Set(['vanguardDynamic', 'guytonKlinger', 'percentOfPortfolio']),
  dsCeilingRate: new Set(['vanguardDynamic']),
  dsFloorRate: new Set(['vanguardDynamic']),
  spendingFloorReal: new Set(['percentOfPortfolio']),
}

/** Rows that mean nothing unless at least one compared plan draws a pension. */
const pensionTaxRowKeys = new Set(['pensionTaxablePortion', 'pensionTaxRate'])

/** Rows that are noise unless at least one compared plan runs a glide path. */
const glidePathRowKeys = new Set([
  'glidePathEnabled',
  'equityAllocationStart',
  'equityAllocationEnd',
  'bondReturn',
  'bondVolatility',
])

const isEmptyRow = (spec: RowSpec, values: Array<number | string>, differs: boolean) => {
  if (!spec.optional || differs) return false
  return values.every((value) => typeof value === 'number' && Math.abs(value) <= EPSILON)
}

/**
 * Builds the side-by-side assumption rows for 1–3 plans.
 *
 * Rows keep their canonical order; `differs` marks the ones worth highlighting.
 */
export function buildAssumptionRows(paramsList: SimulationParams[]): AssumptionRow[] {
  if (paramsList.length === 0) return []

  const strategiesInPlay = new Set(paramsList.map((params) => params.withdrawalStrategy))
  const rowIsRead = (key: string) => {
    const readers = strategyRowReaders[key]
    if (!readers) return true
    return [...strategiesInPlay].some((strategy) => readers.has(strategy))
  }
  // The allocation rows only mean something once a plan actually blends two
  // assets; otherwise they are four constants nobody set.
  const usesGlidePath = paramsList.some((params) => params.glidePathEnabled)
  // Same for the market model: naming it is only interesting once a plan has
  // left the default Monte Carlo behind.
  const usesHistory = paramsList.some((params) => params.marketModel === 'historical')
  // Pension taxation is only a fact about plans that have a pension.
  const hasPension = paramsList.some(
    (params) =>
      pensionMonthlyAtAge(
        params.cashFlows ?? [],
        params.legalRetirementAge,
        params.legalRetirementAge
      ).total > 0
  )

  return rowSpecs
    .filter((spec) => (spec.key === 'marketModel' ? usesHistory : true))
    .filter((spec) => rowIsRead(spec.key))
    .filter((spec) => (glidePathRowKeys.has(spec.key) ? usesGlidePath : true))
    .filter((spec) => (pensionTaxRowKeys.has(spec.key) ? hasPension : true))
    .map((spec) => {
      const values = paramsList.map((params) => spec.read(params))
      const differs = valuesDiffer(values)
      return {
        spec,
        row: { key: spec.key, group: spec.group, kind: spec.kind, values, differs },
      }
    })
    .filter(({ spec, row }) => !isEmptyRow(spec, row.values, row.differs))
    .map(({ row }) => row)
}

/** Same rows, bucketed into display groups (empty groups removed). */
export function buildAssumptionGroups(paramsList: SimulationParams[]): AssumptionGroup[] {
  const rows = buildAssumptionRows(paramsList)
  return groupOrder
    .map((key) => ({ key, rows: rows.filter((row) => row.group === key) }))
    .filter((group) => group.rows.length > 0)
}

export interface AssumptionChange {
  key: string
  kind: AssumptionKind
  from: number | string
  to: number | string
  /**
   * Set for a flow-switch change: the row is labelled with the flow's own
   * name (localized by the UI through `nameKey`) instead of a row key.
   */
  flow?: { name: string; nameKey?: string }
}

/**
 * The parameters a derived plan actually changes, most-structural first.
 *
 * Used by the stress-lever dialog to explain in one glance what the new plan
 * will differ in ("Annual savings €48,000 → €52,800").
 */
export function diffParams(
  base: SimulationParams,
  next: SimulationParams,
  limit = 3
): AssumptionChange[] {
  const primaryKeys = new Set(rowSpecs.filter((spec) => !spec.derived).map((spec) => spec.key))

  return buildAssumptionRows([base, next])
    .filter((row) => row.differs && primaryKeys.has(row.key))
    .map((row) => ({ key: row.key, kind: row.kind, from: row.values[0], to: row.values[1] }))
    .slice(0, limit)
}

/**
 * Stable signature of everything that changes a comparison result.
 *
 * `simulationRuns` is deliberately excluded: the comparison clamps the run
 * count itself, so a plan whose run count moved is not stale.
 */
export function comparisonFingerprint(params: SimulationParams): string {
  const rows = buildAssumptionRows([params]).map((row) => `${row.key}:${row.values[0]}`)
  const expenses = (params.customExpenses ?? [])
    .map((expense) => `${expense.id}|${expense.amount}|${expense.interval}`)
    .join(',')
  const incomes = (params.oneTimeIncomes ?? [])
    .map((income) => `${income.age}|${income.amount}`)
    .join(',')
  // Order-independent: reordering the cash-flow list is not a model change.
  const flows = cashFlowSignature(params.cashFlows ?? []).join(',')

  return `${rows.join(';')}#${expenses}#${incomes}#${flows}`
}

/**
 * The switch flips between a saved plan and a changed copy of it, as changes
 * ("Erbschaft: berücksichtigt → ausgeschaltet"), in the copy's list order.
 */
export function diffFlowSwitches(
  base: SimulationParams,
  next: SimulationParams
): AssumptionChange[] {
  return buildFlowSwitchRows([base, next])
    .filter((row) => row.values[0] !== 'absent' && row.values[1] !== 'absent')
    .map((row) => ({
      key: `flow:${row.id}`,
      kind: 'flowSwitch' as const,
      from: row.values[0],
      to: row.values[1],
      flow: { name: row.name, ...(row.nameKey !== undefined ? { nameKey: row.nameKey } : {}) },
    }))
}

/**
 * `base` with every flow switched as in `next` — what is left to diff once the
 * switches are named on their own, so a switched-off inheritance is not also
 * reported as "Einmalzahlungen 100.000 € → 0 €".
 */
export function withSwitchesOf(base: SimulationParams, next: SimulationParams): SimulationParams {
  const nextState = new Map(
    (next.cashFlows ?? []).map((flow) => [flow.id, isCashFlowEnabled(flow)])
  )
  return applyCashFlows({
    ...base,
    cashFlows: (base.cashFlows ?? []).map((flow) => {
      const enabled = nextState.get(flow.id)
      return enabled === undefined || enabled === isCashFlowEnabled(flow)
        ? flow
        : withCashFlowEnabled(flow, enabled)
    }),
  })
}
