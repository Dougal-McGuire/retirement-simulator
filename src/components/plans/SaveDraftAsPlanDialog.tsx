'use client'

import { useMemo, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { ScenarioPlanDialog } from '@/components/plans/ScenarioPlanDialog'
import { ActionToast } from '@/components/ui/action-toast'
import { toast, TOAST_DURATION } from '@/components/ui/toast'
import { cashFlowDisplayName } from '@/lib/plans/cashFlowName'
import { planDisplayName } from '@/lib/plans/planName'
import { diffFlowSwitches, diffParams, withSwitchesOf } from '@/lib/simulation/planDiff'
import { suggestDuplicateName } from '@/lib/stores/plans'
import { MAX_PLANS } from '@/types'
import {
  useActivePlan,
  usePlans,
  useSaveDraftAsNewPlan,
  useSetActivePlan,
  useSimulationStore,
} from '@/lib/stores/simulationStore'

interface SaveDraftAsPlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Focus target on close (the menu item that opened it unmounts). */
  returnFocusRef?: RefObject<HTMLElement | null>
  /** Enters compare mode with the source plan and the new one. */
  onCompare: (sourceId: string, newPlanId: string) => void
}

/**
 * "Änderungen als neuen Plan speichern": the working copy becomes a plan of
 * its own and the source plan goes back to its saved state — the user stays
 * on the source (as with "Als Plan speichern" on a stress lever), ready to
 * try the next variant from the same base. The toast offers the comparison
 * of the two, or switching to the new plan.
 *
 * The dialog names what the new plan changes, switches first
 * ("Erbschaft: berücksichtigt → ausgeschaltet"), then the other differences.
 */
export function SaveDraftAsPlanDialog({
  open,
  onOpenChange,
  returnFocusRef,
  onCompare,
}: SaveDraftAsPlanDialogProps) {
  const tp = useTranslations('plans')
  const td = useTranslations('plans.dialogs.saveDraft')
  const tToast = useTranslations('plans.toasts')
  const tFlows = useTranslations('setup.cashFlows')
  const activePlan = useActivePlan()
  const plans = usePlans()
  const saveDraftAsNewPlan = useSaveDraftAsNewPlan()
  const setActivePlan = useSetActivePlan()
  const sourceName = activePlan ? planDisplayName(activePlan, tp) : tp('label')
  const limitMessage = tp('switcher.limit', { max: MAX_PLANS })
  const atLimit = plans.length >= MAX_PLANS

  // Read once per opening: the draft cannot change while the dialog is modal.
  const { changes, suggestedName } = useMemo(() => {
    if (!open || !activePlan) return { changes: [], suggestedName: '' }
    const draft = useSimulationStore.getState().params
    const switches = diffFlowSwitches(activePlan.params, draft)
    const others = diffParams(withSwitchesOf(activePlan.params, draft), draft, 4)
    let suggestion = suggestDuplicateName(
      sourceName,
      plans.map((plan) => planDisplayName(plan, tp))
    )
    if (switches.length === 1 && others.length === 0 && switches[0].flow) {
      const flowName = cashFlowDisplayName(switches[0].flow, (key) => tFlows(`defaults.${key}`))
      suggestion =
        switches[0].to === 'off'
          ? td('without', { name: flowName })
          : td('with', { name: flowName })
    }
    return { changes: [...switches, ...others], suggestedName: suggestion }
  }, [open, activePlan, plans, sourceName, tp, td, tFlows])

  const confirm = (name: string) => {
    const sourceId = useSimulationStore.getState().activePlanId
    const newPlanId = saveDraftAsNewPlan(name)
    // Nothing was created: say why in the dialog rather than closing it.
    if (!newPlanId) {
      return useSimulationStore.getState().plans.length >= MAX_PLANS ? limitMessage : td('failed')
    }
    // Read the stored name back: duplicates get a suffix on the way in.
    const createdName =
      useSimulationStore.getState().plans.find((plan) => plan.id === newPlanId)?.name ?? name
    toast(
      (instance) => (
        <ActionToast
          testId="plan-created-toast"
          message={tToast('draftSavedAsNew', { name: createdName, source: sourceName })}
          actions={[
            {
              label: tToast('compare'),
              tone: 'primary',
              testId: 'plan-created-toast-compare',
              onClick: () => {
                toast.dismiss(instance.id)
                const state = useSimulationStore.getState()
                if (!state.plans.some((plan) => plan.id === newPlanId)) return
                onCompare(
                  state.activePlanId === newPlanId ? sourceId : state.activePlanId,
                  newPlanId
                )
              },
            },
            {
              label: tToast('switchToPlan'),
              testId: 'plan-created-toast-switch',
              onClick: () => {
                toast.dismiss(instance.id)
                setActivePlan(newPlanId)
              },
            },
            { label: tToast('dismiss'), onClick: () => toast.dismiss(instance.id) },
          ]}
        />
      ),
      { duration: TOAST_DURATION }
    )
  }

  return (
    <ScenarioPlanDialog
      variant="draft"
      open={open}
      onOpenChange={onOpenChange}
      sourceName={sourceName}
      suggestedName={suggestedName}
      changes={changes}
      onConfirm={confirm}
      returnFocusRef={returnFocusRef}
      blockedReason={atLimit ? limitMessage : undefined}
    />
  )
}
