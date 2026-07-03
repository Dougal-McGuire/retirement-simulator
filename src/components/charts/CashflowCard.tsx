'use client'

import { useMemo } from 'react'
import { CircleDollarSign } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { SimulationParams, SimulationResults } from '@/types'
import { buildPlanInsightMetrics } from '@/lib/simulation/planInsights'
import { Card, CardContent } from '@/components/ui/card'

interface CashflowCardProps {
  params: SimulationParams
  results: SimulationResults | null
}

export function CashflowCard({ params, results }: CashflowCardProps) {
  const t = useTranslations('planDashboard')
  const format = useFormatter()
  const metrics = useMemo(() => buildPlanInsightMetrics(params, results), [params, results])

  const formatCurrency = (value: number, compact = false) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 0,
      minimumFractionDigits: 0,
    })

  const formatPercent = (value: number | null) =>
    value == null
      ? t('notAvailable')
      : format.number(value, {
          style: 'percent',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })

  return (
    <Card className="overflow-hidden">
      <CardContent className="bg-neo-white p-5">
        <div className="flex items-center gap-3">
          <CircleDollarSign className="h-5 w-5 text-neo-blue" aria-hidden="true" />
          <h4 className="text-sm font-extrabold uppercase tracking-[0.16em]">
            {t('cashflow.title')}
          </h4>
        </div>
        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-muted-foreground">
              {t('cashflow.portfolioNeed')}
            </span>
            <strong className="text-right">{formatCurrency(metrics.firstYearPortfolioNeed)}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-muted-foreground">
              {t('cashflow.pensionIncome')}
            </span>
            <strong className="text-right">{formatCurrency(metrics.pensionAnnual)}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-muted-foreground">
              {t('cashflow.realReturn')}
            </span>
            <strong className="text-right">{formatPercent(metrics.realReturn)}</strong>
          </div>
          <div className="flex items-center justify-between gap-4 border-t-2 border-neo-black pt-4">
            <span className="text-sm font-medium text-muted-foreground">
              {t('cashflow.horizonMedian')}
            </span>
            <strong className="text-right">
              {formatCurrency(metrics.horizonMedianAssets, true)}
            </strong>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
