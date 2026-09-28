'use client'

import { useTranslations } from 'next-intl'
import { AuthMenu } from '@/components/auth/AuthMenu'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { AppearanceSwitch } from '@/components/navigation/AppearanceSwitch'
import { GenerateReportButton } from '@/components/GenerateReportButton'
import { EuroDisplay } from '@/components/workspace/EuroDisplay'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { SimulationResults } from '@/types'

/** First control that can actually do something — never the disabled sign-in. */
export const FOCUSABLE =
  'button:not([disabled]):not([aria-disabled="true"]), a[href], [role="combobox"]:not([disabled])'

/**
 * The workspace "Menu": report, language, account and appearance, plus the
 * nominal / today's-€ switch wherever the rail does not show it (below
 * 1024px, and beside the compact rail while a docked panel is open). Plan
 * management lives in the plan menu's "Manage plans …" dialog, the guided
 * setup in the Annahmen section.
 */
export function DashboardTools({
  results,
  isLoading,
}: {
  results: SimulationResults | null
  isLoading: boolean
}) {
  const t = useTranslations('simulationCompact.tools')
  const td = useTranslations('simulation.display')
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="ds-btn ds-btn--outline ds-btn--sm min-h-11 shrink-0"
          data-testid="dashboard-tools"
        >
          {t('button')}
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        // Radix focuses the first tabbable element, which used to be the
        // disabled sign-in control (and opened its tooltip). Pick explicitly:
        // Generate Report comes first and receives focus.
        onOpenAutoFocus={(event) => {
          const root = event.currentTarget as HTMLElement
          const target = root.querySelector<HTMLElement>(`[data-tools-body] :is(${FOCUSABLE})`)
          if (!target) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3" data-tools-body>
          <GenerateReportButton
            results={results}
            disabled={isLoading}
            size="sm"
            variant="outline"
          />
          <LocaleSwitcher />
          <AuthMenu />
        </div>
        {/* Colour scheme (System / Light / Dark); self-contained, see AppearanceSwitch. */}
        <AppearanceSwitch showLabel className="self-start" />
        {/* The nominal / today's-€ switch shows here whenever the rail's is off
            screen: below 1024px and beside the compact rail (ws-page.css). */}
        <div className="workspace-menu-display hidden">
          <span>{td('label')}</span>
          <EuroDisplay testId="menu-display-toggle" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
