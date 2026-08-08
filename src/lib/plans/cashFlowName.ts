import type { CashFlow, CustomExpense } from '@/types'

/**
 * Translation keys the app's own seeded cash flows may carry in `nameKey`
 * (the eight expenses in `DEFAULT_PARAMS`).
 *
 * An allow-list rather than a free lookup: `nameKey` survives a round trip
 * through localStorage, so an old or hand-edited payload must not be able to
 * make the UI ask for an arbitrary message path.
 */
export const DEFAULT_CASH_FLOW_NAME_KEYS = [
  'health',
  'food',
  'entertainment',
  'shopping',
  'utilities',
  'vacations',
  'repairs',
  'carMaintenance',
  // Seeded only by the example plan (see `demoPlan.ts`).
  'demoPartTime',
  'demoInheritance',
  'demoRoof',
  'demoCare',
] as const

export type DefaultCashFlowNameKey = (typeof DEFAULT_CASH_FLOW_NAME_KEYS)[number]

export const isDefaultCashFlowNameKey = (value: unknown): value is DefaultCashFlowNameKey =>
  typeof value === 'string' && (DEFAULT_CASH_FLOW_NAME_KEYS as readonly string[]).includes(value)

/** German labels for the seeded flows, for consumers without `next-intl`. */
const DEFAULT_NAMES_DE: Record<DefaultCashFlowNameKey, string> = {
  health: 'Krankenversicherung',
  food: 'Lebensmittel',
  entertainment: 'Freizeit',
  shopping: 'Einkäufe',
  utilities: 'Nebenkosten',
  vacations: 'Urlaub',
  repairs: 'Instandhaltung Haus',
  carMaintenance: 'Auto-Unterhalt',
  demoPartTime: 'Teilzeit-Beratung',
  demoInheritance: 'Erbschaft',
  demoRoof: 'Dachsanierung',
  demoCare: 'Pflegekosten',
}

/** English labels, kept next to the German ones so the pair cannot drift. */
const DEFAULT_NAMES_EN: Record<DefaultCashFlowNameKey, string> = {
  health: 'Health insurance',
  food: 'Groceries',
  entertainment: 'Entertainment',
  shopping: 'Shopping',
  utilities: 'Utilities',
  vacations: 'Vacations',
  repairs: 'Home repairs',
  carMaintenance: 'Car maintenance',
  demoPartTime: 'Part-time consulting',
  demoInheritance: 'Inheritance',
  demoRoof: 'Roof renovation',
  demoCare: 'Care costs',
}

type NamedFlow = Pick<CashFlow, 'name' | 'nameKey'> | Pick<CustomExpense, 'name' | 'nameKey'>

/**
 * Display name for a cash flow: a flow the app seeded follows the UI language,
 * a flow the user named or renamed renders exactly what they typed.
 *
 * `translate` receives the bare key (e.g. `"food"`) and is expected to resolve
 * it under the caller's own namespace.
 */
export function cashFlowDisplayName(flow: NamedFlow, translate: (key: string) => string): string {
  if (isDefaultCashFlowNameKey(flow.nameKey)) return translate(flow.nameKey)
  return flow.name
}

/**
 * Same rule for consumers that have a locale string instead of a translator —
 * the report pipeline, which runs server-side without `next-intl` in scope.
 */
export function localizeCashFlowName(flow: NamedFlow, locale: string): string {
  if (!isDefaultCashFlowNameKey(flow.nameKey)) return flow.name
  return locale.startsWith('de') ? DEFAULT_NAMES_DE[flow.nameKey] : DEFAULT_NAMES_EN[flow.nameKey]
}
