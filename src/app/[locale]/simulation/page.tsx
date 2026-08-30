'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import {
  usePlans,
  useSimulationLoading,
  useSimulationParams,
  useSimulationResults,
  useSimulationStore,
} from '@/lib/stores/simulationStore'
import { useDisplayReal } from '@/lib/stores/displayStore'
import { effectiveRunCount } from '@/lib/simulation/context'
import { MAX_PLANS } from '@/types'
import { CompactCommandBar } from '@/components/simulation-compact/CompactCommandBar'
import { AdvancedParamsPanel } from '@/components/simulation-compact/AdvancedParamsPanel'
import { KpiStrip } from '@/components/simulation-compact/KpiStrip'
import { FanChartCard } from '@/components/simulation-compact/FanChartCard'
import { BottomStrip } from '@/components/simulation-compact/BottomStrip'
import { CompareView } from '@/components/simulation-compact/CompareView'
import { buildCompactKpis } from '@/components/simulation-compact/metrics'
import { PlanEditor } from '@/components/plans/PlanEditor'
import { SpendingSection } from '@/components/charts/SpendingSection'
import { CashflowCard } from '@/components/charts/CashflowCard'
import { ScenarioList } from '@/components/charts/ScenarioList'
import { RecommendationList } from '@/components/charts/RecommendationList'

type TabValue = 'overview' | 'plan' | 'cashflow' | 'scenarios' | 'compare'
const TABS: TabValue[] = ['overview', 'plan', 'cashflow', 'scenarios', 'compare']

export default function SimulationPage() {
  const t = useTranslations('simulationCompact')
  const format = useFormatter()
  const params = useSimulationParams()
  const results = useSimulationResults()
  const isLoading = useSimulationLoading()
  const runSimulation = useSimulationStore((state) => state.runSimulation)
  const resultsComputedAt = useSimulationStore((state) => state.resultsComputedAt)
  const plans = usePlans()
  const displayReal = useDisplayReal()
  const [activeTab, setActiveTab] = useState<TabValue>('overview')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    const runIfEmpty = () => {
      const { results: current, isLoading: loading, runSimulation: run } = useSimulationStore.getState()
      if (!current && !loading) run()
    }
    if (useSimulationStore.persist.hasHydrated()) {
      runIfEmpty()
      return
    }
    return useSimulationStore.persist.onFinishHydration(runIfEmpty)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'r' && event.key !== 'R') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if (target?.isContentEditable) return
      runSimulation()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [runSimulation])

  const runStartRef = useRef<number | null>(null)
  const [runSeconds, setRunSeconds] = useState<number | null>(null)
  useEffect(() => {
    if (isLoading) runStartRef.current = performance.now()
    else if (runStartRef.current != null) {
      setRunSeconds((performance.now() - runStartRef.current) / 1000)
      runStartRef.current = null
    }
  }, [isLoading])

  const kpis = useMemo(
    () => (results ? buildCompactKpis(params, results, { displayReal }) : null),
    [params, results, displayReal]
  )
  const successRate = results?.successRate ?? null
  const formattedSuccessRate = successRate == null ? null : format.number(successRate / 100, {
    style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: successRate % 1 === 0 ? 0 : 1,
  })
  const metaLine = [
    t('meta.live'),
    t('meta.runs', { count: format.number(effectiveRunCount(params)) }),
    runSeconds != null ? t('meta.seconds', { seconds: format.number(runSeconds, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }) : null,
    t('meta.plans', { count: format.number(plans.length), max: format.number(MAX_PLANS) }),
  ].filter(Boolean).join(' · ')
  const navigationLabel = [
    t('tabs.overview'),
    t('tabs.plan'),
    t('tabs.cashflow'),
    t('tabs.scenarios'),
    t('compareButton'),
  ].join(', ')

  return (
    <div className="app-page app-page-simulation" style={{ minHeight: '100vh', background: 'var(--canvas)' }}>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {successRate != null && t('srComplete', { rate: formattedSuccessRate ?? '' })}
      </div>

      <div style={{ position: 'sticky', top: 0, zIndex: 20 }}>
        <CompactCommandBar
          successRate={successRate}
          isLoading={isLoading}
          advancedOpen={advancedOpen}
          onToggleAdvanced={() => setAdvancedOpen((open) => !open)}
          onRun={() => runSimulation()}
        />
        {advancedOpen && <AdvancedParamsPanel onOpenFullEditor={() => setActiveTab('plan')} />}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', minHeight: 48, padding: '0 14px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', gap: 14, overflowX: 'auto' }}>
        <div className="ds-tabs" style={{ borderBottom: 0, gap: 6, minHeight: 48 }} role="tablist" aria-label={navigationLabel}>
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              className="ds-tab"
              aria-selected={activeTab === tab}
              data-testid={tab === 'compare' ? 'enter-compare' : `tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              style={{ minHeight: 44, padding: '0 14px', fontSize: 13, fontWeight: 650, whiteSpace: 'nowrap' }}
            >
              {tab === 'compare' ? t('compareButton') : t(`tabs.${tab}`)}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span className="ds-meta" style={{ whiteSpace: 'nowrap' }}>{metaLine}</span>
      </div>

      {activeTab !== 'compare' && results && kpis && (
        <KpiStrip kpis={kpis} endAge={params.endAge} resultsComputedAt={resultsComputedAt} />
      )}

      <main id="main-content">
        {activeTab === 'overview' && (
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results && kpis ? (
              <>
                <FanChartCard results={results} displayReal={displayReal} />
                <BottomStrip params={params} results={results} kpis={kpis} onOpenFullEditor={() => setActiveTab('plan')} />
              </>
            ) : (
              <div className="ds-card" style={{ height: 250, display: 'grid', placeItems: 'center' }}><span className="ds-meta">{t('computing')}</span></div>
            )}
          </div>
        )}
        {activeTab === 'plan' && <div style={{ padding: '12px 14px' }}><PlanEditor /></div>}
        {activeTab === 'cashflow' && results && (
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SpendingSection results={results} />
            <CashflowCard params={params} results={results} />
          </div>
        )}
        {activeTab === 'scenarios' && (
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ScenarioList params={params} results={results} isLoading={isLoading} />
            <RecommendationList params={params} results={results} />
          </div>
        )}
        {activeTab === 'compare' && (
          <CompareView onExit={() => setActiveTab('overview')} onOpenPlanEditor={() => setActiveTab('plan')} />
        )}
      </main>
    </div>
  )
}
