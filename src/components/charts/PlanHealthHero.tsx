'use client'

import React, { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { SimulationParams, SimulationResults } from '@/types'
import { buildPlanInsightMetrics } from '@/lib/simulation/planInsights'
import { computePlanHealthScore, type PlanHealthLabel } from '@/lib/insights/planHealth'
import { deriveDepletionAges } from '@/lib/insights/depletion'
import { buildPlanWarnings, type PlanWarning } from '@/lib/insights/warnings'
import { AnimatedCounter } from '@/components/ui/animated-counter'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface PlanHealthHeroProps {
  params: SimulationParams
  results: SimulationResults | null
  isLoading: boolean
}

const scoreLabelKeys: Record<PlanHealthLabel, 'strong' | 'moderate' | 'needsAttention'> = {
  Strong: 'strong',
  Moderate: 'moderate',
  'Needs Attention': 'needsAttention',
}

const scoreTones: Record<PlanHealthLabel, string> = {
  Strong: 'text-neo-green',
  Moderate: 'text-warning-600',
  'Needs Attention': 'text-neo-red',
}

function successTone(rate: number) {
  if (rate >= 90) return 'text-neo-green'
  if (rate >= 75) return 'text-warning-600'
  return 'text-neo-red'
}

export function PlanHealthHero({ params, results, isLoading }: PlanHealthHeroProps) {
  const t = useTranslations('planHero')
  const format = useFormatter()

  const health = useMemo(
    () => (results ? computePlanHealthScore(params, results) : null),
    [params, results]
  )
  const metrics = useMemo(() => buildPlanInsightMetrics(params, results), [params, results])
  const depletion = useMemo(
    () => (results ? deriveDepletionAges(results) : { p10DepletionAge: null, p50DepletionAge: null }),
    [results]
  )
  const warnings = useMemo(() => buildPlanWarnings(params, results), [params, results])

  const formatCurrency = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    })

  const formatPercent = (value: number) =>
    format.number(value, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

  const warningText = (warning: PlanWarning): string => {
    switch (warning.id) {
      case 'highWithdrawal':
        return t('warnings.highWithdrawal', { rate: formatPercent(warning.rate) })
      case 'medianDepletion':
        return t('warnings.medianDepletion', { age: warning.age })
      case 'bridgeGap':
        return t('warnings.bridgeGap', {
          need: formatCurrency(warning.cashNeed),
          assets: formatCurrency(warning.retirementAssets),
        })
      case 'inconsistentAges':
        return t('warnings.inconsistentAges')
    }
  }

  const tiles: { key: string; label: string; value: React.ReactNode; detail: string }[] = [
    {
      key: 'score',
      label: t('score.label'),
      value: health ? (
        <span className={cn(scoreTones[health.label])}>
          <AnimatedCounter end={health.score} duration={1.5} decimals={0} />
          <span className="text-base font-bold text-muted-foreground">/100</span>
        </span>
      ) : (
        t('notAvailable')
      ),
      detail: health ? t(`score.${scoreLabelKeys[health.label]}`) : '',
    },
    {
      key: 'success',
      label: t('success.label'),
      value: results ? (
        <span className={cn(successTone(results.successRate))}>
          <AnimatedCounter end={results.successRate} duration={1.5} decimals={1} suffix="%" />
        </span>
      ) : (
        t('notAvailable')
      ),
      detail: results ? t('success.detail', { runs: format.number(params.simulationRuns) }) : '',
    },
    {
      key: 'lasts',
      label: t('lasts.label'),
      value: results
        ? depletion.p50DepletionAge !== null
          ? t('lasts.toAge', { age: depletion.p50DepletionAge })
          : t('lasts.beyond', { age: params.endAge })
        : t('notAvailable'),
      detail: results
        ? depletion.p10DepletionAge !== null
          ? t('lasts.detailP10', { age: depletion.p10DepletionAge })
          : t('lasts.detailNone')
        : '',
    },
    {
      key: 'withdrawal',
      label: t('withdrawal.label'),
      value:
        results && metrics.firstYearWithdrawalRate !== null
          ? formatPercent(metrics.firstYearWithdrawalRate)
          : t('notAvailable'),
      detail: results ? t('withdrawal.detail', { need: formatCurrency(metrics.firstYearPortfolioNeed) }) : '',
    },
    {
      key: 'bridge',
      label: t('bridge.label'),
      value: t('bridge.value', { years: metrics.bridgeYears }),
      detail: t('bridge.detail', { age: params.legalRetirementAge }),
    },
  ]

  return (
    <Card className="overflow-hidden border-3 border-neo-black">
      <CardContent className={cn('bg-neo-white p-5', isLoading && 'animate-pulse opacity-70')}>
        <h2 className="sr-only">{t('title')}</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {tiles.map((tile) => (
            <div key={tile.key} className="border-2 border-neo-black bg-background p-4 shadow-neo-sm">
              <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {tile.label}
              </span>
              <div className="mt-2 text-2xl font-black text-neo-black">{tile.value}</div>
              {tile.detail && (
                <p className="mt-1 text-xs font-medium text-muted-foreground">{tile.detail}</p>
              )}
            </div>
          ))}
        </div>

        {warnings.length > 0 && (
          <ul role="alert" className="mt-5 space-y-2">
            {warnings.map((warning) => (
              <li
                key={warning.id}
                className="flex items-start gap-3 border-2 border-neo-red bg-red-50 px-4 py-3 text-sm font-semibold text-neo-red"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {warningText(warning)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
