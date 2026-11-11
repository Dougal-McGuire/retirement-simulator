'use client'

import { memo, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { FanChartCard } from '@/components/simulation-compact/FanChartCard'
import { SectionBoundary } from '@/components/errors/SectionBoundary'
import { useMoney } from '@/lib/hooks/useMoney'
import { useDisplayReal } from '@/lib/stores/displayStore'
import { usePlanIsDirty, useSimulationStore } from '@/lib/stores/simulationStore'
import { simulationContextOf } from '@/lib/stores/useSimulationContext'
import { ChangeRow } from '../ChangeChips'
import {
  EndDelta,
  EndFigure,
  RateDelta,
  RateFigure,
  RunStatusFigure,
  useResultFigures,
  useRunStatus,
} from '../ResultFigures'
import { SectionAnchors } from '../SectionIndex'
import { Skeleton } from '../Skeleton'
import { useSavedPlanResults } from '../useSavedPlanResults'
import { useUsableResults } from '../useUsableResults'
import { useWorkspace } from '../WorkspaceProvider'
import './result.css'

/**
 * The head's two lines of figures. Reads the store's results directly (never
 * the page's deferred copy) and nothing else re-renders with it, so it is
 * the first thing to commit when a run lands — before the chart below it
 * and every section under it.
 *
 * Rate line: the one large numeral, its delta against the saved plan, one
 * plain sentence, the run status. Facts line: how long the money lasts, what
 * is left at the end (with its own delta), the first withdrawal, and the bad
 * case in muted text. Below 1180 px the dock above carries the numeral, the
 * delta and the status; the sentence and the facts stay here.
 */
const HeadNumbers = memo(function HeadNumbers() {
  const t = useTranslations('workspace')
  const tu = useTranslations('workspace.units')
  const money = useMoney()
  const { results, kpis, rate, end } = useResultFigures()
  const { status, needsRun } = useRunStatus()
  const endAge = useSimulationStore((state) => state.params.endAge)
  const { scrollToSection } = useWorkspace()
  const context = useMemo(
    () => (results ? simulationContextOf(results.params, results) : null),
    [results]
  )

  const sentence =
    results && context && rate !== null
      ? t(
          context.successDefinition === 'legacyConditioned'
            ? 'verdict.sentenceLegacy'
            : 'verdict.sentence',
          { count: Math.round(rate), end: results.params.endAge }
        )
      : null
  const horizon = results?.params.endAge ?? endAge

  return (
    <>
      <div
        className="ws-head-rate"
        data-testid="verdict"
        data-running={status === 'running' ? 'true' : undefined}
      >
        <span className="ws-head-figures">
          <RateFigure surface="head" rate={rate} />
          <RateDelta surface="head" />
        </span>
        <p className="ws-head-sentence">
          {sentence ?? (
            <span className="ws-ghost">{t('verdict.sentence', { count: 88, end: endAge })}</span>
          )}
        </p>
        <span className="ws-head-run">
          <RunStatusFigure surface="head" status={status} needsRun={needsRun} showLabel />
        </span>
      </div>

      <dl
        className="ws-head-facts"
        data-testid="kpi-strip"
        data-running={status === 'running' ? 'true' : undefined}
      >
        <div data-fact="lasts">
          <dt>{t('head.lastsTo')}</dt>
          <dd className="ws-head-fact">
            {kpis ? (
              kpis.lastsToMedian === null ? (
                `${horizon}+`
              ) : (
                String(kpis.lastsToMedian)
              )
            ) : (
              <Skeleton width={36} height={16} />
            )}
          </dd>
        </div>
        <div data-fact="end">
          <dt>{t('head.atEnd')}</dt>
          <dd className="ws-head-fact">
            <EndFigure surface="head" end={end} />
          </dd>
          <dd className="ws-head-fact-delta">
            <EndDelta surface="head" end={end} />
          </dd>
        </div>
        <div data-fact="draw">
          <dt>{t('head.firstDraw')}</dt>
          <dd className="ws-head-fact">
            {kpis ? (
              <button
                type="button"
                className="ws-link-button"
                title={t('head.firstDrawHint')}
                onClick={() => scrollToSection('withdrawal', { focus: true })}
              >
                {tu('monthly', { amount: money.full(Math.round(kpis.firstYearWithdrawalMonthly)) })}
              </button>
            ) : (
              <Skeleton width={96} height={16} />
            )}
          </dd>
        </div>
        <div className="ws-head-fact-quiet" data-fact="bad">
          <dt>{t('head.badCase')}</dt>
          <dd>{kpis ? money.compact(kpis.p10EndWealth) : '—'}</dd>
        </div>
      </dl>
    </>
  )
})

/** The fan chart only redraws for a new result, ghost, display mode or scale hold. */
const MemoFanChartCard = memo(FanChartCard)

/** The chart's frame before the first result, at its final height. */
function FanSkeleton() {
  const t = useTranslations('simulationCompact.chart')
  return (
    <div className="ws-fan" aria-hidden="true">
      <div className="ws-fan-head">
        <span className="ws-fan-title">{t('title')}</span>
      </div>
      <Skeleton variant="chart" height="var(--ws-fan-plot-h)" />
      <div className="ws-chart-axis" />
    </div>
  )
}

/**
 * The head's picture. Inside the page's deferred results scope: when a run
 * lands, the figures above commit first and the fan follows in an
 * interruptible render. While the plan is dirty the saved plan's result is
 * drawn under it as a ghost and the value axis holds still.
 */
const HeadChart = memo(function HeadChart() {
  const results = useUsableResults()
  const displayReal = useDisplayReal()
  const dirty = usePlanIsDirty()
  const ghost = useSavedPlanResults()
  if (!results) return <FanSkeleton />
  return (
    <SectionBoundary name="chart-fan">
      <MemoFanChartCard
        results={results}
        displayReal={displayReal}
        ghost={ghost}
        holdScale={dirty}
      />
    </SectionBoundary>
  )
})

/**
 * The result head (`#result`): the top of the canvas and the full form of
 * the always-visible result area — figures, the fan chart with the saved
 * plan as a ghost, the row of changes, and the three anchors into the canvas
 * below. Once less than half of its chart is on screen, the dock takes over.
 */
export const ResultHead = memo(function ResultHead() {
  const t = useTranslations('workspace')
  return (
    <section
      id="result"
      aria-labelledby="result-title"
      className="ws-section ws-head"
      data-section="result"
    >
      <h2 id="result-title" tabIndex={-1} className="sr-only">
        {t('sections.result.title')}
      </h2>
      <HeadNumbers />
      <div className="ws-head-chart" data-head-chart>
        <HeadChart />
      </div>
      <ChangeRow />
      <SectionAnchors />
    </section>
  )
})
