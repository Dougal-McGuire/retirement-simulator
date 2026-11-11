'use client'

import { useEffect, type RefObject } from 'react'
import { pinnedBottom } from './workspaceNav'
import { useWorkspaceUiStore } from './useWorkspaceUiStore'

/**
 * Measures the pinned chrome and writes three CSS variables on `.ws-page`
 * (plus `--ws-scroll-pad-top/-bottom` on `<html>` for the scroll margins):
 *
 * - `--ws-bar-bottom`: the pinned bottom edge of the bar (the dock and the
 *   docked column start there);
 * - `--ws-sticky-top`: the pinned bottom of all chrome at the top — the bar
 *   plus the dock. Sections' `scroll-margin-top`, the drawer and the phone's
 *   "Stellen" mode build on it. From 1180 px the dock only shows once the
 *   head's chart has left, but everything a jump can land on lies below the
 *   head, so its height always counts;
 * - `--ws-bottom-inset`: the height of chrome fixed at the bottom (the
 *   phone's mode bar and, with unsaved changes, the draft row above it).
 *
 * CSS variables rather than React state, so a resize never re-renders the
 * page. The numbers also go to the UI store for the scroll-spy.
 */
export function useStickyOffset(pageRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const bar = page.querySelector<HTMLElement>('[data-testid="result-bar"]')
    const dock = page.querySelector<HTMLElement>('[data-result-dock]')
    const bottomChrome = () =>
      Array.from(page.querySelectorAll<HTMLElement>('[data-bottom-chrome]'))
    const root = document.documentElement

    let frame = 0
    let last = { barBottom: -1, stickyTop: -1, bottomInset: -1 }
    const measure = () => {
      frame = 0
      // Every read before any write: reading styles after writing a variable
      // forces a second full style recalculation of the page.
      const barBottom = bar ? Math.max(0, pinnedBottom(bar)) : 0
      const dockHeight = dock && dock.getClientRects().length > 0 ? dock.offsetHeight : 0
      const stickyTop = barBottom + dockHeight
      let bottomInset = 0
      for (const node of bottomChrome()) {
        if (window.getComputedStyle(node).position !== 'fixed') continue
        const rect = node.getBoundingClientRect()
        if (rect.height === 0) continue
        bottomInset = Math.max(bottomInset, window.innerHeight - rect.top)
      }
      bottomInset = Math.max(0, Math.round(bottomInset))
      if (barBottom !== last.barBottom) page.style.setProperty('--ws-bar-bottom', `${barBottom}px`)
      if (stickyTop !== last.stickyTop) page.style.setProperty('--ws-sticky-top', `${stickyTop}px`)
      if (bottomInset !== last.bottomInset)
        page.style.setProperty('--ws-bottom-inset', `${bottomInset}px`)
      if (stickyTop !== last.stickyTop || bottomInset !== last.bottomInset) {
        // On <html>, for the page's scroll margins (ws-page.css): a focused
        // control (Tab, find-in-page) stays clear of the bar and the dock and
        // of the phones' fixed bottom chrome (WCAG 2.4.11).
        root.style.setProperty('--ws-scroll-pad-top', `${stickyTop}px`)
        root.style.setProperty('--ws-scroll-pad-bottom', `${bottomInset}px`)
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
    if (dock) observer?.observe(dock)
    for (const node of bottomChrome()) observer?.observe(node)
    window.addEventListener('resize', schedule)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
      root.style.removeProperty('--ws-scroll-pad-top')
      root.style.removeProperty('--ws-scroll-pad-bottom')
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [pageRef])
}
