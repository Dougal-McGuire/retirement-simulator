'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { ColumnGroup } from '@/components/plans/planSections'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import type { ScrollToSectionOptions } from './WorkspaceProvider'
import {
  groupForTarget,
  parseWorkspaceHash,
  scrollDistanceToElement,
  type WorkspaceHash,
  type WorkspaceSectionId,
} from './workspaceNav'

export interface WorkspaceHashApi {
  /** The hash the page itself last wrote; events for it are ours and ignored. */
  lastHashRef: RefObject<string>
  isComparing: () => boolean
  scrollToSection: (id: WorkspaceSectionId, opts?: ScrollToSectionOptions) => void
  /**
   * The column part of a hash: `named` is the group after the colon (opened,
   * shown and focused; it stays in the URL), `implied` the one a bare section
   * opens beside it (`#withdrawal` → the rule), without moving focus.
   */
  applyGroup: (named: ColumnGroup | undefined, implied: ColumnGroup | undefined) => void
  /** `#assumptions`: unfolds the column and focuses it. */
  focusColumn: () => void
  /**
   * Enters compare without pushing (the URL already says `#compare`):
   * `landing` on load, `history` when Back/Forward or an edited URL reached a
   * `#compare` entry (its exit then steps Back instead of rewriting it).
   */
  enterCompare: (source: 'landing' | 'history') => void
  /** Leaves compare after the URL moved off `#compare` (Back, or an edited URL). */
  finishExitCompare: () => void
}

/** How long a landing section is held in view while the page above it settles. */
const HOLD_MS = 5000

const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * Re-applies `scroll` whenever the page's height changes, until the reader
 * scrolls or clicks themselves, the URL navigates elsewhere, or `HOLD_MS`
 * passes.
 *
 * A hash landing scrolls once, but sections above the target keep growing
 * after that — results arrive, charts mount — which pushes the target down;
 * on a phone `#levers` ended up in the withdrawal section. Browser scroll
 * anchoring doesn't compensate because the jump happens before there is
 * anything to anchor to.
 */
function holdSectionInView(scroll: () => void, height: number | undefined): () => void {
  let released = false
  const observer = new ResizeObserver(() => {
    const nextHeight = document.body.offsetHeight
    // The initial observation also fires during a smooth jump. Leave the
    // animation alone until a layout change actually moves its destination.
    if (released || nextHeight === height) return
    height = nextHeight
    scroll()
  })
  const release = () => {
    if (released) return
    released = true
    observer.disconnect()
    window.clearTimeout(timer)
    for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, release, true)
  }
  const timer = window.setTimeout(release, HOLD_MS)
  observer.observe(document.body)
  for (const type of USER_SCROLL_EVENTS)
    window.addEventListener(type, release, { capture: true, passive: true })
  return release
}

type SectionHash = Extract<WorkspaceHash, { compare: false }>

/**
 * The URL side of the workspace.
 *
 * - On load (after hydration and once the store has read localStorage) a
 *   section hash scrolls the canvas there instantly; `#assumptions` focuses
 *   the control column; a `:group` suffix opens that group in the column and
 *   shows it; `#compare` enters compare mode. Anything else is left alone.
 * - Back/Forward and hand-edited hashes (`popstate`, `hashchange`) move
 *   between compare and the sections. The two events usually arrive in a
 *   pair; the second is recognised by its unchanged hash and ignored.
 */
export function useWorkspaceHash(api: WorkspaceHashApi) {
  const apiRef = useRef(api)
  useEffect(() => {
    apiRef.current = api
  }, [api])

  const releaseHold = useRef<(() => void) | undefined>(undefined)
  const landOn = useCallback((section: WorkspaceSectionId, opts?: ScrollToSectionOptions) => {
    releaseHold.current?.()
    apiRef.current.scrollToSection(section, opts)
    const anchorTarget = opts?.focus ? document.getElementById(section) : null
    releaseHold.current = holdSectionInView(
      () => {
        // Correct an anchor displaced down the page by lazy content. Once the
        // reader has scrolled farther into the section, leave them there.
        if (anchorTarget && scrollDistanceToElement(anchorTarget) <= 1) return
        apiRef.current.scrollToSection(section, { behavior: 'instant', keepColumn: true })
      },
      // On a hash landing, re-aim once after its column group has been applied.
      // A focused anchor jump can keep animating until the page changes size.
      anchorTarget ? document.body.offsetHeight : undefined
    )
  }, [])

  useEffect(() => {
    let cancelled = false

    /** Canvas first, then the column: on the phone a named group ends on "Stellen". */
    const apply = (parsed: SectionHash, behavior?: ScrollBehavior) => {
      if (parsed.section !== 'assumptions') landOn(parsed.section, { behavior, keepColumn: true })
      apiRef.current.applyGroup(parsed.group, groupForTarget(parsed.section))
      if (parsed.section === 'assumptions' && !parsed.group) apiRef.current.focusColumn()
    }

    const applyInitial = () => {
      if (cancelled) return
      const { lastHashRef } = apiRef.current
      const hash = window.location.hash
      lastHashRef.current = hash
      const parsed = parseWorkspaceHash(hash)
      if (!parsed) return
      if (parsed.compare) {
        apiRef.current.enterCompare('landing')
        return
      }
      // Two frames: the column's presentation is known and the sections are laid out.
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          if (!cancelled) apply(parsed, 'instant')
        })
      )
    }
    // No `persist` API without web storage: the store is in memory and ready.
    const persist = useSimulationStore.persist
    const unsubscribe =
      (persist?.hasHydrated() ?? true)
        ? (applyInitial(), undefined)
        : persist.onFinishHydration(applyInitial)

    const onNavigate = () => {
      const current = apiRef.current
      const hash = window.location.hash
      // The second event of a popstate/hashchange pair: already handled, and
      // it must not cancel the hold the first one started.
      if (hash === current.lastHashRef.current) return
      // A later navigation owns the scroll position now.
      releaseHold.current?.()
      current.lastHashRef.current = hash
      const parsed = parseWorkspaceHash(hash)
      if (current.isComparing()) {
        if (!parsed?.compare) current.finishExitCompare()
        return
      }
      if (!parsed) return
      if (parsed.compare) {
        current.enterCompare('history')
        return
      }
      apply(parsed)
    }
    window.addEventListener('popstate', onNavigate)
    window.addEventListener('hashchange', onNavigate)
    return () => {
      cancelled = true
      releaseHold.current?.()
      unsubscribe?.()
      window.removeEventListener('popstate', onNavigate)
      window.removeEventListener('hashchange', onNavigate)
    }
  }, [landOn])

  return landOn
}
