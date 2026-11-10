'use client'

import { memo, useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, CopyPlus, Download, Save, Undo2 } from 'lucide-react'
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
import { useComparisonStore, useSetComparisonSelection } from '@/lib/stores/comparisonStore'
import { planDisplayName } from '@/lib/plans/planName'
import { GenerateReportButton } from '@/components/GenerateReportButton'
import { DashboardTools } from '@/components/simulation-compact/DashboardTools'
import { SectionBoundary } from '@/components/errors/SectionBoundary'
import { lazyComponent } from '@/components/lazy/lazyComponent'
import { showActionToast } from '@/components/ui/action-toast'
import { toast } from '@/components/ui/toast'
import { EuroDisplay } from './EuroDisplay'
import { PlanMenu } from './PlanMenu'
import { Popover } from './Popover'
import { useDraftChangeCount } from './useDraftChanges'
import { selectResultsStale, useRunStatus } from './useRunStatus'
import { useUsableStoreResults } from './useUsableResults'
import { useWorkspace } from './WorkspaceProvider'

// Client-only and retryable (see `lazyComponent`): a dialog whose chunk does
// not arrive shows a small floating message with "Try again" instead of
// taking the page down.
const PlanManagerDialog = lazyComponent(() =>
  import('./PlanManagerDialog').then((module) => module.PlanManagerDialog)
)
const SaveDraftAsPlanDialog = lazyComponent(() =>
  import('@/components/plans/SaveDraftAsPlanDialog').then((module) => module.SaveDraftAsPlanDialog)
)

/**
 * The bar's clusters are memoized and read their own narrow slices of the
 * store, so a keystroke, the run starting and the run landing each re-render
 * only the cluster that shows the change. The bar root itself holds only
 * what its attributes need. The result's figures are not here any more:
 * they live in the head and the dock.
 */
const MemoPlanMenu = memo(PlanMenu)
const MemoDashboardTools = memo(DashboardTools)
const MemoEuroDisplay = memo(EuroDisplay)

/** The most recently updated plan other than the active one. */
function latestOther(plans: Plan[], activeId: string): Plan | null {
  return plans
    .filter((plan) => plan.id !== activeId)
    .reduce<Plan | null>(
      (latest, plan) => (!latest || plan.updatedAt > latest.updatedAt ? plan : latest),
      null
    )
}

// ---- Draft cluster: marker, Discard (with undo), Save ▾ ---------------------

/** "● 2 Änderungen": how much the draft holds. Re-renders only when the count moves. */
const DraftMarker = memo(function DraftMarker() {
  const t = useTranslations('workspace')
  const count = Math.max(1, useDraftChangeCount())
  return (
    <span className="ws-bar-marker" data-state="dirty" data-testid="bar-dirty">
      <span className="workspace-dirty-dot" aria-hidden="true" />
      {t('changes.count', { count })}
    </span>
  )
})

const BarDraft = memo(function BarDraft({
  dirty,
  activeName,
  onSaveAsNew,
}: {
  dirty: boolean
  activeName: string
  /** "Als Variante speichern …": receives the button focus returns to. */
  onSaveAsNew: (trigger: HTMLElement | null) => void
}) {
  const t = useTranslations('workspace')
  const tp = useTranslations('plans')
  const tc = useTranslations('simulationCompact.commandBar')
  const activePlanId = useActivePlanId()
  const save = useSavePlanDraft()
  const revert = useRevertPlanDraft()
  const updateParams = useUpdateParams()
  // At the plan limit there is no room for a variant: the item stays in its
  // place but says why it does nothing, like the plan menu's item.
  const atPlanLimit = useSimulationStore((state) => state.plans.length >= MAX_PLANS)
  const limitHint = tp('switcher.limit', { max: MAX_PLANS })
  const limitHintId = useId()

  // ---- Focus after Save / Discard ------------------------------------------
  // The buttons unmount once the plan is clean, which dropped keyboard focus
  // to <body>. When the action came from inside this cluster, focus moves to
  // the "Gespeichert" marker that takes their place.
  const clusterRef = useRef<HTMLDivElement>(null)
  const savedRef = useRef<HTMLSpanElement>(null)
  const refocusRef = useRef(false)
  const noteFocus = () => {
    refocusRef.current = Boolean(clusterRef.current?.contains(document.activeElement))
  }
  useEffect(() => {
    if (dirty || !refocusRef.current) return
    refocusRef.current = false
    // Where the marker is not shown (phones), the plan menu trigger (which
    // names the plan just saved) is the nearest stop instead.
    const marker = savedRef.current
    const target =
      marker && marker.getClientRects().length > 0
        ? marker
        : document.querySelector<HTMLElement>('[data-testid="plan-menu-trigger"]')
    target?.focus({ preventScroll: true })
  }, [dirty])

  // ---- Discard with undo ---------------------------------------------------

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
    noteFocus()
    const { params: snapshot, activePlanId: planId } = useSimulationStore.getState()
    revert()
    if (discardToastRef.current) toast.dismiss(discardToastRef.current.id)
    const id = showActionToast({
      testId: 'plan-discarded-toast',
      message: t('discardedToast', { name: activeName }),
      undo: {
        label: tp('actions.undo'),
        testId: 'plan-discarded-toast-undo',
        run: () => {
          discardToastRef.current = null
          if (useSimulationStore.getState().activePlanId !== planId) return
          updateParams(snapshot)
        },
      },
    })
    discardToastRef.current = { id, planId }
  }

  const saveNow = () => {
    noteFocus()
    save()
  }

  return (
    <div className="ws-bar-draft" ref={clusterRef} data-bottom-chrome>
      {dirty ? (
        <>
          <DraftMarker />
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
          {/* "Speichern ▾": the button saves; the caret beside it offers the
              same and "Als Variante speichern …" (the plan stays as saved,
              the changes become a plan of their own). */}
          <div className="ws-bar-save-group">
            <button
              type="button"
              className="workspace-button workspace-button-primary ws-bar-save"
              data-testid="command-save"
              aria-label={tp('dirty.ariaSave', { name: activeName })}
              onClick={saveNow}
            >
              <Save size={16} aria-hidden="true" />
              {tc('saveButton')}
            </button>
            <Popover
              kind="menu"
              label={t('bar.saveMenu')}
              testId="command-save-menu"
              className="ws-bar-save-menu"
              trigger={(props) => (
                <button
                  {...props}
                  className="workspace-button workspace-button-primary ws-bar-save-more"
                  data-testid="command-save-more"
                  aria-label={t('bar.saveMore')}
                  title={t('bar.saveMore')}
                >
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
              )}
            >
              {(close) => (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    className="ws-menu-item"
                    data-testid="command-save-plain"
                    onClick={() => {
                      close()
                      saveNow()
                    }}
                  >
                    <Save size={16} aria-hidden="true" />
                    {tc('saveButton')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="ws-menu-item"
                    data-testid="command-save-as-new"
                    aria-haspopup={atPlanLimit ? undefined : 'dialog'}
                    aria-disabled={atPlanLimit || undefined}
                    aria-describedby={atPlanLimit ? limitHintId : undefined}
                    onClick={() => {
                      if (atPlanLimit) return
                      close()
                      // `close` put focus on the caret: the dialog returns it there.
                      onSaveAsNew(document.activeElement as HTMLElement | null)
                    }}
                  >
                    <CopyPlus size={16} aria-hidden="true" />
                    <span>
                      {t('bar.saveAsNew')}
                      {atPlanLimit && (
                        <span id={limitHintId} className="ws-menu-item-hint">
                          {limitHint}
                        </span>
                      )}
                    </span>
                  </button>
                </>
              )}
            </Popover>
          </div>
        </>
      ) : (
        <span
          ref={savedRef}
          className="ws-bar-saved"
          data-state="saved"
          data-testid="bar-saved"
          tabIndex={-1}
        >
          <Check size={14} aria-hidden="true" />
          {t('saved')}
        </span>
      )}
    </div>
  )
})

// ---- Tools: € switch, PDF, Menü ---------------------------------------------

/**
 * The PDF export, one click from anywhere: progress shows inside the button
 * (and in a toast). The report reads current results only; stale ones are
 * withheld.
 */
const BarReport = memo(function BarReport() {
  const t = useTranslations('report')
  const tw = useTranslations('workspace.bar')
  const results = useUsableStoreResults()
  const stale = useSimulationStore(selectResultsStale)
  const loading = useSimulationLoading()
  return (
    <div className="ws-bar-report" data-testid="bar-report">
      <GenerateReportButton
        results={stale ? null : results}
        disabled={loading}
        size="sm"
        variant="outline"
        buttonClassName="ws-bar-report-button"
      >
        <Download size={16} aria-hidden="true" />
        <span aria-hidden="true">{tw('pdf')}</span>
        <span className="sr-only">{t('actions.generate')}</span>
      </GenerateReportButton>
    </div>
  )
})

/**
 * The bar: what plan this is and whether it is saved, on the left; how the
 * page shows money and the two page-level tools, on the right. 48 px, one
 * row. Left to right: plan menu · draft state, "Verwerfen", "Speichern ▾" ·
 * space · "Nominal │ Heutige €" · PDF · Menü. On phones it keeps to the plan
 * menu, the € switch (short labels) and Menü; the draft row sits above the
 * mode bar, and the PDF is the Menü's first item.
 */
export function ResultBar() {
  const t = useTranslations('workspace')
  const tp = useTranslations('plans')
  const activePlan = useActivePlan()
  const dirty = usePlanIsDirty()
  const setComparisonSelection = useSetComparisonSelection()
  const { status, needsRun } = useRunStatus()
  const { enterCompare } = useWorkspace()

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
  const saveAsNew = useCallback((trigger: HTMLElement | null) => {
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
    >
      <div className="ws-bar-plan">
        <MemoPlanMenu onManage={manage} onCompare={compare} onSaveAsNew={saveAsNew} />
      </div>

      <BarDraft dirty={dirty} activeName={activeName} onSaveAsNew={saveAsNew} />

      <div className="ws-bar-tools">
        <div className="ws-bar-euro">
          <MemoEuroDisplay />
        </div>
        <BarReport />
        <MemoDashboardTools />
      </div>

      {managerMounted && (
        <SectionBoundary
          name="plan-manager"
          variant="floating"
          onDismiss={() => {
            setManagerOpen(false)
            setManagerMounted(false)
          }}
        >
          <PlanManagerDialog
            open={managerOpen}
            onOpenChange={setManagerOpen}
            returnFocusRef={planTriggerRef}
          />
        </SectionBoundary>
      )}
      {saveAsMounted && (
        <SectionBoundary
          name="save-as-plan"
          variant="floating"
          onDismiss={() => {
            setSaveAsOpen(false)
            setSaveAsMounted(false)
          }}
        >
          <SaveDraftAsPlanDialog
            open={saveAsOpen}
            onOpenChange={setSaveAsOpen}
            returnFocusRef={saveAsInvokerRef}
            onCompare={compareWithNew}
          />
        </SectionBoundary>
      )}
    </header>
  )
}
