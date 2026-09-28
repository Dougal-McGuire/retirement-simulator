'use client'

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Check, CircleAlert, CopyPlus, LoaderCircle, RotateCw, Save, Undo2 } from 'lucide-react'
import { MAX_PLANS, type Plan } from '@/types'
import {
  useActivePlan,
  useActivePlanId,
  usePlanIsDirty,
  useRevertPlanDraft,
  useSavePlanDraft,
  useSimulationLoading,
  useSimulationStore,
  useUpdateParams,
} from '@/lib/stores/simulationStore'
import { useDisplayReal } from '@/lib/stores/displayStore'
import { useComparisonStore, useSetComparisonSelection } from '@/lib/stores/comparisonStore'
import { planDisplayName } from '@/lib/plans/planName'
import { DashboardTools } from '@/components/simulation-compact/DashboardTools'
import { buildCompactKpis } from '@/components/simulation-compact/metrics'
import { formatBarEuro } from '@/components/simulation-compact/format'
import { ActionToast } from '@/components/ui/action-toast'
import { toast, TOAST_DURATION } from '@/components/ui/toast'
import { AnimatedNumber } from './AnimatedNumber'
import { PlanMenu } from './PlanMenu'
import { Skeleton } from './Skeleton'
import { selectResultsStale, useRunStatus, type RunStatus } from './useRunStatus'
import { useSavedSuccessDelta } from './useSavedSuccessDelta'
import { useWorkspace } from './WorkspaceProvider'

const PlanManagerDialog = dynamic(
  () => import('./PlanManagerDialog').then((module) => module.PlanManagerDialog),
  { ssr: false }
)
const SaveDraftAsPlanDialog = dynamic(
  () =>
    import('@/components/plans/SaveDraftAsPlanDialog').then(
      (module) => module.SaveDraftAsPlanDialog
    ),
  { ssr: false }
)

/**
 * The bar's clusters are memoized and read their own narrow slices of the
 * store, so a keystroke, the run starting and the run landing each re-render
 * only the cluster that shows the change (§7: edit → bar ≤ 250 ms). The bar
 * root itself holds only what its attributes need.
 */
const MemoPlanMenu = memo(PlanMenu)
const MemoDashboardTools = memo(DashboardTools)

/** The most recently updated plan other than the active one. */
function latestOther(plans: Plan[], activeId: string): Plan | null {
  return plans
    .filter((plan) => plan.id !== activeId)
    .reduce<Plan | null>(
      (latest, plan) => (!latest || plan.updatedAt > latest.updatedAt ? plan : latest),
      null
    )
}

// ---- KPIs -------------------------------------------------------------------

/**
 * Success rate (with the saved-plan delta) and median end assets. The only
 * cluster that re-renders when a run lands; it reads the store's results
 * directly (never a deferred copy), so it is the first thing to update.
 */
const BarKpis = memo(function BarKpis() {
  const t = useTranslations('workspace')
  const format = useFormatter()
  const locale = useLocale()
  const results = useSimulationStore((state) => state.results)
  const displayReal = useDisplayReal()
  const delta = useSavedSuccessDelta()

  const kpis = useMemo(
    () => (results ? buildCompactKpis(results.params, results, { displayReal }) : null),
    [results, displayReal]
  )
  const formatRate = useCallback(
    (value: number) =>
      format.number(value / 100, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [format]
  )
  const formatEnd = useCallback((value: number) => formatBarEuro(value, locale), [locale])
  const rate = results ? Math.round(results.successRate * 10) / 10 : null
  const rateValue = rate === null ? undefined : String(rate)
  const end = kpis ? Math.round(kpis.medianEndWealth) : null
  const endValue = end === null ? undefined : String(end)

  return (
    <dl className="ws-bar-dl">
      <div className="ws-bar-kpi" data-kpi="success">
        <dt>
          <span className="ws-bar-label-long">{t('bar.success')}</span>
          <span className="ws-bar-label-short">{t('bar.successShort')}</span>
        </dt>
        <dd className="ws-bar-value" data-testid="success-pill" data-value={rateValue}>
          {rate === null ? (
            <Skeleton width={72} height={20} />
          ) : (
            <AnimatedNumber value={rate} format={formatRate} />
          )}
        </dd>
        {delta.text && (
          <dd
            className={`ws-bar-delta ds-delta ds-delta--${delta.tone}`}
            data-testid="success-delta"
            data-value={delta.delta ?? undefined}
            data-pending={delta.pending ? 'true' : undefined}
          >
            <span className="ws-bar-delta-full" aria-hidden="true">
              {delta.text}
            </span>
            <span className="ws-bar-delta-short" aria-hidden="true">
              {delta.short}
            </span>
            <span className="sr-only">{t('bar.deltaAria', { delta: delta.text })}</span>
          </dd>
        )}
      </div>
      <div className="ws-bar-kpi" data-kpi="end">
        <dt>
          <span className="ws-bar-label-long">{t('bar.endAssets')}</span>
          <span className="ws-bar-label-short">{t('bar.endAssetsShort')}</span>
        </dt>
        <dd className="ws-bar-value" data-testid="end-assets" data-value={endValue}>
          {end === null ? (
            <Skeleton width={72} height={20} />
          ) : (
            <AnimatedNumber value={end} format={formatEnd} />
          )}
        </dd>
      </div>
    </dl>
  )
})

// ---- Run status and Recalculate --------------------------------------------

const statusIcon = {
  running: LoaderCircle,
  updated: Check,
  stale: CircleAlert,
  empty: CircleAlert,
} as const

const BarRun = memo(function BarRun({
  status,
  needsRun,
}: {
  status: RunStatus
  needsRun: boolean
}) {
  const t = useTranslations('workspace')
  const loading = useSimulationLoading()
  const run = useSimulationStore((state) => state.runSimulation)
  const StatusIcon = statusIcon[status]
  return (
    <div className="ws-bar-run">
      <span
        className="workspace-run-state ws-bar-status"
        data-state={status}
        data-testid="run-status"
        role="status"
        aria-live="polite"
        title={t(`status.${status}`)}
      >
        <StatusIcon size={16} aria-hidden="true" />
        <span className="sr-only">{t(`status.${status}`)}</span>
      </span>
      {/* Auto-run keeps results current and the engine is seeded, so this
          is a quiet icon that only asks for attention (and shows its
          label) when results are actually out of date. */}
      <button
        type="button"
        className={`workspace-button ws-bar-run-button ${needsRun ? 'workspace-button-primary' : 'workspace-button-quiet'}`}
        data-testid="run-button"
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
    </div>
  )
})

// ---- Draft cluster: marker, Discard (with undo), Save -----------------------

const BarDraft = memo(function BarDraft({
  dirty,
  activeName,
  onSaveAsNew,
}: {
  dirty: boolean
  activeName: string
  /** "Als neuen Plan speichern …": receives the button for focus return. */
  onSaveAsNew: (trigger: HTMLButtonElement | null) => void
}) {
  const t = useTranslations('workspace')
  const tp = useTranslations('plans')
  const tc = useTranslations('simulationCompact.commandBar')
  const activePlanId = useActivePlanId()
  const save = useSavePlanDraft()
  const revert = useRevertPlanDraft()
  const updateParams = useUpdateParams()
  // At the plan limit there is no room for a variant: the button stays in its
  // place (so the bar does not jump) but says why it does nothing, like the
  // plan menu's item.
  const atPlanLimit = useSimulationStore((state) => state.plans.length >= MAX_PLANS)
  const limitHint = tp('switcher.limit', { max: MAX_PLANS })
  const limitHintId = useId()

  // ---- Discard with undo (moved verbatim from WorkspaceHeader) ------------

  // The "discarded" toast belongs to the plan it names: once another plan is
  // active its Undo could no longer apply, so the toast goes with the switch.
  const discardToastRef = useRef<{ id: string; planId: string | null } | null>(null)
  useEffect(() => {
    const pending = discardToastRef.current
    if (pending && pending.planId !== activePlanId) {
      toast.dismiss(pending.id)
      discardToastRef.current = null
    }
  }, [activePlanId])

  // Discard needs no confirmation because it can be undone: the working copy
  // is snapshotted first and written back (still unsaved) on undo — as long as
  // the same plan is still active, so an undo can never land on another plan.
  const discard = () => {
    const { params: snapshot, activePlanId: planId } = useSimulationStore.getState()
    revert()
    if (discardToastRef.current) toast.dismiss(discardToastRef.current.id)
    const id = toast(
      (instance) => (
        <ActionToast
          testId="plan-discarded-toast"
          message={t('discardedToast', { name: activeName })}
          actions={[
            {
              label: tp('actions.undo'),
              tone: 'primary',
              testId: 'plan-discarded-toast-undo',
              onClick: () => {
                toast.dismiss(instance.id)
                discardToastRef.current = null
                if (useSimulationStore.getState().activePlanId !== planId) return
                updateParams(snapshot)
              },
            },
          ]}
        />
      ),
      { duration: TOAST_DURATION }
    )
    discardToastRef.current = { id, planId }
  }

  return (
    <div className="ws-bar-draft">
      {dirty ? (
        <>
          <span className="ws-bar-marker" data-state="dirty">
            <span className="workspace-dirty-dot" aria-hidden="true" />
            <span className="ws-bar-marker-long">{t('unsaved')}</span>
            <span className="ws-bar-marker-short">{t('unsavedShort')}</span>
          </span>
          <button
            type="button"
            className="workspace-button workspace-button-quiet ws-bar-discard"
            data-testid="command-discard"
            aria-label={tp('dirty.ariaRevert', { name: activeName })}
            title={t('discard')}
            onClick={discard}
          >
            <Undo2 size={16} aria-hidden="true" />
            {/* Collapses to the icon where the bar runs out of room; the
                button keeps its accessible name (aria-label) and title. */}
            <span className="ws-discard-label">{t('discard')}</span>
          </button>
          <button
            type="button"
            className="workspace-button workspace-button-primary ws-bar-save"
            data-testid="command-save"
            aria-label={tp('dirty.ariaSave', { name: activeName })}
            onClick={() => save()}
          >
            <Save size={16} aria-hidden="true" />
            {tc('saveButton')}
          </button>
          {/* Keep the changes as a variant instead: an icon beside Save where
              the bar has room (≥1600); below that it is the first item of
              the plan menu. */}
          <button
            type="button"
            className="workspace-button workspace-button-quiet ws-bar-save-as"
            data-testid="command-save-as-new"
            aria-label={t('bar.saveAsNew')}
            aria-haspopup={atPlanLimit ? undefined : 'dialog'}
            aria-disabled={atPlanLimit || undefined}
            aria-describedby={atPlanLimit ? limitHintId : undefined}
            title={atPlanLimit ? `${t('bar.saveAsNew')} – ${limitHint}` : t('bar.saveAsNew')}
            onClick={(event) => {
              if (atPlanLimit) return
              onSaveAsNew(event.currentTarget)
            }}
          >
            <CopyPlus size={16} aria-hidden="true" />
            {atPlanLimit && (
              <span id={limitHintId} className="sr-only">
                {limitHint}
              </span>
            )}
          </button>
        </>
      ) : (
        <span className="ws-bar-saved" data-state="saved">
          <Check size={14} aria-hidden="true" />
          {t('saved')}
        </span>
      )}
    </div>
  )
})

// ---- Menu -----------------------------------------------------------------

/** The report reads current results only; stale ones are withheld (as before). */
const BarMenu = memo(function BarMenu() {
  const results = useSimulationStore((state) => state.results)
  const stale = useSimulationStore(selectResultsStale)
  const loading = useSimulationLoading()
  return (
    <div className="ws-bar-menu">
      <MemoDashboardTools results={stale ? null : results} isLoading={loading} />
    </div>
  )
})

/**
 * The sticky result bar: cause and effect on one strip. The success rate and
 * median end assets stay on screen (and update live) while any panel is
 * open; the draft cluster owns the one Save / Discard; the plan menu and the
 * Menu sit at the end. Replaces the old `WorkspaceHeader` — the discard/undo
 * toast logic is moved verbatim.
 */
export function ResultBar() {
  const t = useTranslations('workspace')
  const tp = useTranslations('plans')
  const activePlan = useActivePlan()
  const dirty = usePlanIsDirty()
  const setComparisonSelection = useSetComparisonSelection()
  const { status, needsRun } = useRunStatus()
  const { enterCompare, barInert } = useWorkspace()

  const activeName = activePlan ? planDisplayName(activePlan, tp) : ''

  // ---- Cmd/Ctrl+S: page level, always active -----------------------------

  const activeNameRef = useRef(activeName)
  useEffect(() => {
    activeNameRef.current = activeName
  }, [activeName])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 's' || !(event.metaKey || event.ctrlKey)) return
      if (event.altKey || event.shiftKey) return
      // The browser's "save page" dialog is never what the workspace means.
      event.preventDefault()
      const state = useSimulationStore.getState()
      if (!state.isDirty) return
      state.savePlanDraft()
      toast.success(tp('dirty.savedToast', { name: activeNameRef.current }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tp])

  // ---- Elevation once the page scrolls -----------------------------------

  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const sentinel = document.querySelector('[data-scroll-sentinel]')
    if (!sentinel || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting))
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  // ---- Plan manager and compare entry ------------------------------------

  const [managerOpen, setManagerOpen] = useState(false)
  const [managerMounted, setManagerMounted] = useState(false)
  const planTriggerRef = useRef<HTMLElement | null>(null)

  // ---- Save the draft as a new plan ---------------------------------------

  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [saveAsMounted, setSaveAsMounted] = useState(false)
  const saveAsInvokerRef = useRef<HTMLElement | null>(null)
  const saveAsNew = useCallback((trigger: HTMLButtonElement | null) => {
    saveAsInvokerRef.current = trigger
    setSaveAsMounted(true)
    setSaveAsOpen(true)
  }, [])
  const compareWithNew = useCallback(
    (sourceId: string, newPlanId: string) => {
      setComparisonSelection([sourceId, newPlanId])
      const invoker = saveAsInvokerRef.current
      enterCompare(invoker?.isConnected ? invoker : null)
    },
    [enterCompare, setComparisonSelection]
  )

  // Stable, so the memoized plan menu does not re-render with the bar.
  const manage = useCallback((trigger: HTMLButtonElement | null) => {
    planTriggerRef.current = trigger
    setManagerMounted(true)
    setManagerOpen(true)
  }, [])

  const compare = useCallback(
    (trigger: HTMLButtonElement | null) => {
      const { plans, activePlanId } = useSimulationStore.getState()
      // Keep a stored lineup that still names the active plan and a challenger;
      // otherwise line up the most recently updated other plan (or none).
      const stored = useComparisonStore
        .getState()
        .selectedIds.filter((id) => plans.some((plan) => plan.id === id))
      if (!(stored.includes(activePlanId) && stored.length >= 2)) {
        const other = latestOther(plans, activePlanId)
        setComparisonSelection(other ? [activePlanId, other.id] : [activePlanId])
      }
      enterCompare(trigger)
    },
    [enterCompare, setComparisonSelection]
  )

  return (
    <header
      className="ws-bar"
      data-testid="result-bar"
      data-sticky-chrome="true"
      data-dirty={dirty ? 'true' : undefined}
      data-scrolled={scrolled ? 'true' : undefined}
      data-running={status === 'running' ? 'true' : undefined}
      data-needs-run={needsRun ? 'true' : undefined}
      aria-label={t('bar.label')}
      inert={barInert}
    >
      <div className="ws-bar-plan">
        <MemoPlanMenu onManage={manage} onCompare={compare} onSaveAsNew={saveAsNew} />
      </div>

      <div className="ws-bar-kpis" data-testid="result-bar-kpis">
        <BarKpis />
        <BarRun status={status} needsRun={needsRun} />
      </div>

      <BarDraft dirty={dirty} activeName={activeName} onSaveAsNew={saveAsNew} />

      <BarMenu />

      {managerMounted && (
        <PlanManagerDialog
          open={managerOpen}
          onOpenChange={setManagerOpen}
          returnFocusRef={planTriggerRef}
        />
      )}
      {saveAsMounted && (
        <SaveDraftAsPlanDialog
          open={saveAsOpen}
          onOpenChange={setSaveAsOpen}
          returnFocusRef={saveAsInvokerRef}
          onCompare={compareWithNew}
        />
      )}
    </header>
  )
}
