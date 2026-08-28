'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import '@/components/simulation-compact/simulation-compact.css'
import {
  usePlans,
  useSimulationLoading,
  useSimulationParams,
  useSimulationResults,
  useSimulationStore,
} from '@/lib/stores/simulationStore'
import { useDisplayReal, useSetDisplayReal } from '@/lib/stores/displayStore'
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

type TabValue = 'overview' | 'plan' | 'cashflow' | 'scenarios'

const TABS: TabValue[] = ['overview', 'plan', 'cashflow', 'scenarios']

/**
 * The simulation dashboard, rebuilt to the compact design handoff:
 * screen 1b (merged command bar, inline KPI strip, fan chart above the fold)
 * with screen 1c (plan compare) one click away. The former Plan / Cash flow /
 * Scenario tab bodies stay available under the new chrome.
 */
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
  const setDisplayReal = useSetDisplayReal()

  const [activeTab, setActiveTab] = useState<TabValue>('overview')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [compareMode, setCompareMode] = useState(false)

  // Run initial simulation if no results exist (first visit, or params changed
  // and results were invalidated).
  useEffect(() => {
    if (!results && !isLoading) {
      runSimulation()
    }
  }, [])

  // The mockup's "Run [R]" keyboard shortcut. Ignored while typing.
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

  // Wall-clock duration of the last run, for the meta line ("0,4 s").
  const runStartRef = useRef<number | null>(null)
  const [runSeconds, setRunSeconds] = useState<number | null>(null)
  useEffect(() => {
    if (isLoading) {
      runStartRef.current = performance.now()
    } else if (runStartRef.current != null) {
      setRunSeconds((performance.now() - runStartRef.current) / 1000)
      runStartRef.current = null
    }
  }, [isLoading])

  const kpis = useMemo(
    () => (results ? buildCompactKpis(params, results, { displayReal }) : null),
    [params, results, displayReal]
  )

  const successRate = results?.successRate ?? null
  const formattedSuccessRate =
    successRate == null
      ? null
      : format.number(successRate / 100, {
          style: 'percent',
          minimumFractionDigits: 0,
          maximumFractionDigits: successRate % 1 === 0 ? 0 : 1,
        })

  const metaLine = [
    t('meta.live'),
    t('meta.runs', { count: format.number(effectiveRunCount(params)) }),
    runSeconds != null
      ? t('meta.seconds', {
          seconds: format.number(runSeconds, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
        })
      : null,
    t('meta.plans', { count: format.number(plans.length), max: format.number(MAX_PLANS) }),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="simx app-page app-page-simulation" style={{ minHeight: '100vh', background: 'var(--canvas)' }}>
      {/* Live region for screen readers to announce simulation results */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {successRate != null && t('srComplete', { rate: formattedSuccessRate ?? '' })}
      </div>

      {compareMode ? (
        <CompareView
          onExit={() => setCompareMode(false)}
          onOpenPlanEditor={() => {
            setCompareMode(false)
            setActiveTab('plan')
          }}
        />
      ) : (
        <>
          {/* Sticky chrome: the levers and the verdict stay on screen. */}
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

          {/* tabs + meta */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 14px',
              background: 'var(--surface)',
              borderBottom: '1px solid var(--line)',
              gap: 14,
            }}
          >
            <div className="ds-tabs" style={{ borderBottom: 0, gap: 14 }} role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  className="ds-tab"
                  aria-selected={activeTab === tab}
                  data-testid={`tab-${tab}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {t(`tabs.${tab}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ds-btn ds-btn--outline ds-btn--sm"
              data-testid="enter-compare"
              onClick={() => setCompareMode(true)}
            >
              {t('compareButton')}
            </button>
            <div style={{ flex: 1 }} />
            <span className="ds-meta" style={{ whiteSpace: 'nowrap' }}>
              {metaLine}
            </span>
          </div>

          {/* KPI strip — chart-derived numbers, so it needs results */}
          {results && kpis && (
            <KpiStrip kpis={kpis} endAge={params.endAge} resultsComputedAt={resultsComputedAt} />
          )}

          <main id="main-content">
            {activeTab === 'overview' && (
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {results && kpis ? (
                  <>
                    <FanChartCard
                      results={results}
                      displayReal={displayReal}
                      onDisplayRealChange={setDisplayReal}
                    />
                    <BottomStrip
                      params={params}
                      results={results}
                      kpis={kpis}
                      onOpenFullEditor={() => setActiveTab('plan')}
                    />
                  </>
                ) : (
                  <div
                    className="ds-card"
                    style={{ height: 250, display: 'grid', placeItems: 'center' }}
                  >
                    <span className="ds-meta">{t('computing')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Existing tab bodies keep their functionality under the new chrome. */}
            {activeTab === 'plan' && (
              <div style={{ padding: '10px 14px' }}>
                <PlanEditor />
              </div>
            )}
            {activeTab === 'cashflow' && results && (
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SpendingSection results={results} />
                <CashflowCard params={params} results={results} />
              </div>
            )}
            {activeTab === 'scenarios' && (
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ScenarioList params={params} results={results} isLoading={isLoading} />
                <RecommendationList params={params} results={results} />
              </div>
            )}
          </main>
        </>
      )}
    </div>
  )
}
