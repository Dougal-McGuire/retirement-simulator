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
      <Card className="overflow-hidden">
        <div className="relative">
          <CardHeader className="border-b-4 border-neo-black bg-muted pb-3">
            <CardTitle className="flex items-center justify-between">
              <span>{t('title')}</span>
              <div className="h-6 w-6 animate-pulse rounded-none bg-slate-300 border-2 border-neo-black" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-24 animate-pulse rounded-none bg-slate-300 border-2 border-neo-black" />
                </div>
                <div className="mt-3 h-3 w-40 animate-pulse rounded-none bg-slate-300" />
              </div>
              <div className="text-right">
                <div className="mb-1 h-3 w-20 animate-pulse rounded-none bg-slate-300" />
                <div className="h-3 w-24 animate-pulse rounded-none bg-slate-300" />
              </div>
            </div>
            <div className="mt-6">
              <div className="h-3 w-full animate-pulse rounded-none bg-slate-300 border-2 border-neo-black" />
            </div>
          </CardContent>
        </div>
      </Card>
    )
  }

  const getSuccessRateIcon = (rate: number) => {
    if (rate >= 90) return <TrendingUp className="h-6 w-6 text-neo-green" />
    if (rate >= 75) return <AlertTriangle className="h-6 w-6 text-warning-600" />
    return <TrendingDown className="h-6 w-6 text-neo-red" />
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
        card: 'shadow-neo-green',
        chip: 'bg-neo-green text-neo-black',
        text: 'text-neo-green',
        progress: 'bg-neo-green',
        bg: 'bg-success-50',
      }
    if (successRate >= 75)
      return {
        card: 'shadow-[6px_6px_0px_#f6c90e]',
        chip: 'bg-warning-500 text-neo-black',
        text: 'text-warning-600',
        progress: 'bg-warning-500',
        bg: 'bg-warning-50',
      }
    return {
      card: 'shadow-neo-red',
      chip: 'bg-neo-red text-neo-white',
      text: 'text-neo-red',
      progress: 'bg-neo-red',
      bg: 'bg-red-50',
    }
  }, [successRate])

  return (
    <Card
      className={cn(
        'relative overflow-hidden border-3 border-neo-black',
        tone.card,
        tone.bg
      )}
    >
      <div className="relative">
        <CardHeader className="border-b-3 border-neo-black bg-neo-white pb-5">
          <CardTitle className="flex items-center justify-between text-lg font-extrabold uppercase tracking-[0.2em]">
            <span>{t('title')}</span>
            {getSuccessRateIcon(successRate)}
          </CardTitle>
        </CardHeader>

        <CardContent className="bg-neo-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="mb-4 flex items-center gap-4">
                <span
                  className={cn(
                    'neo-chip px-4 py-2 text-[0.7rem] tracking-[0.2em] shadow-neo-sm',
                    tone.chip
                  )}
                >
                  {t('summary.confidenceLabel')}
                </span>
                <AnimatedCounter
                  end={successRate}
                  duration={2.5}
                  decimals={1}
                  suffix="%"
                  className={cn('text-6xl font-black tracking-tight', tone.text)}
                />
              </div>
              <p className={cn('text-[0.74rem] font-bold uppercase tracking-[0.16em]', tone.text)}>
                {getSuccessRateMessage(successRate)}
              </p>
            </div>

            <div className="ml-0 text-[0.72rem] uppercase tracking-[0.16em] sm:text-right">
              <p className="font-bold text-foreground">{t('summary.basedOn')}</p>
              <p className="font-semibold text-muted-foreground">
                {t('summary.runs', { count: format.number(simulationRuns) })}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex justify-between text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span>{t('progress.min')}</span>
              <span>{t('progress.label')}</span>
              <span>{t('progress.max')}</span>
            </div>
            <div className="relative">
              <div className="h-5 w-full border-3 border-neo-black bg-neo-white">
                <div
                  className={cn('h-full border-r-3 border-neo-black', tone.progress)}
                  style={{ width: `${Math.max(3, Math.min(100, successRate))}%` }}
                />
              </div>
            </div>
          </div>
          <p className="mt-5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
