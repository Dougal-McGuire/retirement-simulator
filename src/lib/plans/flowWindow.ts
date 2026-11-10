import type { CashFlow, SimulationParams } from '@/types'

/**
 * When a cash flow pays: the one reading of a flow's window that every list,
 * card and comparison shows ("Ab Alter 67", "Alter 80–90", "Mit 62").
 *
 * Only two defaults are resolved, the two the engine resolves the same way
 * for every plan: a pension without a start age pays from the plan's
 * statutory retirement age, and a single payment without one falls at the
 * current age. An unset end (or an unset start of any other flow) stays
 * unset — "Gesamter Plan", "Bis Alter 75" — so the same flow reads the same
 * in two plans with a different horizon.
 */
export type FlowWindow =
  | { type: 'at'; age: number; date?: string }
  | { type: 'range'; from: number; to: number }
  | { type: 'from'; age: number }
  | { type: 'until'; age: number }
  | { type: 'lifetime' }

export type FlowWindowContext = Pick<SimulationParams, 'currentAge' | 'legalRetirementAge'>

type WindowedFlow = Pick<CashFlow, 'kind' | 'frequency' | 'startAge' | 'endAge' | 'startDate'>

export function flowWindow(flow: WindowedFlow, context: FlowWindowContext): FlowWindow {
  if (flow.frequency === 'once') {
    const age = flow.startAge ?? context.currentAge
    return flow.startDate ? { type: 'at', age, date: flow.startDate } : { type: 'at', age }
  }
  const from = flow.startAge ?? (flow.kind === 'pension' ? context.legalRetirementAge : undefined)
  if (from !== undefined && flow.endAge !== undefined) {
    return { type: 'range', from, to: flow.endAge }
  }
  if (from !== undefined) return { type: 'from', age: from }
  if (flow.endAge !== undefined) return { type: 'until', age: flow.endAge }
  return { type: 'lifetime' }
}

/**
 * Equal for two flows exactly when {@link flowWindowLabel} reads the same for
 * both — what a comparison may call "the same window".
 */
export function flowWindowKey(flow: WindowedFlow, context: FlowWindowContext): string {
  const window = flowWindow(flow, context)
  switch (window.type) {
    case 'at':
      return `at:${window.age}:${window.date ?? ''}`
    case 'range':
      return `range:${window.from}:${window.to}`
    case 'from':
    case 'until':
      return `${window.type}:${window.age}`
    case 'lifetime':
      return 'lifetime'
  }
}

/** Messages under `setup.cashFlows` the label is built from. */
export type FlowWindowMessage =
  | 'window.lifetime'
  | 'window.range'
  | 'window.from'
  | 'window.until'
  | 'window.at'
  | 'window.atDate'

/**
 * A translator scoped to `setup.cashFlows` — `useTranslations('setup.cashFlows')`
 * in a component, or any function resolving the same keys.
 */
export type FlowWindowTranslator = (
  key: FlowWindowMessage,
  values: Record<string, string | number>
) => string

export interface FlowWindowLabelOptions {
  /**
   * Formats a payment month (`YYYY-MM`), e.g. "Mai 2031". Without it a single
   * payment reads by age alone.
   */
  formatMonth?: (month: string) => string
}

/**
 * A `formatMonth` from a date formatter (next-intl's `useFormatter()`):
 * "2031-05" -> "Mai 2031" / "May 2031".
 */
export function monthFormatter(format: {
  dateTime: (value: Date, options: { month: 'short'; year: 'numeric' }) => string
}): (month: string) => string {
  return (value) => {
    const [year, month] = value.split('-').map(Number)
    return format.dateTime(new Date(year, month - 1, 1), { month: 'short', year: 'numeric' })
  }
}

/** The window as the UI writes it, in whatever language `t` speaks. */
export function flowWindowLabel(
  flow: WindowedFlow,
  context: FlowWindowContext,
  t: FlowWindowTranslator,
  options: FlowWindowLabelOptions = {}
): string {
  const window = flowWindow(flow, context)
  switch (window.type) {
    case 'at':
      return window.date && options.formatMonth
        ? t('window.atDate', { date: options.formatMonth(window.date), age: window.age })
        : t('window.at', { age: window.age })
    case 'range':
      return t('window.range', { from: window.from, to: window.to })
    case 'from':
      return t('window.from', { age: window.age })
    case 'until':
      return t('window.until', { age: window.age })
    case 'lifetime':
      return t('window.lifetime', {})
  }
}
