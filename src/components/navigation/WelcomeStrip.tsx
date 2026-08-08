'use client'

import { useEffect, useState } from 'react'
import { Compass, GitCompare, SlidersHorizontal, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useDismissWelcome, useWelcomeDismissed } from '@/lib/stores/displayStore'
import { cn } from '@/lib/utils'

interface WelcomeStripProps {
  /** Jumps to the named tab; the simulation page owns tab state. */
  onOpenTab?: (tab: 'overview' | 'details' | 'scenarios' | 'plan') => void
  className?: string
}

const CHIPS = [
  { key: 'edit', Icon: SlidersHorizontal, tab: 'plan' },
  { key: 'whatIf', Icon: Compass, tab: null },
  { key: 'compare', Icon: GitCompare, tab: 'scenarios' },
] as const

/**
 * First-visit orientation for the dashboard: three chips naming where the three
 * things this tool does actually live.
 *
 * Deliberately not a guided tour. A tour is a framework, a sequence to
 * maintain and something to click through before you are allowed to work; this
 * is one row that answers "where do I change my plan / try a what-if / compare
 * two futures", takes a click to dismiss and never returns.
 */
export function WelcomeStrip({ onOpenTab, className }: WelcomeStripProps) {
  const t = useTranslations('welcome')
  const dismissed = useWelcomeDismissed()
  const dismiss = useDismissWelcome()
  // The dismissal is persisted, so the store rehydrates a frame after mount.
  // Rendering only after that avoids a flash of the strip for people who have
  // already sent it away.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  if (!hydrated || dismissed) return null

  return (
    <section
      data-testid="welcome-strip"
      aria-label={t('title')}
      className={cn(
        'relative border-3 border-neo-black bg-neo-yellow/25 px-4 py-3 shadow-neo-sm',
        className
      )}
    >
      <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-center sm:gap-4">
        <p className="shrink-0 text-[0.68rem] font-black uppercase tracking-[0.18em] text-neo-black">
          {t('title')}
        </p>
        <ul className="flex list-none flex-col gap-2 p-0 sm:flex-row sm:flex-wrap sm:items-center">
          {CHIPS.map(({ key, Icon, tab }) => {
            const label = t(`chips.${key}`)
            const content = (
              <>
                <Icon className="h-3.5 w-3.5 shrink-0 text-neo-blue" aria-hidden="true" />
                {label}
              </>
            )
            return (
              <li key={key}>
                {tab && onOpenTab ? (
                  <button
                    type="button"
                    data-testid={`welcome-chip-${key}`}
                    onClick={() => onOpenTab(tab)}
                    className="inline-flex items-center gap-2 border-2 border-neo-black bg-neo-white px-2.5 py-1.5 text-left text-[0.62rem] font-semibold text-neo-black transition-neo hover:-translate-y-[1px] hover:bg-neo-white/70"
                  >
                    {content}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-2 border-2 border-neo-black bg-neo-white px-2.5 py-1.5 text-[0.62rem] font-semibold text-neo-black">
                    {content}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      <button
        type="button"
        onClick={dismiss}
        data-testid="welcome-dismiss"
        aria-label={t('dismiss')}
        title={t('dismiss')}
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center border-2 border-neo-black bg-neo-white text-neo-black transition-neo hover:bg-neo-red hover:text-neo-white"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </section>
  )
}
