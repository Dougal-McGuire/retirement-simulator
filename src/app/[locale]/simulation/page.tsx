'use client'

import { useEffect, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { planDisplayName } from '@/lib/plans/planName'
import {
  DeferredResultsScope,
  useActivePlan,
  useSimulationLoading,
  useSimulationStore,
} from '@/lib/stores/simulationStore'
import { SectionBoundary } from '@/components/errors/SectionBoundary'
import { StorageNotice } from '@/components/errors/StorageNotice'
import { lazyComponent } from '@/components/lazy/lazyComponent'
import { isUsableResults } from '@/lib/results/usableResults'
import { hardenPersistence } from '@/lib/storage/hardenPersistence'
import { ResultAnnouncer } from '@/components/workspace/ResultAnnouncer'
import { EditPanel } from '@/components/workspace/edit/EditPanel'
import { ResultBar } from '@/components/workspace/ResultBar'
import { ResultDock } from '@/components/workspace/ResultDock'
import { ModeBar } from '@/components/workspace/SectionIndex'
import { useRunStatus } from '@/components/workspace/useRunStatus'
import { useColumnOpen } from '@/components/workspace/useWorkspaceUiStore'
import {
  WorkspaceProvider,
  useWorkspace,
  useWorkspaceInternals,
} from '@/components/workspace/WorkspaceProvider'
import { CashflowSection } from '@/components/workspace/sections/CashflowSection'
import { LeversSection } from '@/components/workspace/sections/LeversSection'
import { ResultHead } from '@/components/workspace/sections/ResultHead'
import { WithdrawalSection } from '@/components/workspace/sections/WithdrawalSection'
import './workspace.css'
import './ws-page.css'
import './ws-frame.css'

// Before any component can set state: a full quota must not throw out of a
// store update (see `hardenPersistence`).
hardenPersistence()

// Client-only and retryable: a chunk that does not arrive shows the compare
// boundary's inline message instead of the app's error page.
const CompareView = lazyComponent(() =>
  import('@/components/simulation-compact/CompareView').then((module) => module.CompareView)
)

/** The canvas, top to bottom: the result head, then the three sections under it. */
const SECTIONS = [
  { id: 'result', Section: ResultHead },
  { id: 'cashflow', Section: CashflowSection },
  { id: 'withdrawal', Section: WithdrawalSection },
  { id: 'levers', Section: LeversSection },
] as const

function WorkspaceError() {
  const tc = useTranslations('simulationCompact')
  const run = useSimulationStore((state) => state.runSimulation)
  return (
    <div role="alert" className="workspace-error">
      {tc('error')}{' '}
      <button type="button" className="workspace-button" onClick={() => run()}>
        {tc('retry')}
      </button>
    </div>
  )
}

/**
 * `<main>` — the result canvas — and its run-state attributes. Only this
 * element re-renders when a run starts, lands or stops holding "running":
 * the sections arrive as `children` created by the page, which does not
 * re-render for runs, so React skips them here (render isolation).
 */
function WorkspaceMain({ inert, children }: { inert: boolean; children: ReactNode }) {
  const loading = useSimulationLoading()
  const { status } = useRunStatus()
  return (
    <main
      id="main-content"
      className="ws-main"
      data-run-status={status}
      aria-busy={loading}
      inert={inert}
    >
      {children}
    </main>
  )
}

/**
 * The page's root element. Its attributes follow the column's fold state,
 * which lives in the UI store: only this wrapper re-renders when the drawer
 * folds or the phone changes mode — the bar, canvas and column arrive as
 * `children` and are skipped.
 */
function WorkspaceFrame({ children }: { children: ReactNode }) {
  const { mode, panelMode } = useWorkspace()
  const { pageRef } = useWorkspaceInternals()
  const columnOpen = useColumnOpen()
  return (
    <div
      ref={pageRef}
      className="ws-page"
      data-mode={mode}
      data-panel-mode={panelMode}
      data-column={columnOpen === null ? undefined : columnOpen ? 'open' : 'closed'}
    >
      {children}
    </div>
  )
}

/** The canvas, inert while the phone shows "Stellen" in its place. */
function WorkspaceCanvas({ children }: { children: ReactNode }) {
  const { panelMode } = useWorkspace()
  const columnOpen = useColumnOpen()
  return (
    <WorkspaceMain inert={panelMode === 'sheet' && columnOpen === true}>{children}</WorkspaceMain>
  )
}

/**
 * The one-page workspace, built so that the result is always in view:
 *
 * - a slim bar (plan, draft state, save; € switch, PDF, Menü);
 * - the result canvas, which scrolls with the page — the head (figures, the
 *   fan chart with the saved plan as a ghost, the changes) and under it
 *   Geldfluss, Entnahme and Wirkung;
 * - the dock, the head's collapsed form, pinned under the bar once the
 *   head's chart has scrolled away (always, below 1180 px);
 * - the control column with every input exactly once: a permanent pane from
 *   1180 px, a drawer at 761–1179, the mode "Stellen" on phones.
 *
 * Plan comparison is a mode of the same page: CompareView takes the canvas
 * and the column gives way.
 */
function WorkspacePage() {
  const t = useTranslations('workspace')
  const tp = useTranslations('plans')
  // Nothing here may subscribe to run state or results: a re-render of the
  // page is a re-render of every section, the column and the bar.
  const error = useSimulationStore((state) => state.error)
  const run = useSimulationStore((state) => state.runSimulation)
  const activePlan = useActivePlan()
  const { mode, exitCompare } = useWorkspace()

  useEffect(() => {
    const initialize = () => {
      const state = useSimulationStore.getState()
      if (isUsableResults(state.results) && state.results.cashFlowMeans) return
      // Persisted results are rehydrated unvalidated: a payload that cannot
      // be drawn is dropped (it would otherwise come back on every reload)
      // and replaced by a fresh run.
      if (state.results) state.clearResults()
      if (!state.isLoading) state.runSimulation()
    }
    // Without usable web storage the persist middleware is not installed
    // (`persist` is undefined) and the store starts in memory, hydrated.
    const persist = useSimulationStore.persist
    if (persist?.hasHydrated() ?? true) initialize()
    else return persist.onFinishHydration(initialize)
  }, [])

  // `R` recalculates, except while typing or inside a dialog. F6 moves
  // between the canvas and the control column (keyboard order: bar, head,
  // canvas, column — F6 is the shortcut across).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (event.key === 'F6') {
        const column = document.getElementById('edit-panel')
        const inColumn = Boolean(target && column?.contains(target))
        const next = inColumn
          ? document.getElementById('result-title')
          : document.getElementById('edit-panel-title')
        if (!next || next.getClientRects().length === 0) return
        event.preventDefault()
        next.focus({ preventScroll: inColumn ? false : true })
        return
      }
      if (!['r', 'R'].includes(event.key)) return
      if (target?.closest('input, select, textarea, [role="dialog"]') || target?.isContentEditable)
        return
      run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])

  const plan = activePlan ? planDisplayName(activePlan, tp) : t('brand')
  return (
    <WorkspaceFrame>
      <ResultBar />
      <ResultDock />
      <WorkspaceCanvas>
        <div className="ws-scroll-sentinel" data-scroll-sentinel aria-hidden="true" />
        <h1 className="sr-only">{t('pageTitle', { plan })}</h1>
        <StorageNotice className="ws-storage-notice" />
        {error && <WorkspaceError />}
        <div className="ws-sections" hidden={mode === 'compare'}>
          {/* The sections read a deferred copy of the results: when a run
              lands, the head's figures and the dock (which read the store)
              commit first and the charts follow in an interruptible render.
              Each section fails on its own: the rest keeps working. */}
          <DeferredResultsScope>
            {SECTIONS.map(({ id, Section }) => (
              <SectionBoundary
                key={id}
                name={`section-${id}`}
                section={{ id, title: t(`sections.${id}.title`) }}
              >
                <Section />
              </SectionBoundary>
            ))}
          </DeferredResultsScope>
          <footer className="ws-footer">{t('footer')}</footer>
        </div>
        {mode === 'compare' && (
          <SectionBoundary name="compare">
            <CompareView
              onExit={() => exitCompare()}
              onOpenPlanEditor={() => exitCompare({ column: true })}
            />
          </SectionBoundary>
        )}
      </WorkspaceCanvas>
      <EditPanel />
      <ModeBar />
      {/* The one live region for results; outside everything that can go inert. */}
      <ResultAnnouncer />
    </WorkspaceFrame>
  )
}

export default function SimulationPage() {
  return (
    <WorkspaceProvider>
      <WorkspacePage />
    </WorkspaceProvider>
  )
}
