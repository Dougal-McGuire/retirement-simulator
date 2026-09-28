'use client'

import { useTranslations } from 'next-intl'
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
    <div className="workspace-euro" role="radiogroup" aria-label={t('label')} data-testid={testId}>
      {[false, true].map((value) => (
        <button
          key={String(value)}
          role="radio"
          aria-checked={real === value}
          onClick={() => setReal(value)}
        >
          {t(value ? 'real' : 'nominal')}
        </button>
      ))}
    </div>
  )
}
