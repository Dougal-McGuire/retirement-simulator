'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { planDisplayName } from '@/lib/plans/planName'
import { usePlans, useSavePlanDraft, useSetActivePlan } from '@/lib/stores/simulationStore'

/**
 * Asks before switching away from a plan with unsaved edits — the working copy
 * is the only place those edits exist. Shared by the header plan menu and the
 * plan manager so both paths offer the same three choices.
 */
export function PlanSwitchGuard({
  pendingPlanId,
  activeName,
  onDone,
  onCloseAutoFocus,
}: {
  pendingPlanId: string | null
  activeName: string
  onDone: () => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const t = useTranslations('plans')
  const plans = usePlans()
  const setActivePlan = useSetActivePlan()
  const savePlanDraft = useSavePlanDraft()
  const pendingPlan = pendingPlanId ? plans.find((plan) => plan.id === pendingPlanId) : undefined

  const switchTo = (save: boolean) => {
    const target = pendingPlanId
    if (save) {
      savePlanDraft()
      toast.success(t('dirty.savedToast', { name: activeName }))
    }
    onDone()
    if (target) setActivePlan(target)
  }

  return (
    <Dialog open={pendingPlanId !== null} onOpenChange={(open) => !open && onDone()}>
      <DialogContent
        className="bg-card sm:max-w-[30rem]"
        data-testid="plan-switch-guard"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{t('switchGuard.title', { name: activeName })}</DialogTitle>
          <DialogDescription>
            {t('switchGuard.description', {
              name: activeName,
              target: pendingPlan ? planDisplayName(pendingPlan, t) : '',
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-wrap">
          <Button variant="outline" size="sm" onClick={onDone}>
            {t('switchGuard.cancel')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            data-testid="plan-switch-discard"
            onClick={() => switchTo(false)}
          >
            {t('switchGuard.discard')}
          </Button>
          <Button size="sm" data-testid="plan-switch-save" onClick={() => switchTo(true)}>
            {t('switchGuard.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
