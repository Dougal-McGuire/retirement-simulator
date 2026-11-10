'use client'

import { memo, useCallback, useMemo } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Check, CircleAlert, LoaderCircle, RotateCw } from 'lucide-react'
import type { SimulationResults } from '@/types'
import { buildCompactKpis, type CompactKpis } from '@/components/simulation-compact/metrics'
import { useMoney } from '@/lib/hooks/useMoney'
import { useDisplayReal } from '@/lib/stores/displayStore'
import { useSimulationLoading, useSimulationStore } from '@/lib/stores/simulationStore'
import { AnimatedNumber } from './AnimatedNumber'
import { moneyDeltaTone, QUIET_DELTA_EUROS } from './savedDelta'
import { Skeleton } from './Skeleton'
import { useRunStatus, type RunStatus } from './useRunStatus'
import { useSavedPlanResults } from './useSavedPlanResults'
import { useSavedSuccessDelta } from './useSavedSuccessDelta'
import { useUsableStoreResults } from './useUsableResults'
import { useDockPinned } from './useWorkspaceUiStore'

/**
 * The figures of the always-visible result area, shared by its two forms:
 * the head (top of the canvas) and the dock (pinned under the bar). They
 * read the store's results directly — never a deferred copy — so they are
 * the first thing to update when a run lands; the charts follow.
 *
 * Both forms can be mounted at once, but only one is the result surface in
 * view (`dockPinned`). That one carries the contract's test ids
 * (`success-pill`, `success-delta`, `end-assets`, `run-status`,
 * `run-button`); the other prefixes them with its own name (`head-…`,
 * `dock-…`), so an id always names exactly one element — the one on screen.
 */
export type ResultSurface = 'head' | 'dock'

export function useFigureId(surface: ResultSurface): (id: string) => string {
  const pinned = useDockPinned()
  const inView = pinned ? surface === 'dock' : surface === 'head'
  return useCallback((id: string) => (inView ? id : `${surface}-${id}`), [inView, surface])
}

export interface ResultFigureData {
  results: SimulationResults | null
  kpis: CompactKpis | null
  /** Success rate, rounded to the one decimal shown. */
  rate: number | null
  /** Median end assets in the unit the € switch selects, whole euros. */
  end: number | null
}

/** The current result's headline figures (urgent: straight from the store). */
export function useResultFigures(): ResultFigureData {
  const results = useUsableStoreResults()
  const displayReal = useDisplayReal()
  const kpis = useMemo(
    () => (results ? buildCompactKpis(results.params, results, { displayReal }) : null),
    [results, displayReal]
  )
  return {
    results,
    kpis,
    rate: results ? Math.round(results.successRate * 10) / 10 : null,
    end: kpis ? Math.round(kpis.medianEndWealth) : null,
  }
}

/** The saved plan's median end assets while the plan is dirty (same € unit). */
export function useSavedEndAssets(): number | null {
  const saved = useSavedPlanResults()
  const displayReal = useDisplayReal()
  return useMemo(
    () =>
      saved
        ? Math.round(buildCompactKpis(saved.params, saved, { displayReal }).medianEndWealth)
        : null,
    [saved, displayReal]
  )
}

export function useRateFormat(): (value: number) => string {
  const format = useFormatter()
  return useCallback(
    (value: number) =>
      format.number(value / 100, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [format]
  )
}

/** The success rate: the one large numeral of the head, the dock's first figure. */
export const RateFigure = memo(function RateFigure({
  surface,
  rate,
}: {
  surface: ResultSurface
  rate: number | null
}) {
  const id = useFigureId(surface)
  const formatRate = useRateFormat()
  return (
    <span
      className="ws-figure ws-figure-rate"
      data-testid={id('success-pill')}
      data-value={rate === null ? undefined : String(rate)}
    >
      {rate === null ? (
        <Skeleton width={72} height={20} />
      ) : (
        <AnimatedNumber value={rate} format={formatRate} />
      )}
    </span>
  )
})

/**
 * The delta chip against the saved plan. Its slot is always there and keeps
 * its width, so nothing beside it moves when the plan turns dirty.
 */
export const RateDelta = memo(function RateDelta({ surface }: { surface: ResultSurface }) {
  const t = useTranslations('workspace')
  const id = useFigureId(surface)
  const delta = useSavedSuccessDelta()
  return (
    <span className="ws-figure-slot" data-slot="rate-delta">
      {delta.text && (
        <span
          className={`ws-figure-delta ds-delta ds-delta--${delta.tone}`}
          data-testid={id('success-delta')}
          data-value={delta.delta ?? undefined}
          data-pending={delta.pending ? 'true' : undefined}
        >
          <span aria-hidden="true">{delta.text}</span>
          <span className="sr-only">{t('bar.deltaAria', { delta: delta.text })}</span>
        </span>
      )}
    </span>
  )
})

/** Median end assets, compact ("2,21 Mio €"). */
export const EndFigure = memo(function EndFigure({
  surface,
  end,
}: {
  surface: ResultSurface
  end: number | null
}) {
  const id = useFigureId(surface)
  const formatEnd = useMoney().compact
  return (
    <span
      className="ws-figure ws-figure-end"
      data-testid={id('end-assets')}
      data-value={end === null ? undefined : String(end)}
    >
      {end === null ? (
        <Skeleton width={72} height={18} />
      ) : (
        <AnimatedNumber value={end} format={formatEnd} />
      )}
    </span>
  )
})

/** End assets against the saved plan: "+360 T€", in its own reserved slot. */
export const EndDelta = memo(function EndDelta({
  surface,
  end,
}: {
  surface: ResultSurface
  end: number | null
}) {
  const t = useTranslations('workspace')
  const id = useFigureId(surface)
  const money = useMoney()
  const savedEnd = useSavedEndAssets()
  const delta = end !== null && savedEnd !== null ? end - savedEnd : null
  // Compact like the figure beside it ("+360 T€", "−1,20 Mio €"); what would
  // round to "0 T€" stays quiet.
  const text =
    delta === null
      ? null
      : Math.abs(delta) < QUIET_DELTA_EUROS
        ? '±0'
        : `${delta > 0 ? '+' : '−'}${money.compact(Math.abs(delta))}`
  return (
    <span className="ws-figure-slot" data-slot="end-delta">
      {text !== null && delta !== null && (
        <span
          className="ws-figure-money-delta"
          data-tone={moneyDeltaTone(delta)}
          data-testid={id('end-assets-delta')}
          data-value={delta}
        >
          <span aria-hidden="true">{text}</span>
          <span className="sr-only">{t('bar.deltaAria', { delta: text })}</span>
        </span>
      )}
    </span>
  )
})

const statusIcon = {
  running: LoaderCircle,
  updated: Check,
  stale: CircleAlert,
  empty: CircleAlert,
} as const

/**
 * Run status and Recalculate. Auto-run keeps results current and the engine
 * is seeded, so Recalculate is a quiet icon that only asks for attention
 * (and shows its label) when results are actually out of date. Not a live
 * region: the page's `ResultAnnouncer` speaks settled results.
 */
export const RunStatusFigure = memo(function RunStatusFigure({
  surface,
  status,
  needsRun,
  showLabel = false,
}: {
  surface: ResultSurface
  status: RunStatus
  needsRun: boolean
  /** Spell the status out beside its icon (the head has the room). */
  showLabel?: boolean
}) {
  const t = useTranslations('workspace')
  const id = useFigureId(surface)
  const loading = useSimulationLoading()
  const run = useSimulationStore((state) => state.runSimulation)
  const StatusIcon = statusIcon[status]
  return (
    <span className="ws-figure-run" data-needs-run={needsRun ? 'true' : undefined}>
      <span
        className="workspace-run-state ws-figure-status"
        data-state={status}
        data-testid={id('run-status')}
        title={t(`status.${status}`)}
      >
        <StatusIcon size={16} aria-hidden="true" />
        <span className={showLabel ? 'ws-figure-status-label' : 'sr-only'}>
          {t(`status.${status}`)}
        </span>
      </span>
      <button
        type="button"
        className={`workspace-button ws-figure-run-button ${needsRun ? 'workspace-button-primary' : 'workspace-button-quiet'}`}
        data-testid={id('run-button')}
        data-needs-run={needsRun ? 'true' : undefined}
        disabled={loading}
        title={t('calculateHint')}
        aria-label={t('calculate')}
        onClick={() => run()}
      >
        <RotateCw size={16} aria-hidden="true" />
        <span className="ws-run-label" aria-hidden="true">
          {t('calculate')}
        </span>
      </button>
    </span>
  )
})

/** `useRunStatus()` for a surface that renders `RunStatusFigure`. */
export { useRunStatus }
