'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
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
import { LegacyGoalCard } from '@/components/charts/LegacyGoalCard'
import { CashflowCard } from '@/components/charts/CashflowCard'
import { ScenarioList } from '@/components/charts/ScenarioList'
import { RecommendationList } from '@/components/charts/RecommendationList'
import { ChartEmptyState } from '@/components/charts/ChartEmptyState'
import { PlanSwitcher } from '@/components/plans/PlanSwitcher'
import { PlanComparison } from '@/components/plans/PlanComparison'
import { PlanEditor } from '@/components/plans/PlanEditor'
import { QuickAdjustBar } from '@/components/plans/QuickAdjustBar'
import { ParameterSidebar } from '@/components/navigation/ParameterSidebar'
import { WelcomeStrip } from '@/components/navigation/WelcomeStrip'
import { AuthMenu } from '@/components/auth/AuthMenu'
import { AppHeader } from '@/components/navigation/AppHeader'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { ThemeSwitcher } from '@/components/navigation/ThemeSwitcher'
import { MobileMenu } from '@/components/navigation/MobileMenu'
import { VersionInfo } from '@/components/navigation/VersionInfo'
import { GenerateReportButton } from '@/components/GenerateReportButton'
import { ChartSkeleton } from '@/components/ui/skeleton'
import { HISTORICAL_PATH_COUNT } from '@/lib/simulation/data/historicalMarket'
import { useSetPlanSectionCollapsed } from '@/lib/stores/displayStore'
import { scrollToPlanSection } from '@/components/plans/planSections'

type TabValue = 'overview' | 'details' | 'scenarios' | 'plan'

/**
 * Height of whatever sticky chrome currently overlaps the top of the viewport
 * (the mobile parameter-drawer trigger; nothing at `lg`). Measured rather than
 * hard-coded so a taller label or a different font never re-opens the bug where
 * the tab strip parks underneath it and stops taking taps.
 */
function stickyChromeHeight(): number {
  if (typeof document === 'undefined') return 0
  const bar = document.querySelector('[data-sticky-chrome="true"]')
  if (!bar) return 0
  const rect = bar.getBoundingClientRect()
  // `rect.bottom`, not `rect.height`: the bar retracts above the viewport while
  // the reader scrolls down, and a retracted bar overlaps nothing.
  return rect.top <= 1 && rect.bottom > 0 ? rect.bottom : 0
}

export default function SimulationPage() {
  const t = useTranslations('simulation')
  const tControls = useTranslations('parameterControls')
  const format = useFormatter()
  const setPlanSectionCollapsed = useSetPlanSectionCollapsed()
  const params = useSimulationParams()
  const results = useSimulationResults()
  const isLoading = useSimulationLoading()
  const runSimulation = useSimulationStore((state) => state.runSimulation)

  const [activeTab, setActiveTab] = useState<TabValue>('overview')
  const tabsRef = useRef<HTMLDivElement>(null)

  const successRate = results?.successRate
  const usesHistory = params.marketModel === 'historical'
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
   *  reader staring at the section they just left (POLISH e08).
   *
   *  The mobile parameter drawer's trigger is `sticky top-0`, so "the top of
   *  the viewport" is not a safe resting place for the tab strip: parking it
   *  there hid the first row of tabs under an opaque bar and the next tap
   *  landed on the bar instead of a tab. `scroll-mt` on the anchor keeps the
   *  strip below it, and the same offset decides whether a scroll is needed. */
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as TabValue)

    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      const node = tabsRef.current
      if (!node) return
      const stickyOffset = stickyChromeHeight()
      const { top } = node.getBoundingClientRect()
      const alreadyComfortable = top >= stickyOffset && top <= window.innerHeight * 0.3
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

  /**
   * The one pointer from the dashboard into the withdrawal planner. It opens
   * the section first: a folded card cannot be scrolled to usefully.
   */
  const openWithdrawalPlanner = useCallback(() => {
    setPlanSectionCollapsed('plan-editor-withdrawal', false)
    handleTabChange('plan')

    // The editor tab mounts on demand, so wait for the section to exist before
    // scrolling. Its header — not its centre — is what has to end up on screen:
    // the planner is taller than the viewport.
    let attempts = 0
    const settle = () => {
      attempts += 1
      if (!document.getElementById('plan-editor-withdrawal')) {
        if (attempts < 30) window.requestAnimationFrame(settle)
        return
      }
      scrollToPlanSection('plan-editor-withdrawal')
    }
    window.requestAnimationFrame(settle)
  }, [handleTabChange, setPlanSectionCollapsed])

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
      <AppHeader
        eyebrow={
          <>
            <span className="neo-chip bg-neo-yellow text-neo-black shadow-neo-sm">
              {usesHistory ? t('header.badges.engineHistorical') : t('header.badges.engine')}
            </span>
            {/* The run count is not repeated here: it sits under the success
                gauge, where the number it qualifies is. */}
            {/* Historical mode does not sample: the badge says how many real
                start years the numbers above are made of. */}
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
          </>
        }
        title={t('header.title')}
        // "live Monte Carlo confidence" is simply untrue in historical mode,
        // where nothing is sampled.
        subtitle={usesHistory ? t('header.subtitleHistorical') : t('header.subtitle')}
        actions={
          <>
            <GenerateReportButton
              results={results}
              params={params}
              disabled={isLoading}
              variant="secondary"
              size="sm"
            />
            <Button variant="secondary" size="sm" asChild>
              <Link href="/setup">{t('header.setupLink')}</Link>
            </Button>
          </>
        }
        // Every child either shrinks (`min-w-0`) or refuses to (`shrink-0`);
        // without that the report button's nowrap label pushed the menu
        // trigger past the header's right edge.
        mobileActions={
          <>
            <AuthMenu compact className="shrink-0" />
            <GenerateReportButton
              results={results}
              params={params}
              disabled={isLoading}
              variant="default"
              size="lg"
              wrapperClassName="min-w-0 flex-1"
              buttonClassName="w-full min-w-0 min-h-[44px] px-3"
            />
            <div className="shrink-0">
              <MobileMenu results={results} params={params} isLoading={isLoading} showSetupLink />
            </div>
          </>
        }
      >
        {successMessage && (
          <span className="neo-chip w-fit bg-neo-white px-3 py-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em] shadow-neo-sm sm:px-5 sm:py-2 sm:text-[0.68rem] sm:tracking-[0.2em]">
            {successMessage}
          </span>
        )}
        {/* One plan bar: switcher, plan actions and the state of the working
            copy live here and nowhere else. */}
        <PlanSwitcher className="max-w-3xl" />
      </AppHeader>

      <main
        id="main-content"
        className="theme-container relative z-10 mx-auto mt-2 max-w-[90rem] px-2 pb-28 sm:px-3 lg:px-4 lg:pb-16"
      >
        <div className="theme-page-grid theme-simulation-grid grid grid-cols-1 gap-8">
          {/* Mobile-only editor drawer; the desktop editor is the Plan tab. */}
          <ParameterSidebar className="theme-parameter-sidebar" />

          <div className="theme-content theme-simulation-content space-y-6">
            {/* First visit only: where the three things this tool does live. */}
            <WelcomeStrip onOpenTab={handleTabChange} />

            <PlanHealthHero
              params={params}
              results={results}
              isLoading={isLoading}
              onEditField={editPlanField}
            />

            <QuickAdjustBar onOpenEditor={() => handleTabChange('plan')} />

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <div ref={tabsRef} className="scroll-mt-[4.75rem] lg:scroll-mt-4">
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
                      <LegacyGoalCard params={params} results={results} />
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
                {/* The withdrawal planner is the last section of a very tall
                    Plan tab, so nothing on the dashboard used to admit it
                    exists. This is the one pointer to it. */}
                <div
                  data-testid="scenarios-withdrawal-jump"
                  className="flex flex-wrap items-center justify-between gap-3 border-3 border-neo-black bg-neo-yellow px-4 py-3 shadow-neo-sm"
                >
                  <p className="text-xs font-bold leading-snug text-neo-black">
                    {t('withdrawalJump.title', {
                      strategy: tControls(
                        `fields.withdrawalStrategy.options.${params.withdrawalStrategy}.label`
                      ),
                    })}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid="scenarios-withdrawal-jump-action"
                    onClick={openWithdrawalPlanner}
                  >
                    {t('withdrawalJump.action')}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>

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
