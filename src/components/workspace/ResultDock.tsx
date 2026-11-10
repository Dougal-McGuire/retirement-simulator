'use client'

import { memo, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { MiniFanChart } from '@/components/simulation-compact/MiniFanChart'
import { useDisplayReal } from '@/lib/stores/displayStore'
import { usePlanIsDirty } from '@/lib/stores/simulationStore'
import { ChangeMenu } from './ChangeChips'
import {
  EndDelta,
  EndFigure,
  RateDelta,
  RateFigure,
  RunStatusFigure,
  useResultFigures,
  useRunStatus,
} from './ResultFigures'
import { useSavedPlanResults } from './useSavedPlanResults'
import { useDockPinned, useWorkspaceUiStore } from './useWorkspaceUiStore'
import { useWorkspace } from './WorkspaceProvider'

/** The bar's height: the head's chart counts as "in view" below it. */
const BAR_HEIGHT = 48

/**
 * Decides which form of the result area is in view. Below 1180 px (and in
 * compare mode, where the head gives way) the dock is always pinned. From
 * 1180 px one IntersectionObserver watches the head's chart: once less than
 * half of it is on screen under the bar, the dock takes over — no scroll
 * handler, no layout work while scrolling.
 */
function useDockPinning() {
  const { panelMode, mode } = useWorkspace()
  useEffect(() => {
    const { setDockPinned } = useWorkspaceUiStore.getState()
    if (panelMode !== 'docked' || mode === 'compare') {
      setDockPinned(true)
      return
    }
    const chart = document.querySelector('[data-head-chart]')
    if (!chart || typeof IntersectionObserver === 'undefined') {
      setDockPinned(false)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => setDockPinned(entry.intersectionRatio < 0.5),
      { threshold: [0.5], rootMargin: `-${BAR_HEIGHT}px 0px 0px 0px` }
    )
    observer.observe(chart)
    return () => observer.disconnect()
  }, [panelMode, mode])
}

/** The dock's picture: the head's fan in small, with the saved plan's median as a ghost. */
const DockChart = memo(function DockChart() {
  const t = useTranslations('workspace.dock')
  const { results } = useResultFigures()
  const displayReal = useDisplayReal()
  const dirty = usePlanIsDirty()
  const ghost = useSavedPlanResults()
  const { scrollToSection } = useWorkspace()
  return (
    <button
      type="button"
      className="ws-dock-chart"
      data-testid="dock-chart"
      aria-label={t('toHead')}
      title={t('toHead')}
      onClick={() => scrollToSection('result', { focus: true })}
    >
      {results && (
        <MiniFanChart results={results} displayReal={displayReal} ghost={ghost} holdScale={dirty} />
      )}
    </button>
  )
})

/** The dock's figures: only this re-renders when a run lands. */
const DockFigures = memo(function DockFigures() {
  const t = useTranslations('workspace.dock')
  const { results, kpis, rate, end } = useResultFigures()
  const { status, needsRun } = useRunStatus()
  const horizon = results?.params.endAge
  const lastsTo = kpis
    ? kpis.lastsToMedian === null
      ? `${horizon}+`
      : String(kpis.lastsToMedian)
    : '—'
  return (
    <>
      <div className="ws-dock-rate" data-running={status === 'running' ? 'true' : undefined}>
        <span className="sr-only">{t('rate')}</span>
        <RateFigure surface="dock" rate={rate} />
        <RateDelta surface="dock" />
      </div>
      <div className="ws-dock-end" data-running={status === 'running' ? 'true' : undefined}>
        <span className="ws-dock-label">{t('end')}</span>
        <EndFigure surface="dock" end={end} />
        <EndDelta surface="dock" end={end} />
      </div>
      <div className="ws-dock-lasts">{t('lastsTo', { age: lastsTo })}</div>
      <div className="ws-dock-run">
        <RunStatusFigure surface="dock" status={status} needsRun={needsRun} />
      </div>
    </>
  )
})

/**
 * The dock: the collapsed form of the result head, a 96 px strip pinned
 * under the bar (88 px in two rows on phones) — success rate and its delta,
 * end assets and their delta, how long the money lasts, a mini chart with
 * the saved plan as a ghost, the list of changes and the run status.
 *
 * From 1180 px it appears once less than half of the head's chart is in
 * view; below that it is always pinned, and the drawer and the phone's
 * "Stellen" mode open below it. Every slot keeps its width, so nothing moves
 * when a delta appears. A tap on the mini chart goes back to the head.
 */
export const ResultDock = memo(function ResultDock() {
  const t = useTranslations('workspace.dock')
  useDockPinning()
  const pinned = useDockPinned()
  const { panelMode } = useWorkspace()
  // From 1180 px the dock is out of the way (and out of the tab order)
  // while the head is in view. Below, CSS shows it whatever this says.
  const idle = panelMode === 'docked' && !pinned
  return (
    <section
      className="ws-dock"
      data-testid="result-dock"
      data-result-dock
      data-sticky-chrome="true"
      data-pinned={pinned ? 'true' : 'false'}
      aria-label={t('label')}
      inert={idle}
    >
      <div className="ws-dock-inner">
        <DockFigures />
        <DockChart />
        <div className="ws-dock-changes-slot">
          <ChangeMenu />
        </div>
      </div>
    </section>
  )
})
