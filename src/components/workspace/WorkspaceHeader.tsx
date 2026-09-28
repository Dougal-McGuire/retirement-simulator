'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, CircleAlert, LoaderCircle, RotateCw, Save, Undo2 } from 'lucide-react'
import {
  useActivePlanId,
  usePlanIsDirty,
  usePlans,
  useRevertPlanDraft,
  useSavePlanDraft,
  useSimulationStore,
  useUpdateParams,
} from '@/lib/stores/simulationStore'
import { planDisplayName } from '@/lib/plans/planName'
import { DashboardTools } from '@/components/simulation-compact/DashboardTools'
import { ActionToast } from '@/components/ui/action-toast'
import { toast, TOAST_DURATION } from '@/components/ui/toast'
import { PlanMenu } from './PlanMenu'
import type { RunStatus } from './useRunStatus'
import type { SimulationResults } from '@/types'

export { EuroDisplay } from './EuroDisplay'

const statusIcon = {
  running: LoaderCircle,
  updated: Check,
  stale: CircleAlert,
  empty: CircleAlert,
} as const

export function WorkspaceHeader({
  results,
  loading,
  onRun,
  status,
  needsRun,
}: {
  results: SimulationResults | null
  loading: boolean
  onRun: () => void
  status: RunStatus
  /** Results are genuinely out of date (auto-run suspended, failed or not yet run). */
  needsRun: boolean
}) {
  const t = useTranslations('workspace')
  const tp = useTranslations('plans')
  const tc = useTranslations('simulationCompact.commandBar')
  const plans = usePlans()
  const activePlanId = useActivePlanId()
  const dirty = usePlanIsDirty()
  const save = useSavePlanDraft()
  const revert = useRevertPlanDraft()
  const updateParams = useUpdateParams()
  const [toolsOpen, setToolsOpen] = useState(false)
  const [toolsFocusPlans, setToolsFocusPlans] = useState(false)
  // "Manage plans …" opens the Menu dialog from the plan picker, so closing
  // it returns focus there rather than to the Menu button.
  const planPickerRef = useRef<HTMLElement | null>(null)
  const activePlan = plans.find((plan) => plan.id === activePlanId)
  const activeName = activePlan ? planDisplayName(activePlan, tp) : ''
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

  const StatusIcon = statusIcon[status]
  return (
    <header className="workspace-toolbar" data-dirty={dirty ? 'true' : undefined}>
      <div className="workspace-plan-picker">
        <span className="workspace-plan-label" aria-hidden="true">
          {t('activePlan')}
        </span>
        <PlanMenu
          onManage={(trigger) => {
            planPickerRef.current = trigger
            setToolsFocusPlans(true)
            setToolsOpen(true)
          }}
        />
      </div>
      <div className="workspace-dirty">
        {dirty ? (
          <>
            <span className="workspace-save-status" data-state="dirty">
              <span className="workspace-dirty-dot" aria-hidden="true" />
              <span className="workspace-save-status-long">{t('unsaved')}</span>
              <span className="workspace-save-status-short">{t('unsavedShort')}</span>
            </span>
            <button
              className="workspace-button workspace-button-quiet"
              data-testid="command-discard"
              aria-label={tp('dirty.ariaRevert', { name: activeName })}
              title={t('discard')}
              onClick={discard}
            >
              <Undo2 size={16} aria-hidden="true" />
              {/* Collapses to the icon where the header runs out of room; the
                  button keeps its accessible name (aria-label). */}
              <span className="workspace-discard-label">{t('discard')}</span>
            </button>
            <button
              className="workspace-button"
              data-testid="command-save"
              aria-label={tp('dirty.ariaSave', { name: activeName })}
              onClick={() => save()}
            >
              <Save size={16} aria-hidden="true" />
              {tc('saveButton')}
            </button>
          </>
        ) : (
          <span className="workspace-save-status" data-state="saved">
            <Check size={14} aria-hidden="true" />
            {t('saved')}
          </span>
        )}
      </div>
      <div className="workspace-actions">
        <span
          className="workspace-run-state"
          data-state={status}
          data-testid="run-status"
          role="status"
          aria-live="polite"
          title={t(`status.${status}`)}
        >
          <StatusIcon size={15} aria-hidden="true" />
          <span className="workspace-run-state-text">{t(`status.${status}`)}</span>
        </span>
        {/* Auto-run keeps results current, and the engine is seeded, so this
            is a quiet fallback that only asks for attention when results are
            actually out of date. */}
        <button
          className={`workspace-button ${needsRun ? 'workspace-button-primary' : 'workspace-button-quiet'}`}
          data-testid="run-button"
          data-needs-run={needsRun ? 'true' : undefined}
          disabled={loading}
          title={t('calculateHint')}
          onClick={onRun}
        >
          <RotateCw size={16} aria-hidden="true" />
          <span className="workspace-run-label">{t('calculate')}</span>
        </button>
        <DashboardTools
          results={results}
          isLoading={loading}
          open={toolsOpen}
          focusPlans={toolsFocusPlans}
          returnFocusRef={planPickerRef}
          onOpenChange={(next) => {
            setToolsOpen(next)
            // Only the Menu button opens through here; it gets focus back.
            if (next) planPickerRef.current = null
            else setToolsFocusPlans(false)
          }}
        />
      </div>
    </header>
  )
}
