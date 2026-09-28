'use client'

import { useEffect, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { planDisplayName } from '@/lib/plans/planName'
import {
  DeferredResultsScope,
  useActivePlan,
  useSimulationLoading,
  useSimulationStore,
} from '@/lib/stores/simulationStore'
import { EuroDisplay } from '@/components/workspace/EuroDisplay'
import { EditPanel } from '@/components/workspace/edit/EditPanel'
import { ResultBar } from '@/components/workspace/ResultBar'
import { SectionIndex } from '@/components/workspace/SectionIndex'
import { useRunStatus } from '@/components/workspace/useRunStatus'
import { WorkspaceBrand } from '@/components/workspace/WorkspaceShell'
import {
  WorkspaceProvider,
  useWorkspace,
  useWorkspaceInternals,
} from '@/components/workspace/WorkspaceProvider'
import { AssumptionsSection } from '@/components/workspace/sections/AssumptionsSection'
import { CashflowSection } from '@/components/workspace/sections/CashflowSection'
import { LeversSection } from '@/components/workspace/sections/LeversSection'
import { ResultSection } from '@/components/workspace/sections/ResultSection'
import { WithdrawalSection } from '@/components/workspace/sections/WithdrawalSection'
import './workspace.css'
import './ws-page.css'

const CompareView = dynamic(
  () => import('@/components/simulation-compact/CompareView').then((module) => module.CompareView),
  { ssr: false }
)

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
 * `<main>` and its run-state attributes. Only this element re-renders when a
 * run starts, lands or stops holding "running": the sections arrive as
 * `children` created by the page, which does not re-render for runs, so React
 * skips them here (§7 render isolation).
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
 * The one-page workspace: a sticky result bar, five sections indexed by one
 * navigation (rail / chip row / bottom bar, by width), the assumptions in an
 * edit panel that leaves the results visible, and plan comparison as a mode
 * of the same page.
 */
function WorkspacePage() {
  const t = useTranslations('workspace')
  const tp = useTranslations('plans')
  // Nothing here may subscribe to run state or results: a re-render of the
  // page is a re-render of every section, the panel and the bar.
  const error = useSimulationStore((state) => state.error)
  const run = useSimulationStore((state) => state.runSimulation)
  const activePlan = useActivePlan()
  const { mode, panelMode, editor, pageInert, exitCompare } = useWorkspace()
  const { pageRef } = useWorkspaceInternals()

  useEffect(() => {
    const initialize = () => {
      const state = useSimulationStore.getState()
      if ((!state.results || !state.results.cashFlowMeans) && !state.isLoading)
        state.runSimulation()
    }
    if (useSimulationStore.persist.hasHydrated()) initialize()
    else return useSimulationStore.persist.onFinishHydration(initialize)
  }, [])

  // `R` recalculates, except while typing or inside a dialog (the edit panel
  // is a dialog too).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!['r', 'R'].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, select, textarea, [role="dialog"]') || target?.isContentEditable)
        return
      run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])

  const plan = activePlan ? planDisplayName(activePlan, tp) : t('brand')
  return (
    <div
      ref={pageRef}
      className="ws-page"
      data-mode={mode}
      data-panel-mode={panelMode}
      data-panel-open={editor ? 'true' : undefined}
    >
      <aside className="ws-rail" inert={pageInert}>
        <WorkspaceBrand />
        <SectionIndex />
        <div className="ws-rail-footer">
          <EuroDisplay />
        </div>
      </aside>
      <ResultBar />
      <WorkspaceMain inert={pageInert}>
        <div className="ws-scroll-sentinel" data-scroll-sentinel aria-hidden="true" />
        <h1 className="sr-only">{t('pageTitle', { plan })}</h1>
        {error && <WorkspaceError />}
        <div className="ws-sections" hidden={mode === 'compare'}>
          {/* The sections read a deferred copy of the results: when a run
              lands, the result bar (outside) commits first and the charts
              below follow in an interruptible render. */}
          <DeferredResultsScope>
            <ResultSection />
            <AssumptionsSection />
            <CashflowSection />
            <WithdrawalSection />
            <LeversSection />
          </DeferredResultsScope>
          <footer className="ws-footer">{t('footer')}</footer>
        </div>
        {mode === 'compare' && (
          <CompareView
            onExit={() => exitCompare()}
            onOpenPlanEditor={() => exitCompare({ section: 'assumptions', focus: true })}
          />
        )}
      </WorkspaceMain>
      <EditPanel />
    </div>
  )
}

export default function SimulationPage() {
  return (
    <WorkspaceProvider>
      <WorkspacePage />
    </WorkspaceProvider>
  )
}
