'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import type { AssumptionPanel, ColumnGroup } from '@/components/plans/planSections'
import { DRAWER_OPEN_MIN_WIDTH, usePanelMode, type PanelMode } from './usePanelMode'
import { useScrollSpy } from './useScrollSpy'
import { useStickyOffset } from './useStickyOffset'
import { useWorkspaceHash, type WorkspaceHashApi } from './useWorkspaceHash'
import { beginProgrammaticScroll, useWorkspaceUiStore } from './useWorkspaceUiStore'
import {
  WORKSPACE_SECTIONS,
  formatWorkspaceHash,
  parseWorkspaceHash,
  scrollToElement,
  type WorkspaceSectionId,
} from './workspaceNav'

export type { AssumptionPanel, ColumnGroup } from '@/components/plans/planSections'
export type { PanelMode } from './usePanelMode'

/**
 * Where an edit affordance leads: a group of the control column (optionally a
 * field in it). `{ section: 'withdrawal' }` is the Entnahme rule, i.e. the
 * column's `rule` group.
 */
export type EditTarget =
  | { panel: AssumptionPanel; fieldId?: string }
  | { section: 'withdrawal'; fieldId?: string }

export type WorkspaceMode = 'plan' | 'compare'

export interface ScrollToSectionOptions {
  /** Focus the section heading (for keyboard and screen-reader users). */
  focus?: boolean
  behavior?: ScrollBehavior
  /**
   * Leave the phone's mode as it is. Without it a section jump returns the
   * phone to "Ansehen", since the canvas is behind "Stellen".
   */
  keepColumn?: boolean
}

export interface ExitCompareOptions {
  /** Go to this section instead of restoring the scroll position. */
  section?: WorkspaceSectionId
  /** With `section`: focus its heading (default true). */
  focus?: boolean
  /** Land in the control column instead: unfold it and focus it ("edit this plan"). */
  column?: boolean
}

/**
 * The page-level API every workspace part talks to. Which groups are open
 * and whether the column is unfolded live in `useWorkspaceUiStore`, so that
 * toggling them does not re-render every consumer of this context.
 */
export interface WorkspaceApi {
  /** `plan` (head and sections beside the column) or `compare` (CompareView in their place). */
  mode: WorkspaceMode
  /** How the control column presents at this width. */
  panelMode: PanelMode
  /**
   * Opens a group of the control column (unfolding the drawer, or switching
   * the phone to "Stellen"), scrolls the column to it and focuses the field,
   * or the group's header when no field is named. `invoker` gets focus back
   * when the column is folded again; when omitted, the focused element is
   * used.
   */
  openEditor: (target: EditTarget, invoker?: HTMLElement | null) => void
  /**
   * Leaves the column for what led into it (Escape does this): folds the
   * drawer / returns the phone to "Ansehen" and gives focus back to the
   * invoker. From 1180 px nothing folds; only the focus returns.
   */
  closeEditor: () => void
  /** Opens or closes one group from its header. */
  toggleGroup: (group: ColumnGroup) => void
  /**
   * Unfolds or folds the column (drawer, phone mode). `focus` moves focus
   * into the column on opening, back to where it came from on closing.
   */
  setColumnOpen: (open: boolean, opts?: { focus?: boolean }) => void
  /** Scrolls a section under the pinned chrome, marks it current and sets the hash. */
  scrollToSection: (id: WorkspaceSectionId, opts?: ScrollToSectionOptions) => void
  /** Enters compare mode (pushes `#compare`). */
  enterCompare: (invoker?: HTMLElement | null) => void
  /** Leaves compare mode: Back if `#compare` has its own entry after one of ours, otherwise in place. */
  exitCompare: (opts?: ExitCompareOptions) => void
}

/** A request to bring a group (and a field in it) into view in the column. */
export interface ColumnFocusRequest {
  group: ColumnGroup
  fieldId?: string
  /** Move keyboard focus too (false for a bare section link that only opens the group). */
  focus: boolean
  /** Increments with every request, so the same target can be asked for twice. */
  seq: number
}

/** Plumbing for the page shell and the control column; not part of the API. */
export interface WorkspaceInternals {
  pageRef: RefObject<HTMLDivElement | null>
  /** The latest request to show a group; the column acts on each new `seq`. */
  focusRequest: ColumnFocusRequest | null
  /** Drops the element Escape would return to (focus left the column by itself). */
  forgetInvoker: () => void
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null)
const WorkspaceInternalsContext = createContext<WorkspaceInternals | null>(null)

export function useWorkspace(): WorkspaceApi {
  const api = useContext(WorkspaceContext)
  if (!api) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return api
}

export function useWorkspaceInternals(): WorkspaceInternals {
  const internals = useContext(WorkspaceInternalsContext)
  if (!internals) throw new Error('useWorkspaceInternals must be used inside <WorkspaceProvider>')
  return internals
}

/** Runs `fn` after the next paint (two frames), when React has committed and laid out. */
function afterPaint(fn: () => void) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(fn))
}

/** Polls for an element for up to `timeout` ms (dynamic chunks load asynchronously). */
function whenPresent<T>(find: () => T | null, then: (found: T) => void, timeout = 3000) {
  const started = performance.now()
  const tick = () => {
    const found = find()
    if (found) then(found)
    else if (performance.now() - started < timeout) window.requestAnimationFrame(tick)
  }
  window.requestAnimationFrame(tick)
}

/** Replaces the URL hash without a history entry; `''` removes it. */
export function replaceHash(hash: string) {
  const url = hash ? hash : `${window.location.pathname}${window.location.search}`
  window.history.replaceState(null, '', url)
}

/** `smooth` unless the reader asked for reduced motion (then always instant). */
function scrollBehavior(requested: ScrollBehavior | undefined): ScrollBehavior {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return reduce ? 'auto' : (requested ?? 'smooth')
}

/**
 * Whether stepping Back from the current entry stays on this page and leaves
 * `#compare`, from the Navigation API (`null` where it is missing). False on a
 * fresh `#compare` landing (the entry before is another page) and after a
 * reload (older entries belong to the discarded document).
 */
function previousEntryIsOurs(): boolean | null {
  const navigation = (
    window as Window & {
      navigation?: {
        currentEntry: { index: number } | null
        entries: () => { url: string | null; sameDocument: boolean }[]
      }
    }
  ).navigation
  const current = navigation?.currentEntry
  if (!navigation || !current || typeof navigation.entries !== 'function') return null
  if (current.index <= 0) return false
  const previous = navigation.entries()[current.index - 1]
  if (!previous?.sameDocument || !previous.url) return false
  return parseWorkspaceHash(new URL(previous.url).hash)?.compare !== true
}

interface CompareSession {
  scrollY: number
  invoker: HTMLElement | null
  prevHash: string
  /**
   * Compare has its own history entry with one of ours before it: we pushed
   * `#compare`, or Back/Forward/an edited URL brought us to one. Exit then
   * steps Back instead of rewriting the entry in place.
   */
  ownEntry: boolean
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const panelMode = usePanelMode()
  const [mode, setMode] = useState<WorkspaceMode>('plan')
  const [focusRequest, setFocusRequest] = useState<ColumnFocusRequest | null>(null)

  const pageRef = useRef<HTMLDivElement | null>(null)
  /** Element that gets focus back when the drawer folds or the phone returns to "Ansehen". */
  const invokerRef = useRef<HTMLElement | null>(null)
  // Synchronous mirrors of state, for handlers that run before a re-render.
  const modeRef = useRef<WorkspaceMode>('plan')
  const panelModeRef = useRef<PanelMode>(panelMode)
  const lastHashRef = useRef<string>('')
  const compareRef = useRef<CompareSession | null>(null)
  const pendingExitRef = useRef<ExitCompareOptions | null>(null)
  const exitFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * The group the URL names: the last one the reader opened (or a deep link
   * named). A reload opens it again; closing it takes it out of the hash.
   */
  const linkedGroupRef = useRef<ColumnGroup | undefined>(undefined)
  const focusSeqRef = useRef(0)

  // The column's fold state follows the width until the reader decides: the
  // drawer starts unfolded from 1000 px, the phone on "Ansehen". Set once the
  // width is known and again whenever the presentation changes.
  useEffect(() => {
    panelModeRef.current = panelMode
    const open = panelMode === 'drawer' && window.innerWidth >= DRAWER_OPEN_MIN_WIDTH
    useWorkspaceUiStore.getState().setColumnOpen(panelMode === 'docked' ? true : open)
  }, [panelMode])

  const writeHash = useCallback((hash: string) => {
    if (modeRef.current === 'compare') return
    if (window.location.hash === hash) return
    lastHashRef.current = hash
    replaceHash(hash)
  }, [])

  /** `#section`, or `#section:group` while the URL names a group. */
  const sectionHash = useCallback(
    (section: WorkspaceSectionId) =>
      formatWorkspaceHash({ compare: false, section, group: linkedGroupRef.current }),
    []
  )

  /** `undefined` → the focused element (unless it is inside the column); `null` → none. */
  const resolveInvoker = useCallback((invoker: HTMLElement | null | undefined) => {
    if (invoker !== undefined) return invoker
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || active === document.body) return null
    if (active.closest('#edit-panel')) return null
    return active
  }, [])

  const setColumnOpen = useCallback((open: boolean, opts: { focus?: boolean } = {}) => {
    const ui = useWorkspaceUiStore.getState()
    if (panelModeRef.current === 'docked') return
    const changed = ui.columnOpen !== open
    ui.setColumnOpen(open)
    if (!opts.focus || !changed) return
    afterPaint(() => {
      if (open) {
        document.getElementById('edit-panel-title')?.focus({ preventScroll: true })
        return
      }
      // Back to what opened the column, else the fold control, else the head.
      const candidates = [
        invokerRef.current,
        document.querySelector<HTMLElement>('[data-column-toggle]'),
        document.getElementById('result-title'),
      ]
      invokerRef.current = null
      candidates
        .find((node) => node?.isConnected && node.getClientRects().length > 0)
        ?.focus({ preventScroll: true })
    })
  }, [])

  const scrollToSection = useCallback(
    (id: WorkspaceSectionId, opts: ScrollToSectionOptions = {}) => {
      // On the phone the canvas is behind "Stellen": a section jump goes back.
      if (panelModeRef.current === 'sheet' && !opts.keepColumn) {
        useWorkspaceUiStore.getState().setColumnOpen(false)
      }
      const section = document.getElementById(id)
      if (!section) return
      beginProgrammaticScroll()
      useWorkspaceUiStore.getState().setActiveSection(id)
      writeHash(sectionHash(id))
      // The head is the top of the page: go all the way up.
      if (id === WORKSPACE_SECTIONS[0]) {
        window.scrollTo({ top: 0, behavior: scrollBehavior(opts.behavior) })
      } else {
        scrollToElement(section, { behavior: opts.behavior })
      }
      if (opts.focus) {
        document.getElementById(`${id}-title`)?.focus({ preventScroll: true })
      }
    },
    [writeHash, sectionHash]
  )

  /** Brings a group into view in the column; `link` puts it into the URL. */
  const showGroup = useCallback(
    (
      group: ColumnGroup,
      opts: { fieldId?: string; focus: boolean; link: boolean; unfold: boolean }
    ) => {
      const ui = useWorkspaceUiStore.getState()
      ui.setGroupOpen(group, true)
      if (opts.unfold && panelModeRef.current !== 'docked') ui.setColumnOpen(true)
      if (opts.link) {
        linkedGroupRef.current = group
        writeHash(sectionHash(ui.activeSection))
      }
      focusSeqRef.current += 1
      setFocusRequest({ group, fieldId: opts.fieldId, focus: opts.focus, seq: focusSeqRef.current })
    },
    [writeHash, sectionHash]
  )

  const openEditor = useCallback(
    (target: EditTarget, invoker?: HTMLElement | null) => {
      const group: ColumnGroup = 'section' in target ? 'rule' : target.panel
      const who = resolveInvoker(invoker)
      if (who) invokerRef.current = who
      showGroup(group, { fieldId: target.fieldId, focus: true, link: true, unfold: true })
    },
    [resolveInvoker, showGroup]
  )

  const closeEditor = useCallback(() => {
    if (panelModeRef.current !== 'docked') {
      setColumnOpen(false, { focus: true })
      return
    }
    // A permanent pane has nothing to fold: focus goes back to what led here.
    const invoker = invokerRef.current
    invokerRef.current = null
    if (invoker?.isConnected && invoker.getClientRects().length > 0) invoker.focus()
  }, [setColumnOpen])

  /** Focus left the column on its own: there is no way back to remember. */
  const forgetInvoker = useCallback(() => {
    invokerRef.current = null
  }, [])

  const toggleGroup = useCallback(
    (group: ColumnGroup) => {
      const ui = useWorkspaceUiStore.getState()
      const open = !ui.openGroups.includes(group)
      ui.setGroupOpen(group, open)
      if (open) linkedGroupRef.current = group
      else if (linkedGroupRef.current === group) linkedGroupRef.current = undefined
      writeHash(sectionHash(ui.activeSection))
    },
    [writeHash, sectionHash]
  )

  // ---- Compare mode ------------------------------------------------------

  const finishExitCompare = useCallback(() => {
    if (exitFallbackRef.current) clearTimeout(exitFallbackRef.current)
    exitFallbackRef.current = null
    if (modeRef.current !== 'compare') return
    const session = compareRef.current
    const opts = pendingExitRef.current ?? {}
    pendingExitRef.current = null
    compareRef.current = null
    modeRef.current = 'plan'
    setMode('plan')
    lastHashRef.current = window.location.hash
    afterPaint(() => {
      if (opts.column) {
        beginProgrammaticScroll()
        window.scrollTo({ top: 0, behavior: 'instant' })
        setColumnOpen(true)
        afterPaint(() =>
          document.getElementById('edit-panel-title')?.focus({ preventScroll: true })
        )
        return
      }
      if (opts.section) {
        scrollToSection(opts.section, { focus: opts.focus ?? true, behavior: 'instant' })
        return
      }
      beginProgrammaticScroll()
      window.scrollTo({ top: session?.scrollY ?? 0, behavior: 'instant' })
      const invoker = session?.invoker
      const target = invoker?.isConnected ? invoker : document.getElementById('result-title')
      target?.focus({ preventScroll: true })
    })
  }, [scrollToSection, setColumnOpen])

  /**
   * `source`: `ui` pushes `#compare`; `landing` (the page opened on
   * `#compare`) and `history` (Back/Forward or an edited URL reached a
   * `#compare` entry) find the URL already there.
   */
  const enterCompare = useCallback(
    (invoker?: HTMLElement | null, source: 'ui' | 'landing' | 'history' = 'ui') => {
      if (modeRef.current === 'compare') return
      const push = source === 'ui'
      // The comparison takes the whole page: the phone leaves "Stellen".
      if (panelModeRef.current === 'sheet') useWorkspaceUiStore.getState().setColumnOpen(false)
      compareRef.current = {
        scrollY: window.scrollY,
        invoker: resolveInvoker(invoker),
        prevHash: window.location.hash === '#compare' ? '' : window.location.hash,
        // Reached through history, the entry before is (nearly always) ours;
        // the Navigation API, where present, settles it on exit.
        ownEntry: source !== 'landing',
      }
      if (push) {
        lastHashRef.current = '#compare'
        window.history.pushState(null, '', '#compare')
      }
      modeRef.current = 'compare'
      setMode('compare')
      afterPaint(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      whenPresent(
        () => document.getElementById('compare-title'),
        (title) => title.focus({ preventScroll: true })
      )
    },
    [resolveInvoker]
  )

  const exitCompare = useCallback(
    (opts: ExitCompareOptions = {}) => {
      if (modeRef.current !== 'compare') return
      pendingExitRef.current = opts
      const session = compareRef.current
      if (session && (previousEntryIsOurs() ?? session.ownEntry)) {
        // Back leaves our entry (so the next Back leaves the page, with no
        // duplicate in between); the popstate handler finishes the exit. A
        // fallback covers a Back that never reports (history edited under us).
        session.ownEntry = false
        window.history.back()
        exitFallbackRef.current = setTimeout(finishExitCompare, 600)
        return
      }
      lastHashRef.current = session?.prevHash ?? ''
      replaceHash(session?.prevHash ?? '')
      finishExitCompare()
    },
    [finishExitCompare]
  )

  // ---- Page-level wiring --------------------------------------------------

  useStickyOffset(pageRef)

  useScrollSpy(
    mode === 'plan',
    useCallback((id: WorkspaceSectionId) => writeHash(sectionHash(id)), [writeHash, sectionHash])
  )

  const hashApi = useMemo<WorkspaceHashApi>(
    () => ({
      lastHashRef,
      isComparing: () => modeRef.current === 'compare',
      scrollToSection,
      applyGroup: (named, implied) => {
        // The URL is already what was parsed: remember the group it names
        // (or that it names none) without writing it back.
        linkedGroupRef.current = named
        if (named) {
          showGroup(named, { focus: true, link: false, unfold: true })
          return
        }
        // A bare section is about the canvas: the phone shows "Ansehen".
        if (panelModeRef.current === 'sheet') useWorkspaceUiStore.getState().setColumnOpen(false)
        if (implied) showGroup(implied, { focus: false, link: false, unfold: false })
      },
      focusColumn: () => {
        const ui = useWorkspaceUiStore.getState()
        if (panelModeRef.current !== 'docked') ui.setColumnOpen(true)
        afterPaint(() => {
          const panel = document.getElementById('edit-panel')
          const body = panel?.querySelector<HTMLElement>('.ws-panel-body')
          if (body) body.scrollTop = 0
          document.getElementById('edit-panel-title')?.focus({ preventScroll: true })
        })
      },
      enterCompare: (source) => enterCompare(null, source),
      finishExitCompare,
    }),
    [scrollToSection, showGroup, enterCompare, finishExitCompare]
  )
  useWorkspaceHash(hashApi)

  // Compare on phones: the wrapped header slides up behind the pinned chrome
  // until only its exit row is left pinned. `--ws-compare-pin` is how far —
  // the offset of "Vergleich beenden" in the header, less a little air.
  useEffect(() => {
    const page = pageRef.current
    if (mode !== 'compare' || !page) return
    let cancelled = false
    let observer: ResizeObserver | null = null
    let detach: (() => void) | null = null
    const measure = (header: HTMLElement) => {
      const exit = header.querySelector<HTMLElement>('[data-testid="compare-exit"]')
      const pin = exit
        ? exit.getBoundingClientRect().top - header.getBoundingClientRect().top - 8
        : 0
      page.style.setProperty('--ws-compare-pin', `${Math.max(0, Math.round(pin))}px`)
    }
    // Focus on a plan chip hidden behind the chrome (Tab, Shift+Tab): scroll
    // back until the header sits whole under it. Scrolling, not re-pinning
    // the header, so the exit button never moves under a pointer.
    const reveal = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || target.closest('[data-testid="compare-exit"]')) return
      const { stickyTop } = useWorkspaceUiStore.getState()
      if (target.getBoundingClientRect().top >= stickyTop) return
      // The header leads the view, so the view's top is the header's own place.
      const home = (event.currentTarget as HTMLElement).parentElement?.getBoundingClientRect().top
      if (home !== undefined && home < stickyTop)
        window.scrollBy({ top: home - stickyTop, behavior: 'instant' })
    }
    // CompareView is code-split: wait for its header.
    whenPresent(
      () => (cancelled ? page : page.querySelector<HTMLElement>('.compare-header')),
      (header) => {
        if (cancelled || header === page) return
        measure(header)
        observer = new ResizeObserver(() => measure(header))
        observer.observe(header)
        header.addEventListener('focusin', reveal)
        detach = () => header.removeEventListener('focusin', reveal)
      },
      15000
    )
    return () => {
      cancelled = true
      observer?.disconnect()
      detach?.()
      page.style.removeProperty('--ws-compare-pin')
    }
  }, [mode])

  // Warm the code-split group bodies while the reader looks at results.
  useEffect(() => {
    const warm = () =>
      void import('./edit/panelContent')
        .then((m) => m.preloadPanelContent())
        // Only a warm-up: opening a group loads (and retries) for real.
        .catch(() => {})
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(warm, { timeout: 4000 })
      return () => window.cancelIdleCallback(handle)
    }
    const timer = setTimeout(warm, 2000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(
    () => () => {
      if (exitFallbackRef.current) clearTimeout(exitFallbackRef.current)
    },
    []
  )

  const api = useMemo<WorkspaceApi>(
    () => ({
      mode,
      panelMode,
      openEditor,
      closeEditor,
      toggleGroup,
      setColumnOpen,
      scrollToSection,
      enterCompare: (invoker?: HTMLElement | null) => enterCompare(invoker),
      exitCompare,
    }),
    [
      mode,
      panelMode,
      openEditor,
      closeEditor,
      toggleGroup,
      setColumnOpen,
      scrollToSection,
      enterCompare,
      exitCompare,
    ]
  )

  const internals = useMemo<WorkspaceInternals>(
    () => ({ pageRef, focusRequest, forgetInvoker }),
    [focusRequest, forgetInvoker]
  )

  return (
    <WorkspaceContext.Provider value={api}>
      <WorkspaceInternalsContext.Provider value={internals}>
        {children}
      </WorkspaceInternalsContext.Provider>
    </WorkspaceContext.Provider>
  )
}
