'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import * as Tabs from '@radix-ui/react-tabs'
import { ArrowLeftRight, ChartNoAxesCombined, SlidersHorizontal, WalletCards } from 'lucide-react'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { areSimulationParamsEqual } from '@/lib/simulation/planInsights'
import {
  useSimulationLoading,
  useSimulationParams,
  useSimulationResults,
  useSimulationStore,
} from '@/lib/stores/simulationStore'
import { useDisplayReal, useSetPlanSection } from '@/lib/stores/displayStore'
import type { PlanSectionGroup } from '@/components/plans/planSections'
import { CompactCommandBar } from '@/components/simulation-compact/CompactCommandBar'
import { AdvancedParamsPanel } from '@/components/simulation-compact/AdvancedParamsPanel'
import { BottomStrip } from '@/components/simulation-compact/BottomStrip'
import { CompareView } from '@/components/simulation-compact/CompareView'
import { buildCompactKpis } from '@/components/simulation-compact/metrics'
import { PlanEditor } from '@/components/plans/PlanEditor'
import { SpendingSection } from '@/components/charts/SpendingSection'
import { CashflowCard } from '@/components/charts/CashflowCard'
import { ScenarioList } from '@/components/charts/ScenarioList'
import { RecommendationList } from '@/components/charts/RecommendationList'
import { WorkspaceHeader, EuroDisplay } from '@/components/workspace/WorkspaceHeader'
import { Overview } from '@/components/workspace/Overview'
import './workspace.css'

type View = 'overview' | 'plan' | 'cashflow' | 'scenarios'
const destinations = [
  { value: 'overview', icon: ChartNoAxesCombined },
  { value: 'plan', icon: SlidersHorizontal },
  { value: 'cashflow', icon: WalletCards },
  { value: 'scenarios', icon: ArrowLeftRight },
] as const

export default function SimulationPage() {
  const t = useTranslations('workspace')
  const tc = useTranslations('simulationCompact')
  const params = useSimulationParams()
  const results = useSimulationResults()
  const loading = useSimulationLoading()
  const run = useSimulationStore((state) => state.runSimulation)
  const error = useSimulationStore((state) => state.error)
  const displayReal = useDisplayReal()
  const setPlanSection = useSetPlanSection()
  const sidebarVertical = useMediaQuery('(min-width: 761px)')
  const editorVertical = useMediaQuery('(min-width: 1101px)')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [view, setView] = useState<View>('overview')
  const [compare, setCompare] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const stale = results ? !areSimulationParamsEqual(params, results.params) : false
  const kpis = useMemo(
    () => (results ? buildCompactKpis(results.params, results, { displayReal }) : null),
    [results, displayReal]
  )
  const navigate = (next: View) => {
    setView(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const edit = (section: PlanSectionGroup) => {
    setPlanSection(section)
    navigate('plan')
    headingRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    const initialize = () => {
      const state = useSimulationStore.getState()
      if ((!state.results || !state.results.cashFlowMeans) && !state.isLoading)
        state.runSimulation()
    }
    if (useSimulationStore.persist.hasHydrated()) initialize()
    else return useSimulationStore.persist.onFinishHydration(initialize)
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!['r', 'R'].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, select, textarea, [role="dialog"]') || target?.isContentEditable)
        return
      run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [run])

  return (
    <Tabs.Root
      value={view}
      onValueChange={(value) => navigate(value as View)}
      orientation={sidebarVertical ? 'vertical' : 'horizontal'}
      activationMode="manual"
      className="retirement-workspace"
    >
      <aside className="workspace-sidebar" id="navigation">
        <div className="workspace-brand">{t('brand')}</div>
        <Tabs.List className="workspace-navigation" aria-label={t('navigation')}>
          {destinations.map(({ value, icon: Icon }) => (
            <Tabs.Trigger key={value} value={value} data-testid={`tab-${value}`}>
              <Icon size={21} aria-hidden="true" />
              <span>{t(`views.${value}.label`)}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </aside>
      <div className="workspace-body">
        <WorkspaceHeader results={stale ? null : results} loading={loading} onRun={() => run()} />
        <main id="main-content" className="workspace-main" aria-busy={loading}>
          <div className="workspace-page-heading">
            <div>
              <h1 ref={headingRef} tabIndex={-1}>
                {t(`views.${view}.title`)}
              </h1>
              <p>{t(`views.${view}.description`)}</p>
            </div>
            {view !== 'plan' && <EuroDisplay />}
          </div>
          <div className="workspace-run-status" role="status" aria-live="polite">
            {loading ? t('computing') : stale ? tc('stale') : results ? t('current') : t('empty')}
          </div>
          {error && (
            <div role="alert" className="workspace-error">
              {tc('error')}{' '}
              <button className="workspace-button" onClick={() => run()}>
                {tc('retry')}
              </button>
            </div>
          )}
          <Tabs.Content value={view} className="workspace-content">
            {view === 'overview' && (
              <>
                <details className="workspace-experiment">
                  <summary>
                    <SlidersHorizontal size={20} aria-hidden="true" />
                    <div>
                      <strong>{t('experiment')}</strong>
                      <span>{t('experimentHint')}</span>
                    </div>
                  </summary>
                  <CompactCommandBar
                    quickOnly
                    results={results}
                    successRate={results?.successRate ?? null}
                    isLoading={loading}
                    advancedOpen={advanced}
                    onToggleAdvanced={() => setAdvanced((v) => !v)}
                    onRun={() => run()}
                  />
                  {advanced && <AdvancedParamsPanel onOpenFullEditor={() => edit('market')} />}
                </details>
                {results && kpis ? (
                  <Overview
                    results={results}
                    kpis={kpis}
                    displayReal={displayReal}
                    onEdit={edit}
                    onCashflow={() => navigate('cashflow')}
                  />
                ) : (
                  <div className="workspace-panel workspace-empty">{t('computing')}</div>
                )}
              </>
            )}
            {view === 'plan' && (
              <PlanEditor
                className="workspace-editor"
                navigationOrientation={editorVertical ? 'vertical' : 'horizontal'}
              />
            )}
            {view === 'cashflow' &&
              (results ? (
                <div className="workspace-stack">
                  <CashflowCard params={results.params} results={results} />
                  <details className="workspace-experiment">
                    <summary>{t('spendingAnalysis')}</summary>
                    <SpendingSection results={results} />
                  </details>
                </div>
              ) : (
                <div className="workspace-panel workspace-empty">{t('computing')}</div>
              ))}
            {view === 'scenarios' && (
              <div className="workspace-stack">
                <div
                  className="workspace-variant-switch"
                  role="group"
                  aria-label={t('variantMode')}
                >
                  <button
                    className="workspace-button"
                    aria-pressed={!compare}
                    onClick={() => setCompare(false)}
                  >
                    {t('exploreVariants')}
                  </button>
                  <button
                    className="workspace-button"
                    data-testid="enter-compare"
                    aria-pressed={compare}
                    onClick={() => setCompare(true)}
                  >
                    {t('comparePlans')}
                  </button>
                </div>
                {compare ? (
                  <CompareView
                    onExit={() => setCompare(false)}
                    onOpenPlanEditor={() => edit('personal')}
                  />
                ) : (
                  <>
                    {results && kpis && (
                      <section className="workspace-panel workspace-recommendations">
                        <h2>{t('applyChanges')}</h2>
                        <BottomStrip
                          recommendationsOnly
                          params={results.params}
                          results={results}
                          kpis={kpis}
                          onOpenFullEditor={() => edit('personal')}
                        />
                      </section>
                    )}
                    <ScenarioList params={params} results={results} isLoading={loading} />
                    <RecommendationList params={params} results={results} />
                  </>
                )}
              </div>
            )}
          </Tabs.Content>
          <footer className="workspace-footer">{t('footer')}</footer>
        </main>
      </div>
    </Tabs.Root>
  )
}
