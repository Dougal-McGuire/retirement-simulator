'use client'

import type { RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { AuthMenu } from '@/components/auth/AuthMenu'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { AppearanceSwitch } from '@/components/navigation/AppearanceSwitch'
import { GenerateReportButton } from '@/components/GenerateReportButton'
import { PlanSwitcher } from '@/components/plans/PlanSwitcher'
import { EuroDisplay } from '@/components/workspace/EuroDisplay'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Link } from '@/navigation'
import type { SimulationResults } from '@/types'

/** First control that can actually do something — never the disabled sign-in. */
export const FOCUSABLE =
  'button:not([disabled]):not([aria-disabled="true"]), a[href], [role="combobox"]:not([disabled])'

export function DashboardTools({
  results,
  isLoading,
  open,
  onOpenChange,
  focusPlans = false,
  returnFocusRef,
}: {
  results: SimulationResults | null
  isLoading: boolean
  /** Controlled mode, so the header's "Manage plans …" can open this dialog. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Land focus on the plan manager instead of the first tool. */
  focusPlans?: boolean
  /**
   * Where focus goes when the dialog closes, if set (e.g. the plan picker that
   * opened it via "Manage plans …"); otherwise Radix returns it to the trigger.
   */
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const t = useTranslations('simulationCompact.tools')
  const td = useTranslations('simulation.display')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
        // disabled sign-in control (and opened its tooltip). Pick explicitly.
        onOpenAutoFocus={(event) => {
          const root = event.currentTarget as HTMLElement
          const target = focusPlans
            ? root.querySelector<HTMLElement>('[data-testid="plan-switcher-select"]')
            : root.querySelector<HTMLElement>(`[data-tools-body] :is(${FOCUSABLE})`)
          if (!target) return
          event.preventDefault()
          target.focus()
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current
          if (!target?.isConnected) return
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
          <Link href="/setup" className="ds-btn ds-btn--ghost ds-btn--sm" data-testid="setup-link">
            {t('setup')}
          </Link>
          <LocaleSwitcher />
          <AuthMenu />
        </div>
        {/* Colour scheme (System / Light / Dark); self-contained, see AppearanceSwitch. */}
        <AppearanceSwitch showLabel className="self-start" />
        {/* On phones the nominal / today's-€ switch leaves the header for here. */}
        <div className="workspace-menu-display hidden">
          <span>{td('label')}</span>
          <EuroDisplay testId="menu-display-toggle" />
        </div>
        <PlanSwitcher />
      </DialogContent>
    </Dialog>
  )
}
