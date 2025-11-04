'use client'

import { useEffect, useMemo } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
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
    <div className="relative min-h-screen pb-16">
      {/* Header */}
      <header id="navigation" className="relative z-10 pt-12 pb-10">
        <div className="mx-auto max-w-[90rem] px-2 sm:px-3 lg:px-4">
          <div className="neo-surface relative overflow-hidden px-8 py-10 transition-neo">
            <div className="relative flex flex-col gap-10">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-col gap-5 text-neo-black">
                  <div className="flex flex-wrap items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.32em]">
                    <span className="neo-chip bg-neo-yellow text-neo-black shadow-neo-sm">
                      {t('header.badges.engine')}
                    </span>
                    <span className="neo-chip bg-neo-white text-muted-foreground shadow-neo-sm">
                      {t('header.badges.runs', { count: formattedRuns })}
                    </span>
                  </div>
                  <div>
                    <h1 className="text-3xl font-black tracking-[0.14em] sm:text-4xl">
                      {t('header.title')}
                    </h1>
                    <p className="mt-4 max-w-2xl font-medium text-foreground/80">
                      {t('header.subtitle')}
                    </p>
                    {successMessage && (
                      <span className="neo-chip mt-5 bg-neo-white px-5 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] shadow-neo-sm">
                        {successMessage}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <LocaleSwitcher className="w-full sm:w-48" />
                  <GenerateReportButton
                    results={results}
                    params={params}
                    disabled={isLoading}
                    variant="secondary"
                    size="sm"
                    wrapperClassName="w-full sm:w-auto"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="min-w-[9rem]"
                  >
                    <Link href="/setup">{t('header.setupLink')}</Link>
                  </Button>
                </div>
              </div>
              {/* Removed redundant success probability banner */}
            </div>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="relative z-10 mx-auto mt-2 max-w-[90rem] px-2 pb-16 sm:px-3 lg:px-4"
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
          <ParameterSidebar />

          <div className="space-y-6">
            {isLoading ? (
              <Card>
                <SuccessRateCardSkeleton />
              </Card>
            ) : (
              <SuccessRateCard
                successRate={results?.successRate || 0}
                isLoading={isLoading}
                simulationRuns={params.simulationRuns}
              />
            )}

            <Card>
              <CardHeader className="border-b-3 border-neo-black bg-neo-white">
                <CardTitle className="text-xl font-extrabold tracking-[0.16em]">
                  {t('charts.asset.title')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
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
