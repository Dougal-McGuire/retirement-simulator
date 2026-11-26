'use client'

import type { Plan, SimulationParams } from '@/types'
import { showActionToast } from '@/components/ui/action-toast'
import { toast } from '@/components/ui/toast'
import { planDisplayName } from '@/lib/plans/planName'
import { useSimulationStore } from '@/lib/stores/simulationStore'

type PlanTranslator = (key: string, values?: Record<string, string>) => string

/**
 * Deletes `plan` and offers a timed undo toast. If the user already started
 * editing the plan that took over before clicking Undo, the restored plan is
 * created in the background so unsaved work is never dropped.
 */
export function deletePlanWithUndo(plan: Plan, t: PlanTranslator): void {
  const { deletePlan, createPlan } = useSimulationStore.getState()
  const name = planDisplayName(plan, t)
  const params: SimulationParams = plan.params

  deletePlan(plan.id)

  showActionToast({
    testId: 'plan-deleted-toast',
    message: t('deleted.toast', { name }),
    undo: {
      label: t('actions.undo'),
      testId: 'plan-deleted-toast-undo',
      run: () => {
        const current = useSimulationStore.getState()
        const editing = current.isDirty
          ? current.plans.find((entry) => entry.id === current.activePlanId)
          : undefined

        const restoredId = createPlan(name, params, { activate: !editing })
        if (!restoredId) {
          toast.error(t('deleted.restoreFailed'))
        } else if (editing) {
          toast.success(
            t('deleted.restoredInBackground', { name, active: planDisplayName(editing, t) })
          )
        } else {
          toast.success(t('deleted.restored', { name }))
        }
      },
    },
  })
}
