'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import type { EditTarget, ScrollToSectionOptions } from './WorkspaceProvider'
import { parseWorkspaceHash, type WorkspaceSectionId } from './workspaceNav'

export interface WorkspaceHashApi {
  /** The hash the page itself last wrote; events for it are ours and ignored. */
  lastHashRef: RefObject<string>
  isComparing: () => boolean
  isEditorOpen: () => boolean
  scrollToSection: (id: WorkspaceSectionId, opts?: ScrollToSectionOptions) => void
  openEditor: (target: EditTarget, invoker?: HTMLElement | null) => void
  /** Closes the panel without returning focus (the URL took the reader elsewhere). */
  closeEditor: () => void
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
function holdSectionInView(scroll: () => void): () => void {
  let released = false
  const observer = new ResizeObserver(() => {
    if (!released) scroll()
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

/**
 * The URL side of the workspace.
 *
 * - On load (after hydration and once the store has read localStorage) a
 *   section hash scrolls there instantly and a `:panel` suffix opens that
 *   panel; `#compare` enters compare mode. Anything else is left alone.
 * - Back/Forward and hand-edited hashes (`popstate`, `hashchange`) move
 *   between compare and the sections. The two events usually arrive in a
 *   pair; the second is recognised by its unchanged hash and ignored.
 */
export function useWorkspaceHash(api: WorkspaceHashApi): void {
  const apiRef = useRef(api)
  useEffect(() => {
    apiRef.current = api
  }, [api])

  useEffect(() => {
    let cancelled = false
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
      // Two frames: the panel mode is known and the sections are laid out.
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          if (cancelled) return
          apiRef.current.scrollToSection(parsed.section, { behavior: 'instant' })
          releaseHold = holdSectionInView(() =>
            apiRef.current.scrollToSection(parsed.section, { behavior: 'instant' })
          )
          if (parsed.panel) apiRef.current.openEditor({ panel: parsed.panel }, null)
        })
      )
    }
    let releaseHold: (() => void) | undefined
    const unsubscribe = useSimulationStore.persist.hasHydrated()
      ? (applyInitial(), undefined)
      : useSimulationStore.persist.onFinishHydration(applyInitial)

    // Same as a landing: the target is measured before the sections the
    // scroll passes have mounted (on phones they grow as it goes by), so keep
    // re-aiming until the page settles.
    const landOn = (section: WorkspaceSectionId) => {
      if (cancelled) return
      apiRef.current.scrollToSection(section)
      releaseHold = holdSectionInView(() =>
        apiRef.current.scrollToSection(section, { behavior: 'instant' })
      )
    }

    const onNavigate = () => {
      const current = apiRef.current
      const hash = window.location.hash
      // The second event of a popstate/hashchange pair: already handled, and
      // it must not cancel the hold the first one started.
      if (hash === current.lastHashRef.current) return
      // A later navigation owns the scroll position now.
      releaseHold?.()
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
      if (!parsed.panel && current.isEditorOpen()) {
        // Closing a docked panel re-flows the page: jump once it has.
        current.closeEditor()
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => landOn(parsed.section))
        )
        return
      }
      landOn(parsed.section)
      if (parsed.panel) current.openEditor({ panel: parsed.panel }, null)
    }
    window.addEventListener('popstate', onNavigate)
    window.addEventListener('hashchange', onNavigate)
    return () => {
      cancelled = true
      releaseHold?.()
      unsubscribe?.()
      window.removeEventListener('popstate', onNavigate)
      window.removeEventListener('hashchange', onNavigate)
    }
  }, [])
}
