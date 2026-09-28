import { create } from 'zustand'
import type { WorkspaceSectionId } from './workspaceNav'

/**
 * Scroll state of the one-page workspace. A separate, tiny store so that a
 * scroll only re-renders the section index (the one subscriber of
 * `activeSection`); the geometry fields are read imperatively with
 * `getState()` and never subscribed to.
 */
export interface WorkspaceUiState {
  /** The section the reader is in (scroll-spy), or the one just jumped to. */
  activeSection: WorkspaceSectionId
  setActiveSection: (id: WorkspaceSectionId) => void
  /** A programmatic scroll is running: the spy and hash writes wait for it. */
  programmaticScroll: boolean
  /** Pinned bottom of all sticky chrome at the top (px), from `useStickyOffset`. */
  stickyTop: number
  /** Height of chrome fixed at the bottom (the phone section bar), px. */
  bottomInset: number
}

export const useWorkspaceUiStore = create<WorkspaceUiState>()((set) => ({
  activeSection: 'result',
  setActiveSection: (id) =>
    set((state) => (state.activeSection === id ? state : { activeSection: id })),
  programmaticScroll: false,
  stickyTop: 0,
  bottomInset: 0,
}))

export const useActiveSection = () => useWorkspaceUiStore((state) => state.activeSection)

let releaseTimer: ReturnType<typeof setTimeout> | null = null
let releaseListener: (() => void) | null = null

/**
 * Marks a programmatic scroll until the browser reports `scrollend` (with a
 * 700 ms fallback for engines without it, or a jump that did not move). A
 * long smooth scroll that is still moving at the fallback keeps the lock.
 */
export function beginProgrammaticScroll(): void {
  if (typeof window === 'undefined') return
  endProgrammaticScroll()
  useWorkspaceUiStore.setState({ programmaticScroll: true })
  releaseListener = () => endProgrammaticScroll()
  window.addEventListener('scrollend', releaseListener, { once: true })
  let lastY = window.scrollY
  const check = () => {
    if (window.scrollY !== lastY) {
      lastY = window.scrollY
      releaseTimer = setTimeout(check, 150)
      return
    }
    endProgrammaticScroll()
  }
  releaseTimer = setTimeout(check, 700)
}

export function endProgrammaticScroll(): void {
  if (releaseTimer) clearTimeout(releaseTimer)
  releaseTimer = null
  if (releaseListener) window.removeEventListener('scrollend', releaseListener)
  releaseListener = null
  if (useWorkspaceUiStore.getState().programmaticScroll) {
    useWorkspaceUiStore.setState({ programmaticScroll: false })
  }
}
