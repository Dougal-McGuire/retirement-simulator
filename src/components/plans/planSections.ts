/**
 * The plan editor's five sections, in navigation order.
 *
 * One list drives everything that has to agree: the section switcher, the
 * section a dashboard shortcut lands on, and the previous/next footer.
 */
export type PlanSectionGroup = 'personal' | 'income' | 'cashFlows' | 'market' | 'withdrawal'

export interface PlanSectionDef {
  /** DOM id of the `<section>` — stable, so tests and deep links can find it. */
  id: string
  /** Key under `planEditor.groups` supplying the label. */
  group: PlanSectionGroup
}

export const PLAN_SECTIONS: readonly PlanSectionDef[] = [
  { id: 'plan-editor-personal', group: 'personal' },
  { id: 'plan-editor-income', group: 'income' },
  { id: 'plan-editor-expenses', group: 'cashFlows' },
  { id: 'plan-editor-market', group: 'market' },
  { id: 'plan-editor-withdrawal', group: 'withdrawal' },
] as const

export const PLAN_SECTION_GROUPS: readonly PlanSectionGroup[] = PLAN_SECTIONS.map(
  (section) => section.group
)

export const DEFAULT_PLAN_SECTION: PlanSectionGroup = 'personal'

export function isPlanSectionGroup(value: unknown): value is PlanSectionGroup {
  return typeof value === 'string' && (PLAN_SECTION_GROUPS as readonly string[]).includes(value)
}

/** The sections before and after `group`, for the footer that walks the plan. */
export function adjacentSections(group: PlanSectionGroup): {
  previous?: PlanSectionGroup
  next?: PlanSectionGroup
} {
  const index = PLAN_SECTION_GROUPS.indexOf(group)
  return {
    previous: index > 0 ? PLAN_SECTION_GROUPS[index - 1] : undefined,
    next:
      index >= 0 && index < PLAN_SECTION_GROUPS.length - 1
        ? PLAN_SECTION_GROUPS[index + 1]
        : undefined,
  }
}

/**
 * Which section a field lives on. Sections mount one at a time, so a shortcut
 * from a dashboard card ("edit retirement age") has to open the right page
 * before it can focus the field.
 */
const FIELD_SECTIONS: Record<string, PlanSectionGroup> = {
  'editor-currentAge': 'personal',
  'editor-legalRetirementAge': 'personal',
  'editor-retirementAge': 'personal',
  'editor-endAge': 'personal',
  'editor-currentAssets': 'income',
  'editor-annualSavings': 'income',
  'editor-annualSavingsGrowthRate': 'income',
  'editor-averageROI': 'market',
  'editor-roiVolatility': 'market',
  'editor-averageInflation': 'market',
  'editor-inflationVolatility': 'market',
  'editor-simulationRuns': 'market',
  'editor-capitalGainsTax': 'market',
  'editor-taxAllowance': 'market',
  'editor-partialExemption': 'market',
}

export function sectionForField(fieldId: string): PlanSectionGroup | undefined {
  if (fieldId in FIELD_SECTIONS) return FIELD_SECTIONS[fieldId]
  if (fieldId.startsWith('planner-')) return 'withdrawal'
  if (fieldId.startsWith('cashflow-')) return 'cashFlows'
  if (fieldId.startsWith('glide-path') || fieldId.startsWith('tax-')) return 'market'
  return undefined
}

/**
 * Scrolls a plan section's *header* to just under whatever is sticky at the top
 * of the viewport.
 *
 * `scrollIntoView({block: 'center'})` is wrong for these cards: the withdrawal
 * planner is taller than the viewport, so centring it parks its title off
 * screen and the jump looks like it landed nowhere.
 */
export function scrollToPlanSection(id: string, extraOffset = 12): void {
  if (typeof document === 'undefined') return
  const target = document.getElementById(id)
  if (!target) return

  /**
   * Where a sticky element's lower edge ends up once it is pinned — its CSS
   * `top` plus its height. Read from the style rather than from the current
   * rect because the bars are usually *not* pinned yet at the moment of the
   * click, and their live position would understate the overlap.
   */
  const pinnedBottom = (node: Element): number => {
    const style = window.getComputedStyle(node)
    if (style.position !== 'sticky' && style.position !== 'fixed') return 0
    const rect = node.getBoundingClientRect()
    if (rect.height === 0) return 0
    return (parseFloat(style.top) || 0) + rect.height
  }

  const overlap = ['[data-sticky-chrome="true"]']
    .map((selector) => document.querySelector(selector))
    .reduce((deepest, node) => (node ? Math.max(deepest, pinnedBottom(node)) : deepest), 0)

  const top = window.scrollY + target.getBoundingClientRect().top - overlap - extraOffset
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}
