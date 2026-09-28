import { isAssumptionPanel, type AssumptionPanel } from '@/components/plans/planSections'

/**
 * Navigation grammar of the one-page workspace. Pure helpers (no React), so
 * the rules that decide which section is "current" and what the URL says can
 * be unit-tested without a browser.
 */

export const WORKSPACE_SECTIONS = [
  'result',
  'assumptions',
  'cashflow',
  'withdrawal',
  'levers',
] as const
export type WorkspaceSectionId = (typeof WORKSPACE_SECTIONS)[number]

/** German spellings accepted on input only; the page always writes the English ids. */
export const HASH_ALIASES = {
  ergebnis: 'result',
  annahmen: 'assumptions',
  geldfluss: 'cashflow',
  entnahme: 'withdrawal',
  stellschrauben: 'levers',
  vergleich: 'compare',
} as const

export type WorkspaceHash =
  | { compare: true }
  | { compare: false; section: WorkspaceSectionId; panel?: AssumptionPanel }

export function isWorkspaceSection(value: unknown): value is WorkspaceSectionId {
  return typeof value === 'string' && (WORKSPACE_SECTIONS as readonly string[]).includes(value)
}

/**
 * Reads `#section`, `#section:panel` or `#compare` (German aliases accepted).
 * Returns `null` for anything that is not ours — `#main-content` (skip link),
 * `#navigation`, an empty hash — so callers leave the page alone.
 */
export function parseWorkspaceHash(hash: string): WorkspaceHash | null {
  let raw = hash.startsWith('#') ? hash.slice(1) : hash
  try {
    raw = decodeURIComponent(raw)
  } catch {
    return null
  }
  raw = raw.trim().toLowerCase()
  if (!raw) return null
  const [head, panel] = raw.split(':', 2)
  const section = (HASH_ALIASES as Record<string, string>)[head] ?? head
  if (section === 'compare') return { compare: true }
  if (!isWorkspaceSection(section)) return null
  return isAssumptionPanel(panel) ? { compare: false, section, panel } : { compare: false, section }
}

/** `#result`, `#cashflow:market`, `#compare`. */
export function formatWorkspaceHash(state: WorkspaceHash): string {
  if (state.compare) return '#compare'
  return state.panel ? `#${state.section}:${state.panel}` : `#${state.section}`
}

/**
 * The section being read: the last one whose top has passed the reading line
 * (a line 30 % down the unobstructed viewport). At the very bottom of the page
 * the last section wins even if it is too short to reach the line.
 */
export function pickActiveSection(
  tops: { id: WorkspaceSectionId; top: number }[],
  readingLine: number,
  atBottom: boolean
): WorkspaceSectionId {
  if (tops.length === 0) return WORKSPACE_SECTIONS[0]
  if (atBottom) return tops[tops.length - 1].id
  let active = tops[0].id
  for (const entry of tops) {
    if (entry.top <= readingLine) active = entry.id
    else break
  }
  return active
}

/**
 * Where a piece of pinned chrome ends at the top of the viewport once pinned.
 *
 * - Sticky: its CSS `top` plus its height, read from the style rather than the
 *   live rect because the bars are usually not pinned yet when a jump starts.
 * - Fixed: it never moves, so the live rect is the pinned one. Chrome fixed to
 *   the bottom (the phone section bar) does not cover anything at the top.
 *   (`getComputedStyle().top` resolves `auto` to pixels for fixed elements, so
 *   the rect is the only reliable way to tell top from bottom chrome.)
 *
 * Chrome that sits beside `target` (the desktop rail) does not cover it and
 * counts as 0.
 */
export function pinnedBottom(node: Element, target?: DOMRect): number {
  const style = window.getComputedStyle(node)
  if (style.position !== 'sticky' && style.position !== 'fixed') return 0
  const rect = node.getBoundingClientRect()
  if (rect.height === 0 || rect.width === 0) return 0
  if (target && (rect.right <= target.left || rect.left >= target.right)) return 0
  if (style.position === 'fixed') {
    return rect.top < window.innerHeight / 2 ? Math.max(0, rect.bottom) : 0
  }
  const top = parseFloat(style.top)
  if (!Number.isFinite(top)) return 0
  return top + rect.height
}

/** Bottom edge of all chrome pinned over `target` (the result bar, the tablet chip row). */
export function stickyOverlap(target?: DOMRect): number {
  if (typeof document === 'undefined') return 0
  return Array.from(document.querySelectorAll('[data-sticky-chrome="true"]')).reduce(
    (deepest, node) => Math.max(deepest, pinnedBottom(node, target)),
    0
  )
}

/**
 * Scrolls `el`'s top to just under whatever is pinned at the top of the
 * viewport. `scrollIntoView` cannot do this: it ignores sticky chrome, and
 * centring a tall section parks its heading off screen.
 */
export function scrollToElement(
  el: HTMLElement,
  opts: { behavior?: ScrollBehavior; extraOffset?: number } = {}
): void {
  if (typeof window === 'undefined') return
  const { extraOffset = 16 } = opts
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const behavior = reduce ? 'auto' : (opts.behavior ?? 'smooth')
  const rect = el.getBoundingClientRect()
  const top = window.scrollY + rect.top - stickyOverlap(rect) - extraOffset
  window.scrollTo({ top: Math.max(0, top), behavior })
}
