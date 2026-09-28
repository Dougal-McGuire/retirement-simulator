/**
 * The four assumption panels of the workspace, in walking order.
 *
 * One list drives everything that has to agree: the Annahmen cards, the edit
 * panel's previous/next footer, the panel a deep link opens, and the DOM ids
 * tests and deep links rely on.
 */
export type AssumptionPanel = 'person' | 'savings' | 'flows' | 'market'

export const ASSUMPTION_PANELS = [
  { id: 'person', bodyId: 'plan-editor-personal', messageKey: 'personal' },
  { id: 'savings', bodyId: 'plan-editor-income', messageKey: 'income' },
  { id: 'flows', bodyId: 'plan-editor-expenses', messageKey: 'cashFlows' },
  { id: 'market', bodyId: 'plan-editor-market', messageKey: 'market' },
] as const // messageKey → planEditor.groups.<key>.{title,description}

export type AssumptionPanelDef = (typeof ASSUMPTION_PANELS)[number]
export type AssumptionPanelMessageKey = AssumptionPanelDef['messageKey']

export const ASSUMPTION_PANEL_IDS: readonly AssumptionPanel[] = ASSUMPTION_PANELS.map(
  (panel) => panel.id
)

export function isAssumptionPanel(value: unknown): value is AssumptionPanel {
  return typeof value === 'string' && (ASSUMPTION_PANEL_IDS as readonly string[]).includes(value)
}

/** The definition (body id, message key) of one panel. */
export function assumptionPanel(panel: AssumptionPanel): AssumptionPanelDef {
  return ASSUMPTION_PANELS.find((entry) => entry.id === panel) ?? ASSUMPTION_PANELS[0]
}

/** The panels before and after `panel`, for the footer that walks them. No wrap-around. */
export function adjacentPanels(panel: AssumptionPanel): {
  previous?: AssumptionPanel
  next?: AssumptionPanel
} {
  const index = ASSUMPTION_PANEL_IDS.indexOf(panel)
  return {
    previous: index > 0 ? ASSUMPTION_PANEL_IDS[index - 1] : undefined,
    next:
      index >= 0 && index < ASSUMPTION_PANEL_IDS.length - 1
        ? ASSUMPTION_PANEL_IDS[index + 1]
        : undefined,
  }
}

/**
 * Which panel a field lives in, by its real DOM id. Panels mount one at a
 * time, so a deep link ("edit retirement age") has to open the right panel
 * before it can focus the field. `withdrawal` fields live in the Entnahme
 * section, which is edited inline rather than in a panel.
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
