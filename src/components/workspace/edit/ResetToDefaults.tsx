'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { DEFAULT_PARAMS, type SimulationParams } from '@/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { showActionToast } from '@/components/ui/action-toast'
import { toast } from '@/components/ui/toast'
import { planDisplayName } from '@/lib/plans/planName'
import { useActivePlan, useSimulationStore, useUpdateParams } from '@/lib/stores/simulationStore'

/**
 * "Auf Standard zurücksetzen", in the column's footer: dialog and undo toast
 * moved verbatim from the Annahmen section (and the old PlanEditor before
 * it). The reset writes the working copy only — still a draft.
 */
export function ResetToDefaults() {
  const t = useTranslations('planEditor')
  const tPlans = useTranslations('plans')
  const updateParams = useUpdateParams()
  const activePlan = useActivePlan()
  const [resetOpen, setResetOpen] = useState(false)
  const planName = activePlan ? planDisplayName(activePlan, tPlans) : ''

  const handleReset = () => {
    // Read at click time: subscribing to the params would re-render this
    // button on every keystroke anywhere on the page.
    const previous: SimulationParams = { ...useSimulationStore.getState().params }
    updateParams({ ...DEFAULT_PARAMS })
    setResetOpen(false)
    showActionToast({
      testId: 'plan-reset-toast',
      message: t('reset.done', { name: planName }),
      undo: {
        label: tPlans('actions.undo'),
        testId: 'plan-reset-toast-undo',
        run: () => {
          updateParams(previous)
          toast.success(t('reset.undone'))
        },
      },
    })
  }

  return (
    <>
      <button
        type="button"
        className="ws-reset-button"
        data-testid="plan-editor-reset"
        onClick={() => setResetOpen(true)}
      >
        {t('reset.trigger')}
      </button>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="bg-card sm:max-w-[30rem]" data-testid="plan-reset-dialog">
          <DialogHeader>
            <DialogTitle>{t('reset.title')}</DialogTitle>
            <DialogDescription>{t('reset.description', { name: planName })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResetOpen(false)}>
              {tPlans('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              data-testid="plan-reset-confirm"
              onClick={handleReset}
            >
              {t('reset.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
