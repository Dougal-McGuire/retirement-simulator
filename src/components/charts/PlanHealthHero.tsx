'use client'

import React, { useMemo } from 'react'
import { AlertTriangle, Pencil } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { SimulationParams, SimulationResults } from '@/types'
import { buildPlanInsightMetrics } from '@/lib/simulation/planInsights'
import { useDisplayReal } from '@/lib/stores/displayStore'
import { computePlanHealthScore, type PlanHealthLabel } from '@/lib/insights/planHealth'
import { deriveDepletionAges } from '@/lib/insights/depletion'
import { buildPlanWarnings, type PlanWarning } from '@/lib/insights/warnings'
import { AnimatedCounter } from '@/components/ui/animated-counter'
import { Card, CardContent } from '@/components/ui/card'
import { HISTORICAL_PATH_COUNT } from '@/lib/simulation/data/historicalMarket'
import { cn } from '@/lib/utils'

interface PlanHealthHeroProps {
  params: SimulationParams
  results: SimulationResults | null
  isLoading: boolean
  /**
   * Opens the plan editor focused on the field behind a tile, so a number the
   * user disagrees with is one click away from being changed.
   */
  onEditField?: (fieldId: string) => void
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

function successToneClass(rate: number) {
  if (rate >= 90) return 'text-neo-green'
  if (rate >= 75) return 'text-warning-600'
  return 'text-neo-red'
}

function successStroke(rate: number) {
  if (rate >= 90) return 'var(--neo-green)'
  if (rate >= 75) return '#d97706'
  return 'var(--neo-red)'
}

function SuccessGauge({ rate }: { rate: number }) {
  const locale = useLocale()
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, rate))
  // "99.6%" in English, "99,6 %" in German — including the locale's spacing
  // rule around the percent sign.
  const percentSuffix = new Intl.NumberFormat(locale, { style: 'percent' })
    .format(0)
    .replace(/[\d٠-٩]/g, '')

  return (
    <div className="relative h-36 w-36 shrink-0 sm:h-40 sm:w-40">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="rgb(var(--neo-black-rgb) / 0.08)"
          strokeWidth="9"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={successStroke(clamped)}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset,stroke] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedCounter
          end={clamped}
          duration={1.2}
          decimals={clamped >= 99.95 ? 0 : 1}
          suffix={percentSuffix}
          locale={locale}
          className={cn(
            'whitespace-nowrap text-2xl font-black leading-none tabular-nums sm:text-[1.6rem]',
            successToneClass(clamped)
          )}
        />
      </div>
    </div>
  )
}

export function PlanHealthHero({ params, results, isLoading, onEditField }: PlanHealthHeroProps) {
  const t = useTranslations('planHero')
  const tEditor = useTranslations('planEditor')
  const format = useFormatter()

  const health = useMemo(
    () => (results ? computePlanHealthScore(params, results) : null),
    [params, results]
  )
  const displayReal = useDisplayReal()
  const metrics = useMemo(
    () => buildPlanInsightMetrics(params, results, { displayReal }),
    [params, results, displayReal]
  )
  const depletion = useMemo(
    () =>
      results ? deriveDepletionAges(results) : { p10DepletionAge: null, p50DepletionAge: null },
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

  const tiles: {
    key: string
    label: string
    value: React.ReactNode
    detail: string
    edit?: { fieldId: string; label: string }
  }[] = [
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
      edit: { fieldId: 'editor-endAge', label: `${params.endAge}` },
    },
    {
      key: 'withdrawal',
      label: t('withdrawal.label'),
      value:
        results && metrics.firstYearWithdrawalRate !== null
          ? formatPercent(metrics.firstYearWithdrawalRate)
          : t('notAvailable'),
      detail: results
        ? t('withdrawal.detail', { need: formatCurrency(metrics.firstYearPortfolioNeed) })
        : '',
    },
    {
      key: 'bridge',
      label: t('bridge.label'),
      value: t('bridge.value', { years: metrics.bridgeYears }),
      detail: t('bridge.detail', { age: params.legalRetirementAge }),
      edit: { fieldId: 'editor-retirementAge', label: `${params.retirementAge}` },
    },
  ]

  return (
    <Card className="overflow-hidden border-3 border-neo-black">
      <CardContent className={cn('bg-neo-white p-5', isLoading && 'animate-pulse opacity-70')}>
        <h2 className="sr-only">{t('title')}</h2>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
          {/* Success rate hero */}
          <div className="flex items-center gap-5 border-2 border-neo-black bg-background p-4 shadow-neo-sm lg:max-w-[21rem] lg:shrink-0">
            {results ? (
              <SuccessGauge rate={results.successRate} />
            ) : (
              <div className="flex h-36 w-36 shrink-0 items-center justify-center sm:h-40 sm:w-40">
                <span className="text-3xl font-black text-muted-foreground">
                  {t('notAvailable')}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {t('success.label')}
              </span>
              <p className="mt-1.5 text-xs font-medium leading-relaxed text-foreground/80">
                {t('success.caption')}
              </p>
              {results && (
                <p className="mt-2 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {params.marketModel === 'historical'
                    ? t('success.detailHistorical', {
                        runs: format.number(HISTORICAL_PATH_COUNT),
                      })
                    : t('success.detail', { runs: format.number(params.simulationRuns) })}
                </p>
              )}
            </div>
          </div>

          {/* Supporting stats */}
          <div className="grid flex-1 grid-cols-2 gap-4">
            {tiles.map((tile) => (
              <div
                key={tile.key}
                className="relative border-2 border-neo-black bg-background p-4 shadow-neo-sm"
              >
                <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {tile.label}
                </span>
                {tile.edit && onEditField && (
                  <button
                    type="button"
                    data-testid={`hero-edit-${tile.key}`}
                    onClick={() => onEditField(tile.edit!.fieldId)}
                    aria-label={tEditor('editAria', { field: tile.label })}
                    title={tEditor('editAria', { field: tile.label })}
                    className="absolute right-2 top-2 inline-flex items-center gap-1 border-2 border-neo-black bg-neo-white px-1.5 py-0.5 text-[0.58rem] font-extrabold tabular-nums text-neo-black transition-neo hover:bg-neo-yellow"
                  >
                    {tile.edit.label}
                    <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                  </button>
                )}
                <div className="mt-2 text-xl font-black text-neo-black sm:text-2xl">
                  {tile.value}
                </div>
                {tile.detail && (
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{tile.detail}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {warnings.length > 0 && (
          <ul role="alert" className="mt-5 space-y-2">
            {warnings.map((warning) => (
              <li
                key={warning.id}
                className="flex items-start gap-3 border-2 border-neo-red/70 bg-neo-red/10 px-4 py-3 text-sm font-semibold text-neo-red"
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
