'use client'

import { useTranslations } from 'next-intl'
import { useDisplayReal, useSetDisplayReal } from '@/lib/stores/displayStore'

/**
 * The global nominal / today's-€ switch. Rendered in the sidebar on desktop,
 * in the header row on tablets and inside the Menu dialog on phones — only one
 * instance is visible at a time, so secondary instances pass their own test id.
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
