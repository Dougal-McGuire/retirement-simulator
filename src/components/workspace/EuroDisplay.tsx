'use client'

import { useTranslations } from 'next-intl'
import { SegmentedRadio } from '@/components/ui/segmented-radio'
import { useDisplayReal, useSetDisplayReal } from '@/lib/stores/displayStore'

/**
 * The global nominal / today's-€ switch. Rendered in the rail footer from
 * 1024px up and inside the Menu dialog, which shows it wherever the rail's is
 * not on screen (below 1024px, and beside the compact rail while a docked
 * panel is open). The secondary instance passes its own test id.
 */
export function EuroDisplay({ testId = 'display-toggle' }: { testId?: string }) {
  const t = useTranslations('simulation.display')
  const real = useDisplayReal()
  const setReal = useSetDisplayReal()
  return (
    <SegmentedRadio
      className="workspace-euro"
      ariaLabel={t('label')}
      testId={testId}
      value={real}
      onChange={setReal}
      options={[
        { value: false, label: t('nominal') },
        { value: true, label: t('real') },
      ]}
    />
  )
}
