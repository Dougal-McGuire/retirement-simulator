'use client'

import type { Plan, SimulationParams } from '@/types'
import { showActionToast } from '@/components/ui/action-toast'
import { toast } from '@/components/ui/toast'
import { planDisplayName } from '@/lib/plans/planName'
import { useSimulationStore } from '@/lib/stores/simulationStore'

type PlanTranslator = (key: string, values?: Record<string, string>) => string

/**
 * Deletes `plan` and offers a timed undo toast. Returns `true` if the plan was
 * actually removed, or `false` if deletion was a no-op (e.g. only one plan
 * remains or another tab already deleted it). If the user starts editing the
 * plan that took over before clicking Undo, the restored plan is created in the
 * background so unsaved work is never dropped.
 */
export function deletePlanWithUndo(plan: Plan, t: PlanTranslator): boolean {
  const before = useSimulationStore.getState()
  if (before.plans.length <= 1 || !before.plans.some((entry) => entry.id === plan.id)) {
    return false
  }

  const name = planDisplayName(plan, t)
  const params: SimulationParams = plan.params

  before.deletePlan(plan.id)

  const after = useSimulationStore.getState()
  if (after.plans.some((entry) => entry.id === plan.id)) return false

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

        const restoredId = current.createPlan(name, params, { activate: !editing })
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

  return true
}
