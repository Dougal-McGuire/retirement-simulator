'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { AnimatedCounter } from '@/components/ui/animated-counter'
import { useFormatter, useTranslations } from 'next-intl'

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
      <Card className="border shadow-soft">
        <div className="relative">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-gray-800">
              <span>{t('title')}</span>
              <div className="animate-pulse w-6 h-6 bg-gray-300 rounded" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-3">
                  <div className="animate-pulse h-10 w-24 bg-gray-300 rounded" />
                </div>
                <div className="animate-pulse h-3 w-40 bg-gray-300 rounded mt-3" />
              </div>
              <div className="text-right">
                <div className="animate-pulse h-3 w-20 bg-gray-300 rounded mb-1" />
                <div className="animate-pulse h-3 w-24 bg-gray-300 rounded" />
              </div>
            </div>
            <div className="mt-6">
              <div className="animate-pulse h-2 w-full bg-gray-300 rounded" />
            </div>
          </CardContent>
        </div>
      </Card>
    )
  }

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 90) return 'text-emerald-600'
    if (rate >= 75) return 'text-amber-600'
    return 'text-red-600'
  }

  const getSuccessRateIcon = (rate: number) => {
    if (rate >= 90) return <TrendingUp className="h-5 w-5 text-emerald-600" />
    if (rate >= 75) return <AlertTriangle className="h-6 w-6 text-amber-500" />
    return <TrendingDown className="h-6 w-6 text-red-500" />
  }

  const getSuccessRateMessage = (rate: number) => {
    if (rate >= 95) return t('messages.excellent')
    if (rate >= 90) return t('messages.veryGood')
    if (rate >= 80) return t('messages.good')
    if (rate >= 70) return t('messages.moderate')
    if (rate >= 50) return t('messages.low')
    return t('messages.veryLow')
  }

  const getBorderClasses = (rate: number) => {
    if (rate >= 90) return 'border-emerald-200'
    if (rate >= 75) return 'border-amber-200'
    return 'border-red-200'
  }

  const getProgressColor = (rate: number) => {
    if (rate >= 90) return 'bg-emerald-500'
    if (rate >= 75) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <Card className={`border ${getBorderClasses(successRate)}`}>
      <div className="relative">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between text-gray-900">
            <span className="font-semibold">{t('title')}</span>
            {getSuccessRateIcon(successRate)}
          </CardTitle>
        </CardHeader>

        <CardContent>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <AnimatedCounter
                  end={successRate}
                  duration={2.5}
                  decimals={1}
                  suffix="%"
                  className={`text-4xl font-bold ${getSuccessRateColor(successRate)}`}
                />
              </div>
              <p
                className={`text-sm font-medium transition-colors duration-300 ${
                  successRate >= 90
                    ? 'text-emerald-700'
                    : successRate >= 75
                      ? 'text-amber-700'
                      : 'text-red-700'
                }`}
              >
                {getSuccessRateMessage(successRate)}
              </p>
            </div>

            <div className="text-right text-sm text-gray-600 ml-4">
              <p className="font-medium">{t('summary.basedOn')}</p>
              <p>{t('summary.runs', { count: format.number(simulationRuns) })}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-6">
            <div className="flex justify-between text-xs font-medium text-gray-500 mb-1">
              <span>{t('progress.min')}</span>
              <span className="text-gray-700">{t('progress.label')}</span>
              <span>{t('progress.max')}</span>
            </div>
            <div className="relative">
              <div className="w-full bg-gray-200 rounded h-2">
                <div
                  className={`h-2 rounded ${getProgressColor(successRate)}`}
                  style={{
                    width: `${Math.max(3, Math.min(100, successRate))}%`,
                  }}
                ></div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-600">
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
