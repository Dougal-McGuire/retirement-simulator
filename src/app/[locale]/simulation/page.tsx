'use client'

import { useEffect, useMemo } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Sparkles } from 'lucide-react'
import { Link } from '@/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useSimulationStore,
  useSimulationParams,
  useSimulationResults,
  useSimulationLoading,
} from '@/lib/stores/simulationStore'
import { SimulationChart } from '@/components/charts/SimulationChart'
import { SuccessRateCard } from '@/components/charts/SuccessRateCard'
import { ParameterSidebar } from '@/components/navigation/ParameterSidebar'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { GenerateReportButton } from '@/components/GenerateReportButton'
import { ChartSkeleton, SuccessRateCardSkeleton } from '@/components/ui/skeleton'

export default function SimulationPage() {
  const t = useTranslations('simulation')
  const format = useFormatter()
  const params = useSimulationParams()
  const results = useSimulationResults()
  const isLoading = useSimulationLoading()
  const runSimulation = useSimulationStore((state) => state.runSimulation)

  const successRate = results?.successRate
  const formattedRuns = useMemo(
    () => format.number(params.simulationRuns),
    [format, params.simulationRuns]
  )

  const formattedSuccessRate = useMemo(() => {
    if (successRate == null) return null
    return format.number(successRate / 100, {
      style: 'percent',
      minimumFractionDigits: successRate % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    })
  }, [format, successRate])

  const successTone = useMemo(() => {
    if (successRate == null) return null
    if (successRate >= 90) return 'high'
    if (successRate >= 75) return 'medium'
    return 'low'
  }, [successRate])

  const successMessage = successTone ? t(`header.confidence.${successTone}`) : null

  // Run initial simulation
  useEffect(() => {
    if (!results) {
      runSimulation()
    }
  }, [results, runSimulation])

  return (
    <div className="relative min-h-screen overflow-hidden pb-16">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[10%] top-[-140px] h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute right-[6%] top-24 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute left-1/2 top-[420px] h-[420px] w-[520px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      {/* Header */}
      <header id="navigation" className="relative z-10 pt-12 pb-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-6 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-28 -top-32 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
            <div className="pointer-events-none absolute -left-32 bottom-0 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative flex flex-col gap-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-4 text-slate-900">
                  <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                    <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-primary-700">
                      {t('header.badges.engine')}
                    </span>
                    <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-slate-600 normal-case tracking-[0.08em]">
                      {t('header.badges.runs', { count: formattedRuns })}
                    </span>
                  </div>
                  <div>
                    <h1 className="text-3xl font-semibold sm:text-4xl">{t('header.title')}</h1>
                    <p className="mt-3 max-w-2xl text-base text-slate-600">
                      {t('header.subtitle')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <LocaleSwitcher className="h-10 w-full rounded-full border-white/60 bg-white/70 text-slate-700 shadow-inner sm:w-40" />
                  <GenerateReportButton
                    results={results}
                    params={params}
                    disabled={isLoading}
                    size="sm"
                    buttonClassName="h-10 rounded-full bg-gradient-to-r from-primary via-indigo-500 to-sky-500 px-5 text-white shadow-lg transition hover:from-primary/90 hover:via-indigo-500/90 hover:to-sky-500/90"
                    wrapperClassName="w-full sm:w-auto"
                  />
                  <Button
                    size="sm"
                    asChild
                    className="h-10 rounded-full border-white/70 bg-white/80 text-slate-700 shadow-sm transition hover:border-primary/40 hover:text-primary-700"
                  >
                    <Link href="/setup">{t('header.setupLink')}</Link>
                  </Button>
                </div>
              </div>

              {formattedSuccessRate && (
                <div className="flex flex-col gap-4 rounded-2xl border border-white/70 bg-white/75 px-5 py-4 text-slate-700 shadow-inner sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary-700 shadow-inner">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                        {t('header.confidenceLabel')}
                      </p>
                      <p className="text-2xl font-semibold text-slate-900">{formattedSuccessRate}</p>
                    </div>
                  </div>
                  <div className="text-sm text-slate-600 sm:max-w-sm">
                    {successMessage}
                    <div className="mt-2 text-xs text-slate-500">
                      {t('header.confidenceMeta', { count: formattedRuns })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="relative z-10 mx-auto mt-6 max-w-7xl px-4 pb-20 sm:px-6 lg:px-8"
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
          <ParameterSidebar />

          <div className="space-y-8">
            {isLoading ? (
              <Card className="overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl ring-1 ring-slate-200/50">
                <SuccessRateCardSkeleton />
              </Card>
            ) : (
              <SuccessRateCard
                successRate={results?.successRate || 0}
                isLoading={isLoading}
                simulationRuns={params.simulationRuns}
              />
            )}

            <Card className="overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl ring-1 ring-slate-200/50">
              <CardHeader className="border-b border-white/60 bg-white/40">
                <CardTitle className="text-xl font-semibold text-slate-900">
                  {t('charts.asset.title')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm text-slate-600">
                  {t('charts.asset.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {isLoading ? (
                  <ChartSkeleton />
                ) : (
                  <SimulationChart results={results} isLoading={isLoading} />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
