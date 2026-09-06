'use client'

import { useTranslations } from 'next-intl'
import { AuthMenu } from '@/components/auth/AuthMenu'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { GenerateReportButton } from '@/components/GenerateReportButton'
import { PlanSwitcher } from '@/components/plans/PlanSwitcher'
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

export function DashboardTools({
  results,
  isLoading,
}: {
  results: SimulationResults | null
  isLoading: boolean
}) {
  const t = useTranslations('simulationCompact.tools')
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <AuthMenu />
          <LocaleSwitcher />
          <GenerateReportButton
            results={results}
            disabled={isLoading}
            size="sm"
            variant="outline"
          />
          <Link href="/setup" className="ds-btn ds-btn--ghost ds-btn--sm" data-testid="setup-link">
            {t('setup')}
          </Link>
        </div>
        <PlanSwitcher />
      </DialogContent>
    </Dialog>
  )
}
