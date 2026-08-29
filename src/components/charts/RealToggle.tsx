'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface RealToggleProps {
  value: boolean
  onChange: (displayReal: boolean) => void
  className?: string
}

/**
 * Nominal vs today's-euros switch for a chart section header.
 *
 * Purely a display control: it selects between two series the engine already
 * computed, so it never re-runs a simulation. Rendered as a radiogroup rather
 * than a checkbox because "nominal" and "real" are two named units, not an
 * on/off state — a screen reader should hear both options.
 */
export function RealToggle({ value, onChange, className }: RealToggleProps) {
  const t = useTranslations('simulation.display')

  const options = [
    { key: 'nominal', label: t('nominal'), selected: !value },
    { key: 'real', label: t('real'), selected: value },
  ] as const

  return (
    <div
      role="radiogroup"
      aria-label={t('label')}
      title={t('realHint')}
      className={cn(
        'rounded-sm flex shrink-0 items-center border-2 border-border bg-white',
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="radio"
          aria-checked={option.selected}
          data-testid={`display-unit-${option.key}`}
          onClick={() => onChange(option.key === 'real')}
          className={cn(
            'px-2.5 py-1 text-[0.62rem] font-bold   transition-colors',
            option.selected
              ? 'bg-accent text-white'
              : 'bg-white text-muted-foreground hover:text-ink'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
