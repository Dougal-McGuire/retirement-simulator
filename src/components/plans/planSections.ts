/**
 * The five groups of the workspace's control column.
 *
 * One list drives everything that has to agree: the column's group headers,
 * the group a deep link opens, and the DOM ids tests and deep links rely on.
 */

/**
 * The four groups that hold plan assumptions — what an edit affordance on
 * the canvas can name (`openEditor({ panel })`).
 */
export type AssumptionPanel = 'person' | 'savings' | 'flows' | 'market'

/**
 * A group of the control column: the four assumption panels plus `rule`, the
 * withdrawal rule and its settings (the "cause" half of Entnahme).
 */
export type ColumnGroup = AssumptionPanel | 'rule'

/**
 * The column's groups, top to bottom. `bodyId` is the stable id of the body
 * the group renders (`plan-editor-*` for the four panels); `titleKey` is the
 * message under `workspace.column.groups`.
 */
export const COLUMN_GROUPS = [
  { id: 'person', bodyId: 'plan-editor-personal', titleKey: 'person' },
  { id: 'savings', bodyId: 'plan-editor-income', titleKey: 'savings' },
  { id: 'flows', bodyId: 'plan-editor-expenses', titleKey: 'flows' },
  { id: 'rule', bodyId: 'plan-editor-withdrawal', titleKey: 'rule' },
  { id: 'market', bodyId: 'plan-editor-market', titleKey: 'market' },
] as const satisfies readonly { id: ColumnGroup; bodyId: string; titleKey: string }[]

export const COLUMN_GROUP_IDS: readonly ColumnGroup[] = COLUMN_GROUPS.map((group) => group.id)

/** Open when nothing else says otherwise (no deep link, first visit). */
export const DEFAULT_OPEN_GROUPS: readonly ColumnGroup[] = ['person', 'flows']

export function isColumnGroup(value: unknown): value is ColumnGroup {
  return typeof value === 'string' && (COLUMN_GROUP_IDS as readonly string[]).includes(value)
}

/**
 * Which panel a field lives in, by its real DOM id. A closed group does not
 * mount its body, so a deep link ("edit retirement age") has to open the
 * right group before it can focus the field. `withdrawal` fields live in the
 * column's `rule` group.
 */
const FIELD_PANELS: Record<string, AssumptionPanel> = {
  'editor-currentAge': 'person',
  'editor-legalRetirementAge': 'person',
  'editor-retirementAge': 'person',
  'editor-endAge': 'person',
  'editor-currentAssets': 'savings',
  'editor-annualSavings': 'savings',
  'editor-annualSavingsGrowthRate': 'savings',
  'editor-averageROI': 'market',
  'editor-roiVolatility': 'market',
  'editor-averageInflation': 'market',
  'editor-inflationVolatility': 'market',
  'editor-simulationRuns': 'market',
  'editor-capitalGainsTax': 'market',
  'editor-taxAllowanceAnnual': 'market',
  'editor-equityFundExemption': 'market',
  'editor-pensionTaxablePortion': 'market',
  'editor-pensionTaxRate': 'market',
  'editor-bondReturn': 'market',
  'editor-bondVolatility': 'market',
  'editor-equityAllocationStart': 'market',
  'editor-equityAllocationEnd': 'market',
}

const PREFIX_PANELS: readonly [prefix: string, panel: AssumptionPanel | 'withdrawal'][] = [
  ['cashflow-', 'flows'],
  ['market-model-', 'market'],
  ['glide-path', 'market'],
  ['household-type-', 'market'],
  ['tax-', 'market'],
  ['planner-', 'withdrawal'],
  ['withdrawal-strategy-', 'withdrawal'],
]

export function panelForField(fieldId: string): AssumptionPanel | 'withdrawal' | undefined {
  if (Object.prototype.hasOwnProperty.call(FIELD_PANELS, fieldId)) return FIELD_PANELS[fieldId]
  return PREFIX_PANELS.find(([prefix]) => fieldId.startsWith(prefix))?.[1]
}
