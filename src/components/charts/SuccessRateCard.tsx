'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { AnimatedCounter } from '@/components/ui/animated-counter'
import { useFormatter, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface SuccessRateCardProps {
  successRate: number
  isLoading: boolean
  simulationRuns?: number
}

export function SuccessRateCard({
  successRate,
  isLoading,
  simulationRuns = 1000,
}: SuccessRateCardProps) {
  const t = useTranslations('successCard')
  const format = useFormatter()

  if (isLoading) {
    return (
      <Card className="overflow-hidden rounded-3xl border border-white/70 bg-white/85 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl ring-1 ring-slate-200/40">
        <div className="relative">
          <CardHeader className="border-b border-white/60 bg-white/50 pb-3">
            <CardTitle className="flex items-center justify-between text-slate-800">
              <span>{t('title')}</span>
              <div className="h-6 w-6 animate-pulse rounded-full bg-slate-200" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-24 animate-pulse rounded-xl bg-slate-200" />
                </div>
                <div className="mt-3 h-3 w-40 animate-pulse rounded-full bg-slate-200" />
              </div>
              <div className="text-right">
                <div className="mb-1 h-3 w-20 animate-pulse rounded-full bg-slate-200" />
                <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200" />
              </div>
            </div>
            <div className="mt-6">
              <div className="h-2 w-full animate-pulse rounded-full bg-slate-200" />
            </div>
          </CardContent>
        </div>
      </Card>
    )
  }

  const getSuccessRateIcon = (rate: number) => {
    if (rate >= 90) return <TrendingUp className="h-5 w-5 text-emerald-500" />
    if (rate >= 75) return <AlertTriangle className="h-6 w-6 text-amber-500" />
    return <TrendingDown className="h-6 w-6 text-rose-500" />
  }

  const getSuccessRateMessage = (rate: number) => {
    if (rate >= 95) return t('messages.excellent')
    if (rate >= 90) return t('messages.veryGood')
    if (rate >= 80) return t('messages.good')
    if (rate >= 70) return t('messages.moderate')
    if (rate >= 50) return t('messages.low')
    return t('messages.veryLow')
  }

  const tone = useMemo(() => {
    if (successRate >= 90)
      return {
        card: 'border-emerald-300/50 ring-emerald-200/30 shadow-[0_26px_80px_rgba(16,185,129,0.18)]',
        chip: 'bg-emerald-100/80 text-emerald-700',
        text: 'text-emerald-700',
        progress: 'from-emerald-400 to-emerald-600',
      }
    if (successRate >= 75)
      return {
        card: 'border-amber-300/60 ring-amber-200/30 shadow-[0_26px_80px_rgba(245,158,11,0.16)]',
        chip: 'bg-amber-100/80 text-amber-700',
        text: 'text-amber-700',
        progress: 'from-amber-400 to-amber-600',
      }
    return {
      card: 'border-rose-300/60 ring-rose-200/30 shadow-[0_26px_80px_rgba(244,63,94,0.16)]',
      chip: 'bg-rose-100/80 text-rose-700',
      text: 'text-rose-700',
      progress: 'from-rose-400 to-rose-600',
    }
  }, [successRate])

  return (
    <Card
      className={cn(
        'relative overflow-hidden rounded-3xl border border-white/70 bg-white/85 backdrop-blur-xl ring-1 ring-slate-200/40 transition-shadow',
        tone.card
      )}
    >
      <div className="relative">
        <CardHeader className="border-b border-white/60 bg-white/50 pb-4">
          <CardTitle className="flex items-center justify-between text-slate-900">
            <span className="text-base font-semibold">{t('title')}</span>
            {getSuccessRateIcon(successRate)}
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="mb-3 flex items-center gap-3">
                <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', tone.chip)}>
                  {t('summary.confidenceLabel')}
                </span>
                <AnimatedCounter
                  end={successRate}
                  duration={2.5}
                  decimals={1}
                  suffix="%"
                  className={cn('text-4xl font-bold', tone.text)}
                />
              </div>
              <p className={cn('text-sm font-medium transition-colors duration-300', tone.text)}>
                {getSuccessRateMessage(successRate)}
              </p>
            </div>

            <div className="ml-0 text-sm text-slate-600 sm:text-right">
              <p className="font-medium text-slate-500">{t('summary.basedOn')}</p>
              <p className="text-slate-700">{t('summary.runs', { count: format.number(simulationRuns) })}</p>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
              <span>{t('progress.min')}</span>
              <span className="text-slate-600">{t('progress.label')}</span>
              <span>{t('progress.max')}</span>
            </div>
            <div className="relative">
              <div className="h-2 w-full rounded-full bg-slate-200">
                <div
                  className={cn('h-2 rounded-full bg-gradient-to-r', tone.progress)}
                  style={{ width: `${Math.max(3, Math.min(100, successRate))}%` }}
                />
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            {t('summary.detail', {
              rate: successRate.toFixed(1),
              runs: format.number(simulationRuns),
            })}
          </p>
        </CardContent>
      </div>
    </Card>
  )
}
