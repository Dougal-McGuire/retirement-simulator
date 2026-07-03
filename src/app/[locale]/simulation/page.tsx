'use client'

import { useEffect, useMemo } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useSimulationStore,
  useSimulationParams,
  useSimulationResults,
  useSimulationLoading,
} from '@/lib/stores/simulationStore'
import { PlanHealthHero } from '@/components/charts/PlanHealthHero'
import { AssetsSection } from '@/components/charts/AssetsSection'
import { SpendingSection } from '@/components/charts/SpendingSection'
import { ShortfallChart } from '@/components/charts/ShortfallChart'
import { CashflowCard } from '@/components/charts/CashflowCard'
import { ScenarioList } from '@/components/charts/ScenarioList'
import { RecommendationList } from '@/components/charts/RecommendationList'
import { ChartEmptyState } from '@/components/charts/ChartEmptyState'
import { ParameterSidebar } from '@/components/navigation/ParameterSidebar'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { MobileMenu } from '@/components/navigation/MobileMenu'
import { VersionInfo } from '@/components/navigation/VersionInfo'
import { GenerateReportButton } from '@/components/GenerateReportButton'
import { ChartSkeleton } from '@/components/ui/skeleton'

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

  // Run initial simulation if no results exist
  // This happens on first visit or when params have changed and results were invalidated
  useEffect(() => {
    if (!results && !isLoading) {
      runSimulation()
    }
  }, []) // Empty deps - only run once on mount

  const renderTabBody = (content: React.ReactNode) => {
    if (isLoading) return <ChartSkeleton />
    if (!results) return <ChartEmptyState />
    return content
  }

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
            </div>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="theme-container relative z-10 mx-auto mt-2 max-w-[90rem] px-2 pb-28 sm:px-3 lg:px-4 lg:pb-16"
      >
        <div className="theme-page-grid theme-simulation-grid grid grid-cols-1 gap-8 lg:grid-cols-[432px_minmax(0,1fr)] xl:grid-cols-[456px_minmax(0,1fr)]">
          <ParameterSidebar className="theme-parameter-sidebar" />

          <div className="theme-content theme-simulation-content space-y-6">
            <PlanHealthHero params={params} results={results} isLoading={isLoading} />

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-1 border-3 border-neo-black bg-neo-white shadow-neo sm:grid-cols-3">
                <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
                <TabsTrigger value="details">{t('tabs.details')}</TabsTrigger>
                <TabsTrigger value="scenarios">{t('tabs.scenarios')}</TabsTrigger>
              </TabsList>

              <TabsContent
                value="overview"
                forceMount
                className="mt-6 space-y-6 data-[state=inactive]:hidden"
              >
                {renderTabBody(
                  results && (
                    <>
                      <AssetsSection results={results} />
                      <ShortfallChart results={results} />
                    </>
                  )
                )}
              </TabsContent>

              <TabsContent
                value="details"
                forceMount
                className="mt-6 space-y-6 data-[state=inactive]:hidden"
              >
                {renderTabBody(
                  results && (
                    <>
                      <SpendingSection results={results} />
                      <CashflowCard params={params} results={results} />
                    </>
                  )
                )}
              </TabsContent>

              <TabsContent
                value="scenarios"
                forceMount
                className="mt-6 space-y-6 data-[state=inactive]:hidden"
              >
                <ScenarioList params={params} results={results} isLoading={isLoading} />
                <RecommendationList params={params} results={results} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  )
}
