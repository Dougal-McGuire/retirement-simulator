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
import type { AssumptionPanel } from '@/components/plans/planSections'
import { usePanelMode, type PanelMode } from './usePanelMode'
import { useScrollSpy } from './useScrollSpy'
import { useStickyOffset } from './useStickyOffset'
import { useWorkspaceHash, type WorkspaceHashApi } from './useWorkspaceHash'
import {
  beginProgrammaticScroll,
  endProgrammaticScroll,
  useWorkspaceUiStore,
} from './useWorkspaceUiStore'
import {
  WORKSPACE_SECTIONS,
  formatWorkspaceHash,
  parseWorkspaceHash,
  scrollToElement,
  type WorkspaceSectionId,
} from './workspaceNav'

export type { AssumptionPanel } from '@/components/plans/planSections'
export type { PanelMode } from './usePanelMode'

/** Where an edit affordance leads: a panel (optionally a field in it) or the Entnahme section. */
export type EditTarget =
  | { panel: AssumptionPanel; fieldId?: string }
  | { section: 'withdrawal'; fieldId?: string }

export type EditorState = { panel: AssumptionPanel; fieldId?: string }
export type WorkspaceMode = 'plan' | 'compare'

export interface ScrollToSectionOptions {
  /** Focus the section heading (for keyboard and screen-reader users). */
  focus?: boolean
  behavior?: ScrollBehavior
}

export interface ExitCompareOptions {
  /** Go to this section instead of restoring the scroll position. */
  section?: WorkspaceSectionId
  /** With `section`: focus its heading (default true). */
  focus?: boolean
}

/**
 * The page-level API every workspace part talks to. Frozen after Phase 1:
 * changes go through the integrator.
 */
export interface WorkspaceApi {
  /** `plan` (the sections) or `compare` (CompareView in their place). */
  mode: WorkspaceMode
  /** How the edit panel presents at this width. */
  panelMode: PanelMode
  /** The open assumption panel, or null. */
  editor: EditorState | null
  /**
   * Opens a panel (swapping content if one is open), or for
   * `{ section: 'withdrawal' }` closes any panel and jumps to the Entnahme
   * section. `invoker` gets focus back on close; when omitted, the focused
   * element is used; `null` means "fall back to the panel's card".
   */
  openEditor: (target: EditTarget, invoker?: HTMLElement | null) => void
  closeEditor: () => void
  /** Scrolls a section under the sticky chrome, marks it current and sets the hash. */
  scrollToSection: (id: WorkspaceSectionId, opts?: ScrollToSectionOptions) => void
  /** Enters compare mode (pushes `#compare`). */
  enterCompare: (invoker?: HTMLElement | null) => void
  /** Leaves compare mode: Back if `#compare` has its own entry after one of ours, otherwise in place. */
  exitCompare: (opts?: ExitCompareOptions) => void
  /** An overlay or sheet panel is open: rail, index and main are inert. */
  pageInert: boolean
  /** The phone sheet is open: the result bar is inert too. */
  barInert: boolean
}

/** Plumbing for the page shell and the edit panel; not part of the frozen API. */
export interface WorkspaceInternals {
  pageRef: RefObject<HTMLDivElement | null>
  /** Element that gets focus back when the panel closes. */
  invokerRef: RefObject<HTMLElement | null>
  /** Increments with every `openEditor`: the panel moves focus on each. */
  focusRequest: number
  /** Set when a close is followed by a jump elsewhere: no focus return. */
  suppressReturnFocusRef: RefObject<boolean>
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

/** How long a docked-panel anchor holds while the page column re-flows. */
const ANCHOR_HOLD_MS = 1200
/** Input that means the reader is steering the scroll position themselves. */
const ANCHOR_RELEASE_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * Keeps `el` at its current viewport position while the page re-flows around
 * it (opening or closing the docked panel narrows or widens the page column).
 *
 * The correction runs from a ResizeObserver on the page column, i.e. after
 * layout and before paint, whenever the re-flow actually lands — not in a
 * React effect, which can run a commit before Radix mounts or unmounts the
 * panel content (it does on every open after the first). It keeps correcting
 * while charts re-measure at the new width, until the reader scrolls, clicks
 * or types, a programmatic jump starts, or the hold times out.
 */
function holdInPlace(el: HTMLElement, observe: Element[]): () => void {
  const top = el.getBoundingClientRect().top
  let released = false
  const correct = () => {
    if (released) return
    if (!el.isConnected || useWorkspaceUiStore.getState().programmaticScroll) {
      release()
      return
    }
    const delta = el.getBoundingClientRect().top - top
    if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior: 'instant' })
  }
  const observer = new ResizeObserver(correct)
  const release = () => {
    if (released) return
    released = true
    observer.disconnect()
    window.clearTimeout(timer)
    for (const type of ANCHOR_RELEASE_EVENTS) window.removeEventListener(type, release, true)
  }
  const timer = window.setTimeout(release, ANCHOR_HOLD_MS)
  for (const node of observe) observer.observe(node)
  for (const type of ANCHOR_RELEASE_EVENTS)
    window.addEventListener(type, release, { capture: true, passive: true })
  return release
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
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [mode, setMode] = useState<WorkspaceMode>('plan')
  const [focusRequest, setFocusRequest] = useState(0)

  const pageRef = useRef<HTMLDivElement | null>(null)
  const invokerRef = useRef<HTMLElement | null>(null)
  const suppressReturnFocusRef = useRef(false)
  // Synchronous mirrors of state, for handlers that run before a re-render.
  const editorRef = useRef<EditorState | null>(null)
  const modeRef = useRef<WorkspaceMode>('plan')
  const panelModeRef = useRef<PanelMode>(panelMode)
  const lastHashRef = useRef<string>('')
  const compareRef = useRef<CompareSession | null>(null)
  const pendingExitRef = useRef<ExitCompareOptions | null>(null)
  const exitFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Releases the running docked-panel scroll anchor (see `holdInPlace`). */
  const releaseAnchorRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    panelModeRef.current = panelMode
  }, [panelMode])

  const commitEditor = useCallback((next: EditorState | null) => {
    editorRef.current = next
    setEditor(next)
  }, [])

  const writeHash = useCallback((hash: string) => {
    if (modeRef.current === 'compare') return
    if (window.location.hash === hash) return
    lastHashRef.current = hash
    replaceHash(hash)
  }, [])

  /** `#section`, or `#section:panel` while a panel is open. */
  const sectionHash = useCallback(
    (section: WorkspaceSectionId, panel: AssumptionPanel | undefined) =>
      formatWorkspaceHash({ compare: false, section, panel }),
    []
  )

  /** `undefined` → the focused element (unless it is inside the panel); `null` → none. */
  const resolveInvoker = useCallback((invoker: HTMLElement | null | undefined) => {
    if (invoker !== undefined) return invoker
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || active === document.body) return null
    if (active.closest('#edit-panel')) return null
    return active
  }, [])

  /**
   * Docked, opening or closing the panel narrows or widens the page column:
   * hold `el` (the card or ledger line the reader clicked) where it is. Only
   * when it is in view — an anchor the reader cannot see would fight the
   * focus return that scrolls it into view.
   */
  const anchorOn = useCallback((el: HTMLElement | null) => {
    releaseAnchorRef.current?.()
    releaseAnchorRef.current = null
    if (panelModeRef.current !== 'docked' || !el?.isConnected) return
    const rect = el.getBoundingClientRect()
    if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.height === 0) return
    // The reader acted on something in view: an index jump still settling
    // (its lock outlives a scroll that did not move) gives way.
    endProgrammaticScroll()
    const column = pageRef.current?.querySelector('.ws-main')
    releaseAnchorRef.current = holdInPlace(el, column ? [column, el] : [el])
  }, [])

  useEffect(() => () => releaseAnchorRef.current?.(), [])

  const scrollToSection = useCallback(
    (id: WorkspaceSectionId, opts: ScrollToSectionOptions = {}) => {
      const section = document.getElementById(id)
      if (!section) return
      beginProgrammaticScroll()
      useWorkspaceUiStore.getState().setActiveSection(id)
      writeHash(sectionHash(id, editorRef.current?.panel))
      // The first section is the top of the page: go all the way up, so the
      // phone's plan row (which scrolls away) comes back with it.
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

  /** `anchor: false` when the close is part of a jump elsewhere. */
  const dismissEditor = useCallback(
    (anchor: boolean) => {
      if (!editorRef.current) return
      const panel = editorRef.current.panel
      if (anchor) {
        anchorOn(
          invokerRef.current?.isConnected
            ? invokerRef.current
            : document.querySelector<HTMLElement>(`[data-edit-panel="${panel}"]`)
        )
      }
      commitEditor(null)
      writeHash(sectionHash(useWorkspaceUiStore.getState().activeSection, undefined))
    },
    [anchorOn, commitEditor, writeHash, sectionHash]
  )

  const closeEditor = useCallback(() => dismissEditor(true), [dismissEditor])

  const jumpToWithdrawal = useCallback(
    (fieldId?: string) => {
      afterPaint(() => {
        scrollToSection('withdrawal')
        const section = document.getElementById('withdrawal')
        const field =
          (fieldId ? document.getElementById(fieldId) : null) ??
          section?.querySelector<HTMLElement>(
            '[data-testid="withdrawal-strategy-picker"] [aria-pressed="true"]'
          ) ??
          document.getElementById('withdrawal-title')
        field?.focus({ preventScroll: true })
      })
    },
    [scrollToSection]
  )

  const openEditor = useCallback(
    (target: EditTarget, invoker?: HTMLElement | null) => {
      if ('section' in target) {
        if (editorRef.current) {
          suppressReturnFocusRef.current = true
          commitEditor(null)
        }
        jumpToWithdrawal(target.fieldId)
        return
      }
      const who = resolveInvoker(invoker)
      if (!editorRef.current) anchorOn(who)
      invokerRef.current = who
      commitEditor({ panel: target.panel, fieldId: target.fieldId })
      setFocusRequest((count) => count + 1)
      writeHash(sectionHash(useWorkspaceUiStore.getState().activeSection, target.panel))
    },
    [anchorOn, commitEditor, jumpToWithdrawal, resolveInvoker, sectionHash, writeHash]
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
  }, [scrollToSection])

  /**
   * `source`: `ui` pushes `#compare`; `landing` (the page opened on
   * `#compare`) and `history` (Back/Forward or an edited URL reached a
   * `#compare` entry) find the URL already there.
   */
  const enterCompare = useCallback(
    (invoker?: HTMLElement | null, source: 'ui' | 'landing' | 'history' = 'ui') => {
      if (modeRef.current === 'compare') return
      const push = source === 'ui'
      releaseAnchorRef.current?.()
      if (editorRef.current) {
        suppressReturnFocusRef.current = true
        commitEditor(null)
      }
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
    [commitEditor, resolveInvoker]
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

  const overlayOpen = editor !== null && panelMode !== 'docked'
  useScrollSpy(
    mode === 'plan' && !overlayOpen,
    useCallback(
      (id: WorkspaceSectionId) => writeHash(sectionHash(id, editorRef.current?.panel)),
      [writeHash, sectionHash]
    )
  )

  const hashApi = useMemo<WorkspaceHashApi>(
    () => ({
      lastHashRef,
      isComparing: () => modeRef.current === 'compare',
      isEditorOpen: () => editorRef.current !== null,
      scrollToSection,
      openEditor,
      // The URL moved on: the reader is going elsewhere, so no focus return
      // (it would scroll the page back to the card mid-jump).
      // No scroll anchor either: the landing jump owns the position.
      closeEditor: () => {
        if (editorRef.current) suppressReturnFocusRef.current = true
        dismissEditor(false)
      },
      enterCompare: (source) => enterCompare(null, source),
      finishExitCompare,
    }),
    [scrollToSection, openEditor, dismissEditor, enterCompare, finishExitCompare]
  )
  useWorkspaceHash(hashApi)

  // Compare on phones: the wrapped header slides up behind the result bar
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
    // Focus on a plan chip hidden behind the bar (Tab, Shift+Tab): scroll
    // back until the header sits whole under the bar. Scrolling, not
    // re-pinning the header, so the exit button never moves under a pointer.
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

  // Warm the code-split panel contents while the reader looks at results.
  useEffect(() => {
    const warm = () => void import('./edit/panelContent').then((m) => m.preloadPanelContent())
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
      editor,
      openEditor,
      closeEditor,
      scrollToSection,
      enterCompare: (invoker?: HTMLElement | null) => enterCompare(invoker),
      exitCompare,
      pageInert: overlayOpen,
      barInert: editor !== null && panelMode === 'sheet',
    }),
    [
      mode,
      panelMode,
      editor,
      openEditor,
      closeEditor,
      scrollToSection,
      enterCompare,
      exitCompare,
      overlayOpen,
    ]
  )

  const internals = useMemo<WorkspaceInternals>(
    () => ({ pageRef, invokerRef, focusRequest, suppressReturnFocusRef }),
    [focusRequest]
  )

  return (
    <WorkspaceContext.Provider value={api}>
      <WorkspaceInternalsContext.Provider value={internals}>
        {children}
      </WorkspaceInternalsContext.Provider>
    </WorkspaceContext.Provider>
  )
}
