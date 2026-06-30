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
import { PlanDashboard } from '@/components/charts/PlanDashboard'
import { ParameterSidebar } from '@/components/navigation/ParameterSidebar'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { MobileMenu } from '@/components/navigation/MobileMenu'
import { VersionInfo } from '@/components/navigation/VersionInfo'
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
  const actionSummaryItems = useMemo(() => {
    if (successTone === 'high') {
      return [
        t('actionSummary.items.high.review'),
        t('actionSummary.items.high.contributions'),
        t('actionSummary.items.high.report'),
      ]
    }

    if (successTone === 'medium') {
      return [
        t('actionSummary.items.medium.spending'),
        t('actionSummary.items.medium.compare'),
        t('actionSummary.items.medium.report'),
      ]
    }

    return [
      t('actionSummary.items.low.savings'),
      t('actionSummary.items.low.expenses'),
      t('actionSummary.items.low.assumptions'),
    ]
  }, [successTone, t])

  // Run initial simulation if no results exist
  // This happens on first visit or when params have changed and results were invalidated
  useEffect(() => {
    if (!results && !isLoading) {
      runSimulation()
    }
  }, []) // Empty deps - only run once on mount

  return (
    <div className="app-page app-page-simulation relative min-h-screen pb-16">
      {/* Live region for screen readers to announce simulation results */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {successRate != null &&
          `Simulation complete. Success rate: ${formattedSuccessRate}. ${successMessage}`}
      </div>
      {/* Header */}
      <header id="navigation" className="theme-page-header relative z-10 pt-12 pb-10">
        <div className="theme-container mx-auto max-w-[90rem] px-2 sm:px-3 lg:px-4">
          <div className="theme-hero neo-surface relative overflow-hidden px-8 py-10 transition-neo">
            <div className="theme-hero-layout relative flex flex-col gap-10">
              <div className="theme-hero-top flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-col gap-5 text-neo-black">
                  <div className="theme-badge-row flex flex-wrap items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.32em]">
                    <span className="neo-chip bg-neo-yellow text-neo-black shadow-neo-sm">
                      {t('header.badges.engine')}
                    </span>
                    <span className="neo-chip bg-neo-white text-muted-foreground shadow-neo-sm">
                      {t('header.badges.runs', { count: formattedRuns })}
                    </span>
                    <VersionInfo />
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

                {/* Desktop Actions */}
                <div className="theme-action-strip hidden lg:flex lg:flex-col lg:gap-3">
                  <LocaleSwitcher className="w-48" />
                  <GenerateReportButton
                    results={results}
                    params={params}
                    disabled={isLoading}
                    variant="secondary"
                    size="sm"
                    buttonClassName="w-48"
                  />
                  <Button variant="secondary" size="sm" asChild className="w-48">
                    <Link href="/setup">{t('header.setupLink')}</Link>
                  </Button>
                </div>

                {/* Mobile Actions */}
                <div className="theme-mobile-actions flex items-center gap-3 lg:hidden">
                  <GenerateReportButton
                    results={results}
                    params={params}
                    disabled={isLoading}
                    variant="default"
                    size="lg"
                    buttonClassName="flex-1 min-h-[44px]"
                  />
                  <MobileMenu
                    results={results}
                    params={params}
                    isLoading={isLoading}
                    showSetupLink
                  />
                </div>
              </div>
              {/* Removed redundant success probability banner */}
            </div>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="theme-container relative z-10 mx-auto mt-2 max-w-[90rem] px-2 pb-16 sm:px-3 lg:px-4"
      >
        <div className="theme-page-grid theme-simulation-grid grid grid-cols-1 gap-8 lg:grid-cols-[432px_minmax(0,1fr)] xl:grid-cols-[456px_minmax(0,1fr)]">
          <ParameterSidebar className="theme-parameter-sidebar" />

          <div className="theme-content theme-simulation-content space-y-6">
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

            <PlanDashboard params={params} results={results} isLoading={isLoading} />

            <Card className="theme-action-card">
              <CardHeader className="border-b-3 border-neo-black bg-neo-white">
                <CardTitle className="text-xl font-extrabold tracking-[0.16em]">
                  {t('actionSummary.title')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t('actionSummary.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <p className="text-sm font-medium text-foreground/80">
                  {successMessage ?? t('actionSummary.fallback')}
                </p>
                <ul className="space-y-3">
                  {actionSummaryItems.map((item) => (
                    <li
                      key={item}
                      className="border-2 border-neo-black bg-neo-white px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.12em]"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="theme-chart-card">
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
