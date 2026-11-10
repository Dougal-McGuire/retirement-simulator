import { create } from 'zustand'
import { DEFAULT_OPEN_GROUPS, type ColumnGroup } from '@/components/plans/planSections'
import type { WorkspaceSectionId } from './workspaceNav'

/**
 * View state of the one-page workspace that is neither a plan input nor
 * worth a re-render of the page: where the reader is, which groups of the
 * control column are open, whether the column is unfolded, and which result
 * surface is in view. A separate, tiny store so each part subscribes to its
 * own field; the geometry fields are read imperatively with `getState()` and
 * never subscribed to. Nothing here is persisted (the URL hash restores the
 * group a deep link names).
 */
export interface WorkspaceUiState {
  /** The section the reader is in (scroll-spy), or the one just jumped to. */
  activeSection: WorkspaceSectionId
  setActiveSection: (id: WorkspaceSectionId) => void
  /** A programmatic scroll is running: the spy and hash writes wait for it. */
  programmaticScroll: boolean
  /** Pinned bottom of all sticky chrome at the top (px), from `useStickyOffset`. */
  stickyTop: number
  /** Height of chrome fixed at the bottom (the phone mode bar and draft row), px. */
  bottomInset: number
  /** Open groups of the control column, in the order they were opened. */
  openGroups: readonly ColumnGroup[]
  setGroupOpen: (group: ColumnGroup, open: boolean) => void
  /**
   * The drawer is unfolded (761–1179) or the phone shows "Stellen" (≤760).
   * `null` until the page has looked at the width: CSS then decides (drawer
   * unfolded from 1000 px, phone on "Ansehen"). Ignored from 1180 px, where
   * the column is a permanent pane.
   */
  columnOpen: boolean | null
  setColumnOpen: (open: boolean) => void
  /**
   * The dock is the result surface in view: below 1180 px always, above it
   * once less than half of the head's chart is on screen (and in compare
   * mode, where the head gives way).
   */
  dockPinned: boolean
  setDockPinned: (pinned: boolean) => void
}

export const useWorkspaceUiStore = create<WorkspaceUiState>()((set) => ({
  activeSection: 'result',
  setActiveSection: (id) =>
    set((state) => (state.activeSection === id ? state : { activeSection: id })),
  programmaticScroll: false,
  stickyTop: 0,
  bottomInset: 0,
  openGroups: DEFAULT_OPEN_GROUPS,
  setGroupOpen: (group, open) =>
    set((state) => {
      const has = state.openGroups.includes(group)
      if (has === open) return state
      return {
        openGroups: open
          ? [...state.openGroups, group]
          : state.openGroups.filter((entry) => entry !== group),
      }
    }),
  columnOpen: null,
  setColumnOpen: (open) =>
    set((state) => (state.columnOpen === open ? state : { columnOpen: open })),
  dockPinned: false,
  setDockPinned: (pinned) =>
    set((state) => (state.dockPinned === pinned ? state : { dockPinned: pinned })),
}))

export const useActiveSection = () => useWorkspaceUiStore((state) => state.activeSection)
export const useOpenGroups = () => useWorkspaceUiStore((state) => state.openGroups)
export const useColumnOpen = () => useWorkspaceUiStore((state) => state.columnOpen)
export const useDockPinned = () => useWorkspaceUiStore((state) => state.dockPinned)

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
