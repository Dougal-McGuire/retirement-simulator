/**
 * The plan editor's five anchors, in document order.
 *
 * One list drives three things that have to agree: the sticky pill bar, the
 * collapse state stored per section, and the scroll spy that highlights the
 * pill you are actually looking at.
 */
export interface PlanSectionDef {
  /** DOM id of the `<section>`; also the key under which collapse state lives. */
  id: string
  /** Key under `planEditor.groups` supplying the pill label. */
  group: 'personal' | 'income' | 'cashFlows' | 'market' | 'withdrawal'
}

export const PLAN_SECTIONS: readonly PlanSectionDef[] = [
  { id: 'plan-editor-personal', group: 'personal' },
  { id: 'plan-editor-income', group: 'income' },
  { id: 'plan-editor-expenses', group: 'cashFlows' },
  { id: 'plan-editor-market', group: 'market' },
  { id: 'plan-editor-withdrawal', group: 'withdrawal' },
] as const

export const PLAN_SECTION_IDS = PLAN_SECTIONS.map((section) => section.id)

/**
 * Which pill to light up, given which sections currently cross the detection
 * band near the top of the viewport.
 *
 * Document order wins: when a short section and the tall one below it both
 * cross the band, the reader is looking at the top one. When nothing crosses it
 * (a gap between cards, or the very bottom of the page) the previous choice
 * stands rather than the bar flickering back to the first pill.
 */
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

  const overlap = ['[data-sticky-chrome="true"]', '[data-testid="plan-section-nav"]']
    .map((selector) => document.querySelector(selector))
    .reduce((deepest, node) => (node ? Math.max(deepest, pinnedBottom(node)) : deepest), 0)

  const top = window.scrollY + target.getBoundingClientRect().top - overlap - extraOffset
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

export function activeSectionId(
  ids: readonly string[],
  intersecting: ReadonlySet<string>,
  previous: string
): string {
  const first = ids.find((id) => intersecting.has(id))
  return first ?? previous
}
