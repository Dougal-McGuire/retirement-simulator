'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { PlanSwitcher } from '@/components/plans/PlanSwitcher'
import { PlanComparison } from '@/components/plans/PlanComparison'
import { PlanEditor } from '@/components/plans/PlanEditor'
import { QuickAdjustBar } from '@/components/plans/QuickAdjustBar'
import { ParameterSidebar } from '@/components/navigation/ParameterSidebar'
import { AuthMenu } from '@/components/auth/AuthMenu'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { MobileMenu } from '@/components/navigation/MobileMenu'
import { VersionInfo } from '@/components/navigation/VersionInfo'
import { GenerateReportButton } from '@/components/GenerateReportButton'
import { ChartSkeleton } from '@/components/ui/skeleton'
import { HISTORICAL_PATH_COUNT } from '@/lib/simulation/data/historicalMarket'

type TabValue = 'overview' | 'details' | 'scenarios' | 'plan'

export default function SimulationPage() {
  const t = useTranslations('simulation')
  const format = useFormatter()
  const params = useSimulationParams()
  const results = useSimulationResults()
  const isLoading = useSimulationLoading()
  const runSimulation = useSimulationStore((state) => state.runSimulation)

  const [activeTab, setActiveTab] = useState<TabValue>('overview')
  const tabsRef = useRef<HTMLDivElement>(null)

  const successRate = results?.successRate
  const usesHistory = params.marketModel === 'historical'
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

  /** Brings the freshly selected tab body into view instead of leaving the
   *  reader staring at the section they just left (POLISH e08). */
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as TabValue)

    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      const node = tabsRef.current
      if (!node) return
      const { top } = node.getBoundingClientRect()
      const alreadyComfortable = top >= 0 && top <= window.innerHeight * 0.3
      if (alreadyComfortable) return
      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  /**
   * Jumps from a KPI card into the exact field that produced the number. The
   * editor tab mounts on demand, so the target is polled for a few frames, and
   * slider fields hand focus to their thumb rather than their wrapper.
   */
  const editPlanField = useCallback(
    (fieldId: string) => {
      handleTabChange('plan')

      let attempts = 0
      const focusTarget = () => {
        attempts += 1
        const field = document.getElementById(fieldId)
        if (!field) {
          if (attempts < 30) window.requestAnimationFrame(focusTarget)
          return
        }

        const focusable =
          field.matches('input, select, textarea, button, [tabindex]') ||
          field.getAttribute('role') === 'slider'
            ? field
            : (field.querySelector<HTMLElement>('[role="slider"], input, select, textarea') ??
              field)

        field.scrollIntoView({ behavior: 'smooth', block: 'center' })
        focusable.focus({ preventScroll: true })
      }

      window.requestAnimationFrame(focusTarget)
    },
    [handleTabChange]
  )

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
      {/* Mobile pays for every row above the first number, so the chrome is
          tighter there and the marketing copy only appears from `sm` up. */}
      <header
        id="navigation"
        className="theme-page-header relative z-10 pt-5 pb-5 sm:pt-12 sm:pb-10"
      >
        <div className="theme-container mx-auto max-w-[90rem] px-2 sm:px-3 lg:px-4">
          <div className="theme-hero neo-surface relative overflow-hidden px-4 py-5 transition-neo sm:px-8 sm:py-10">
            <div className="theme-hero-layout relative flex flex-col gap-6 sm:gap-10">
              <div className="theme-hero-top flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-3 text-neo-black sm:gap-5">
                  <div className="theme-badge-row flex flex-wrap items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.32em]">
                    <span className="neo-chip bg-neo-yellow text-neo-black shadow-neo-sm">
                      {usesHistory
                        ? t('header.badges.engineHistorical')
                        : t('header.badges.engine')}
                    </span>
                    {/* The run count is repeated under the success gauge. */}
                    {!usesHistory && (
                      <span className="neo-chip hidden bg-neo-white text-muted-foreground shadow-neo-sm sm:inline-flex">
                        {t('header.badges.runs', { count: formattedRuns })}
                      </span>
                    )}
                    {/* Historical mode does not sample: the badge says how many
                        real start years the numbers above are made of. */}
                    {usesHistory && (
                      <span
                        className="neo-chip bg-neo-yellow px-2 py-1 text-[0.58rem] tracking-[0.18em] text-neo-black shadow-neo-sm"
                        data-testid="market-model-badge"
                      >
                        {t('header.badges.historical', {
                          count: format.number(HISTORICAL_PATH_COUNT),
                        })}
                      </span>
                    )}
                    <VersionInfo />
                  </div>
                  <div>
                    <h1 className="text-3xl font-black tracking-[0.14em] sm:text-4xl">
                      {t('header.title')}
                    </h1>
                    <p className="mt-4 hidden max-w-2xl font-medium text-foreground/80 sm:block">
                      {t('header.subtitle')}
                    </p>
                    {successMessage && (
                      <span className="neo-chip mt-3 bg-neo-white px-3 py-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em] shadow-neo-sm sm:mt-5 sm:px-5 sm:py-2 sm:text-[0.68rem] sm:tracking-[0.24em]">
                        {successMessage}
                      </span>
                    )}
                  </div>
                  {/* One plan bar: switcher, plan actions and the state of the
                      working copy live here and nowhere else. */}
                  <PlanSwitcher className="max-w-3xl" />
                </div>

                {/* Desktop Actions */}
                <div className="theme-action-strip hidden lg:flex lg:flex-col lg:gap-3">
                  <AuthMenu className="w-48" />
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
                  <AuthMenu compact />
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
        <div className="theme-page-grid theme-simulation-grid grid grid-cols-1 gap-8">
          {/* Mobile-only editor drawer; the desktop editor is the Plan tab. */}
          <ParameterSidebar className="theme-parameter-sidebar" />

          <div className="theme-content theme-simulation-content space-y-6">
            <PlanHealthHero
              params={params}
              results={results}
              isLoading={isLoading}
              onEditField={editPlanField}
            />

            <QuickAdjustBar onOpenEditor={() => handleTabChange('plan')} />

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <div ref={tabsRef} className="scroll-mt-4">
                <TabsList className="grid w-full grid-cols-2 border-3 border-neo-black bg-neo-white shadow-neo sm:grid-cols-4">
                  <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
                  <TabsTrigger value="details">{t('tabs.details')}</TabsTrigger>
                  <TabsTrigger value="scenarios">{t('tabs.scenarios')}</TabsTrigger>
                  <TabsTrigger value="plan" data-testid="tab-plan">
                    {t('tabs.plan')}
                  </TabsTrigger>
                </TabsList>
              </div>

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
                <PlanComparison />
                <ScenarioList params={params} results={results} isLoading={isLoading} />
                <RecommendationList params={params} results={results} />
              </TabsContent>

              {/* Not force-mounted: the editor holds no state of its own (the
                  store does), and keeping it out of the tree while the charts
                  are on screen keeps slider scrubbing cheap. */}
              <TabsContent value="plan" className="mt-6 space-y-6">
                <PlanEditor />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  )
}
