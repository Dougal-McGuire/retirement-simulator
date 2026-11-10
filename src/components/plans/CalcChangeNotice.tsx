'use client'

import { useEffect } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from '@/components/ui/toast'
import { ActionToast } from '@/components/ui/action-toast'
import { usePathname } from '@/navigation'
import { useSimulationStore } from '@/lib/stores/simulationStore'

export const CALC_CHANGE_TOAST_ID = 'calc-change'

/**
 * "The calculation was corrected" — shown once to someone whose stored plans
 * were last calculated by an older engine (`CALC_VERSION`), on the page where
 * the numbers are. Without it a success rate that was 95% yesterday is 82%
 * today and nothing says why.
 *
 * The store sets the old rates aside on load (`ratesBeforeCalcChange`); once
 * this engine has run the open plan, the notice names both numbers. It stays
 * until it is dismissed and is then gone for every tab.
 */
export function CalcChangeNotice() {
  const t = useTranslations('plans.calcChange')
  const format = useFormatter()
  const pathname = usePathname()
  const pending = useSimulationStore((state) => state.ratesBeforeCalcChange !== null)
  const before = useSimulationStore(
    (state) => state.ratesBeforeCalcChange?.[state.activePlanId] ?? null
  )
  const after = useSimulationStore((state) => state.planSuccessRates[state.activePlanId] ?? null)
  const dismiss = useSimulationStore((state) => state.dismissCalcNotice)
  const onWorkspace = pathname === '/simulation'

  useEffect(() => {
    if (!pending || !onWorkspace) {
      toast.dismiss(CALC_CHANGE_TOAST_ID)
      return
    }

    const percent = (rate: number) =>
      format.number(rate / 100, { style: 'percent', maximumFractionDigits: 0 })
    // Only worth a line when the number on screen is a different one.
    const moved = before !== null && after !== null && Math.round(before) !== Math.round(after)

    toast(
      (instance) => (
        <ActionToast
          testId="calc-change-notice"
          message={
            <>
              <span className="block">{t('message')}</span>
              {moved && (
                <span className="mt-2 block" data-testid="calc-change-notice-rates">
                  {t('thisPlan', { before: percent(before), after: percent(after) })}
                </span>
              )}
            </>
          }
          actions={[
            {
              label: t('dismiss'),
              tone: 'primary',
              testId: 'calc-change-notice-dismiss',
              onClick: () => {
                dismiss()
                toast.dismiss(instance.id)
              },
            },
          ]}
        />
      ),
      { id: CALC_CHANGE_TOAST_ID, duration: Infinity, position: 'bottom-left' }
    )
  }, [pending, onWorkspace, before, after, dismiss, format, t])

  return null
}
