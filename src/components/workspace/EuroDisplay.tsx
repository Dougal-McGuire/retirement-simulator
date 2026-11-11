'use client'

import { useTranslations } from 'next-intl'
import { SegmentedRadio } from '@/components/ui/segmented-radio'
import { useDisplayReal, useSetDisplayReal } from '@/lib/stores/displayStore'

/**
 * The global nominal / today's-€ switch. It has one place at every width:
 * the bar. On narrow phones each option shows a short label; the full one
 * stays its accessible name.
 */
export function EuroDisplay({ testId = 'display-toggle' }: { testId?: string }) {
  const t = useTranslations('simulation.display')
  const real = useDisplayReal()
  const setReal = useSetDisplayReal()
  const label = (full: string, short: string) => (
    <>
      <span className="workspace-euro-full">{full}</span>
      <span className="workspace-euro-short" aria-hidden="true">
        {short}
      </span>
    </>
  )
  return (
    <SegmentedRadio
      className="workspace-euro"
      ariaLabel={t('label')}
      testId={testId}
      value={real}
      onChange={setReal}
      options={[
        { value: false, label: label(t('nominal'), t('nominalShort')) },
        { value: true, label: label(t('real'), t('realShort')) },
      ]}
    />
  )
}
