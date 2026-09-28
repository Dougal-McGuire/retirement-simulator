'use client'

import { useEffect, type RefObject } from 'react'
import { pinnedBottom } from './workspaceNav'
import { useWorkspaceUiStore } from './useWorkspaceUiStore'

/**
 * Measures the pinned chrome and writes two CSS variables on `.ws-page`:
 *
 * - `--ws-bar-bottom`: the pinned bottom edge of the result bar (the overlay
 *   panel starts there);
 * - `--ws-sticky-top`: the pinned bottom of all sticky chrome — the bar, plus
 *   the chip row at 761–1023 (sections' `scroll-margin-top` builds on it).
 *
 * A CSS variable rather than React state, so a resize never re-renders the
 * page. The numbers also go to the UI store for the scroll-spy.
 */
export function useStickyOffset(pageRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const bar = page.querySelector<HTMLElement>('[data-testid="result-bar"]')
    const index = page.querySelector<HTMLElement>('#navigation')

    let frame = 0
    let last = { barBottom: -1, stickyTop: -1, bottomInset: -1 }
    const measure = () => {
      frame = 0
      // Every read before any write: reading styles after writing a variable
      // forces a second full style recalculation of the page.
      const barBottom = bar ? Math.max(0, pinnedBottom(bar)) : 0
      let stickyTop = barBottom
      let bottomInset = 0
      if (index) {
        const position = window.getComputedStyle(index).position
        // The sticky chip row (761–1023) is pinned at `--ws-bar-bottom`.
        if (position === 'sticky') stickyTop = barBottom + index.getBoundingClientRect().height
        if (position === 'fixed') bottomInset = index.getBoundingClientRect().height
      }
      if (barBottom !== last.barBottom) page.style.setProperty('--ws-bar-bottom', `${barBottom}px`)
      if (stickyTop !== last.stickyTop) page.style.setProperty('--ws-sticky-top', `${stickyTop}px`)
      if (stickyTop !== last.stickyTop || bottomInset !== last.bottomInset) {
        useWorkspaceUiStore.setState({ stickyTop, bottomInset })
      }
      last = { barBottom, stickyTop, bottomInset }
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }

    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    if (bar) observer?.observe(bar)
    if (index) observer?.observe(index)
    window.addEventListener('resize', schedule)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [pageRef])
}
