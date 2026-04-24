'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import {
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  Gauge,
  Landmark,
  PiggyBank,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import type { SimulationParams, SimulationResults } from '@/types'
import {
  buildPlanInsightMetrics,
  buildScenarioParams,
  getPlanHealth,
  type PlanHealth,
} from '@/lib/simulation/planInsights'
import { runSimulationInClient } from '@/lib/simulation/workerClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface PlanDashboardProps {
  params: SimulationParams
  results: SimulationResults | null
  isLoading: boolean
}

type ScenarioResult = {
  id: string
  successRate: number
  delta: number
}

const healthClasses: Record<PlanHealth, string> = {
  strong: 'border-success-600 bg-success-50 text-success-700',
  watch: 'border-warning-600 bg-warning-50 text-warning-700',
  strained: 'border-neo-red bg-red-50 text-neo-red',
}

export function PlanDashboard({ params, results, isLoading }: PlanDashboardProps) {
  const t = useTranslations('planDashboard')
  const format = useFormatter()
  const [scenarios, setScenarios] = useState<ScenarioResult[]>([])
  const [scenarioStatus, setScenarioStatus] = useState<'idle' | 'loading' | 'ready'>('idle')

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

  useEffect(() => {
    if (!results || isLoading) {
      setScenarios([])
      setScenarioStatus('idle')
      return
    }

    let cancelled = false
    const scenarioParams = buildScenarioParams(params)

    setScenarioStatus('loading')

    Promise.all(
      scenarioParams.map(async (scenario) => {
        const scenarioResults = await runSimulationInClient(scenario.params)
        return {
          id: scenario.id,
          successRate: scenarioResults.successRate,
          delta: scenarioResults.successRate - results.successRate,
        }
      })
    )
      .then((nextScenarios) => {
        if (cancelled) return
        setScenarios(nextScenarios.sort((a, b) => b.delta - a.delta))
        setScenarioStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setScenarios([])
        setScenarioStatus('idle')
      })

    return () => {
      cancelled = true
    }
  }, [isLoading, params, results])

  const metricItems = [
    {
      key: 'retirementAssets',
      icon: PiggyBank,
      value: formatCurrency(metrics.retirementMedianAssets, true),
      detail: t('metrics.retirementAssets.detail'),
    },
    {
      key: 'monthlySpend',
      icon: WalletCards,
      value: formatCurrency(metrics.monthlySpending),
      detail: t('metrics.monthlySpend.detail', {
        annual: formatCurrency(metrics.annualSpending),
      }),
    },
    {
      key: 'withdrawalRate',
      icon: Gauge,
      value: formatPercent(metrics.firstYearWithdrawalRate),
      detail: t('metrics.withdrawalRate.detail', {
        need: formatCurrency(metrics.firstYearPortfolioNeed),
      }),
    },
    {
      key: 'bridge',
      icon: CalendarClock,
      value: t('metrics.bridge.value', { years: metrics.bridgeYears }),
      detail: t('metrics.bridge.detail', {
        pension: formatCurrency(metrics.pensionAnnual),
      }),
    },
  ]

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b-3 border-neo-black bg-neo-white px-6 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-xl font-extrabold tracking-[0.12em]">{t('title')}</CardTitle>
            <p className="mt-2 text-sm font-medium text-muted-foreground">{t('description')}</p>
          </div>
          <div
            className={cn(
              'inline-flex w-fit items-center gap-2 border-3 px-4 py-2 text-[0.72rem] font-extrabold uppercase tracking-[0.14em]',
              healthClasses[metrics.health]
            )}
          >
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            {t(`health.${metrics.health}`)}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 bg-neo-white p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricItems.map((item) => {
            const Icon = item.icon

            return (
              <div
                key={item.key}
                className="border-2 border-neo-black bg-background p-4 shadow-neo-sm"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {t(`metrics.${item.key}.label`)}
                  </span>
                  <Icon className="h-4 w-4 text-neo-blue" aria-hidden="true" />
                </div>
                <div className="text-2xl font-black text-neo-black">{item.value}</div>
                <p className="mt-2 text-xs font-medium text-muted-foreground">{item.detail}</p>
              </div>
            )
          })}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="border-2 border-neo-black bg-background p-5">
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
                <strong className="text-right">
                  {formatCurrency(metrics.firstYearPortfolioNeed)}
                </strong>
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
          </div>

          <div className="border-2 border-neo-black bg-background p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Landmark className="h-5 w-5 text-neo-blue" aria-hidden="true" />
                <h4 className="text-sm font-extrabold uppercase tracking-[0.16em]">
                  {t('scenarios.title')}
                </h4>
              </div>
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {scenarioStatus === 'loading' ? t('scenarios.loading') : t('scenarios.preview')}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {(scenarioStatus === 'loading' ? buildScenarioParams(params) : scenarios).map(
                (scenario) => {
                  const isResolved = 'delta' in scenario
                  const health = isResolved ? getPlanHealth(scenario.successRate) : 'watch'

                  return (
                    <div
                      key={scenario.id}
                      className="grid grid-cols-[1fr_auto] items-center gap-4 border-2 border-neo-black bg-neo-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-neo-black">
                          {t(`scenarios.items.${scenario.id}.name`)}
                        </p>
                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                          {t(`scenarios.items.${scenario.id}.description`)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        {isResolved ? (
                          <>
                            <span
                              className={cn(
                                'border-2 px-2 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em]',
                                healthClasses[health]
                              )}
                            >
                              {scenario.delta >= 0 ? '+' : ''}
                              {scenario.delta.toFixed(1)} pts
                            </span>
                            <ArrowRight
                              className="h-4 w-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="w-14 text-[0.72rem] font-black">
                              {scenario.successRate.toFixed(1)}%
                            </span>
                          </>
                        ) : (
                          <span className="h-7 w-24 animate-pulse border-2 border-neo-black bg-muted" />
                        )}
                      </div>
                    </div>
                  )
                }
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
