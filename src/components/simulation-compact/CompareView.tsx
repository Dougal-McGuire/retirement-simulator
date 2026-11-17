'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { Plan, SimulationParams, SimulationResults } from '@/types'
import { MAX_COMPARISON_PLANS } from '@/types'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { buildFlowDiffRows, flowIndexing, type FlowDiffRow } from '@/lib/simulation/planDiff'
import {
  isCashFlowEnabled,
  pensionStartAge,
  STATUTORY_PENSION_FLOW_ID,
} from '@/lib/simulation/cashFlows'
import { cashFlowDisplayName } from '@/lib/plans/cashFlowName'
import { flowWindowLabel, monthFormatter } from '@/lib/plans/flowWindow'
import { comparisonRunCount, simulationFingerprint } from '@/lib/simulation/context'
import { useDisplayReal } from '@/lib/stores/displayStore'
import { SimulationPrecision } from './SimulationPrecision'
import { planDisplayName } from '@/lib/plans/planName'
import {
  useActivePlanId,
  useDuplicatePlan,
  usePlans,
  useSimulationParams,
} from '@/lib/stores/simulationStore'
import { useComparisonStore, useSetComparisonSelection } from '@/lib/stores/comparisonStore'
import { buildCompactKpis, type CompactKpis } from './metrics'
import { CompareFanChart, type CompareFanSeries } from './CompareFanChart'
import { formatEuroDelta, formatMillionsEuro, formatThousandsEuro } from './format'
import { createCompareRunQueue, type CompareRunJob, type CompareRunQueue } from './compareRunQueue'
import { Skeleton } from '@/components/workspace/Skeleton'

const ALT_COLORS = ['var(--viz-3)', 'var(--viz-5)'] as const

/** Flow rows shown before "Show n more items". */
const MAX_FLOW_ROWS = 8

interface CompareViewProps {
  onExit: () => void
  onOpenPlanEditor: () => void
}

interface PlanRun {
  plan: Plan
  params: SimulationParams
  results: SimulationResults
  kpis: CompactKpis
}

function deltaBadge(text: string, tone: 'ok' | 'warn' | 'danger' | 'neutral') {
  return <span className={`ds-delta ds-delta--${tone}`}>{text}</span>
}

export function CompareView({ onExit, onOpenPlanEditor }: CompareViewProps) {
  const t = useTranslations('simulationCompact.compare')
  const tPlans = useTranslations('plans')
  const tChart = useTranslations('simulationCompact.chart')
  const tSwitch = useTranslations('plans.comparison.flowSwitch')
  const tFlows = useTranslations('setup.cashFlows')
  const tScenarios = useTranslations('planDashboard.scenarios')
  const format = useFormatter()
  const locale = useLocale()
  const plans = usePlans()
  const activePlanId = useActivePlanId()
  const workingParams = useSimulationParams()
  const duplicatePlan = useDuplicatePlan()
  const displayReal = useDisplayReal()
  const [final, setFinal] = useState(false)

  const savedOrDraft = useCallback(
    (plan: Plan): SimulationParams => (plan.id === activePlanId ? workingParams : plan.params),
    [activePlanId, workingParams]
  )

  // The shared comparison selection wins when it still names the active plan
  // and a challenger (Overview's compare entry and the stress levers preselect
  // it); otherwise line up the first other plan.
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const stored = useComparisonStore
      .getState()
      .selectedIds.filter((id) => plans.some((plan) => plan.id === id))
    if (stored.includes(activePlanId) && stored.length >= 2) {
      return [activePlanId, ...stored.filter((id) => id !== activePlanId)].slice(
        0,
        MAX_COMPARISON_PLANS
      )
    }
    const next = plans.find((plan) => plan.id !== activePlanId)
    return next ? [activePlanId, next.id] : [activePlanId]
  })

  // Keep the shared selection in step so leaving and re-entering compare mode
  // does not throw the lineup away.
  const setStoredSelection = useSetComparisonSelection()
  useEffect(() => {
    setStoredSelection(selectedIds)
  }, [selectedIds, setStoredSelection])

  useEffect(() => {
    setSelectedIds((current) => {
      const valid = current.filter((id) => plans.some((plan) => plan.id === id))
      const withBase = [activePlanId, ...valid.filter((id) => id !== activePlanId)]
      return withBase.slice(0, MAX_COMPARISON_PLANS)
    })
  }, [plans, activePlanId])

  const selectedPlans = useMemo(
    () =>
      selectedIds
        .map((id) => plans.find((plan) => plan.id === id))
        .filter((plan): plan is Plan => plan !== undefined),
    [selectedIds, plans]
  )

  const selectedParams = useMemo(
    () => selectedPlans.map(savedOrDraft),
    [selectedPlans, savedOrDraft]
  )
  const runCount = comparisonRunCount(selectedParams, final)
  const hasMonteCarlo = selectedParams.some((params) => params.marketModel !== 'historical')
  const hasHistorical = selectedParams.some((params) => params.marketModel === 'historical')
  const paramsFor = useCallback(
    (plan: Plan) => {
      const params = savedOrDraft(plan)
      return params.marketModel === 'historical' ? params : { ...params, simulationRuns: runCount }
    },
    [runCount, savedOrDraft]
  )

  const [runsById, setRunsById] = useState<
    Record<string, { fingerprint: string; results: SimulationResults }>
  >({})
  const [running, setRunning] = useState(false)
  const [failedById, setFailedById] = useState<Record<string, string>>({})

  // One queue for the view's life: each plan runs once per fingerprint, however
  // often the effect below asks (it asks again whenever a result lands).
  const queueRef = useRef<CompareRunQueue<SimulationParams> | null>(null)
  useEffect(() => {
    const queue = createCompareRunQueue<SimulationParams, SimulationResults>({
      run: async (params) => {
        const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
        return runSimulationInClient(params)
      },
      onResult: (id, fingerprint, results) =>
        setRunsById((current) => ({ ...current, [id]: { fingerprint, results } })),
      onError: (id, fingerprint) => setFailedById((current) => ({ ...current, [id]: fingerprint })),
      onRunningChange: setRunning,
    })
    queueRef.current = queue
    return () => {
      queue.dispose()
      queueRef.current = null
    }
  }, [])

  const staleJobs = useMemo<CompareRunJob<SimulationParams>[]>(
    () =>
      selectedPlans.flatMap((plan) => {
        const params = paramsFor(plan)
        const fingerprint = simulationFingerprint(params)
        return runsById[plan.id]?.fingerprint === fingerprint || failedById[plan.id] === fingerprint
          ? []
          : [{ id: plan.id, fingerprint, params }]
      }),
    [selectedPlans, runsById, paramsFor, failedById]
  )

  useEffect(() => {
    if (staleJobs.length === 0) return
    const timer = setTimeout(() => queueRef.current?.request(staleJobs), 200)
    return () => clearTimeout(timer)
  }, [staleJobs])

  const ready: PlanRun[] = useMemo(
    () =>
      selectedPlans.flatMap((plan) => {
        const entry = runsById[plan.id]
        if (!entry || entry.fingerprint !== simulationFingerprint(paramsFor(plan))) return []
        const params = paramsFor(plan)
        return [
          {
            plan,
            params,
            results: entry.results,
            kpis: buildCompactKpis(params, entry.results, { displayReal }),
          },
        ]
      }),
    [selectedPlans, runsById, paramsFor, displayReal]
  )

  const failedPlans = selectedPlans.filter(
    (plan) => failedById[plan.id] === simulationFingerprint(paramsFor(plan))
  )
  const hasError = failedPlans.length > 0
  const baseFailed = failedPlans.some((plan) => plan.id === activePlanId)
  const base = ready.find((run) => run.plan.id === activePlanId)
  const alts = ready.filter((run) => run !== base)
  const firstAlt = alts[0]

  const toggle = (id: string) => {
    if (id === activePlanId) return
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length >= MAX_COMPARISON_PLANS
          ? current
          : [...current, id]
    )
  }

  const addPlan = () => {
    const unselected = plans.find((plan) => !selectedIds.includes(plan.id))
    if (unselected) {
      toggle(unselected.id)
      return
    }
    const copyId = duplicatePlan(activePlanId)
    if (copyId) {
      setSelectedIds((current) =>
        current.length >= MAX_COMPARISON_PLANS ? current : [...current, copyId]
      )
    }
  }

  const percentValue = (rate: number) =>
    format.number(rate / 100, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: final ? 1 : 0,
    })
  const lastsValue = (run: PlanRun) =>
    run.kpis.lastsToMedian == null
      ? `${format.number(run.params.endAge)}+`
      : format.number(run.kpis.lastsToMedian)
  const lastsAge = (run: PlanRun) => run.kpis.lastsToMedian ?? run.params.endAge
  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 1 })
  const euro = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })

  const strategyLabel = (params: SimulationParams) =>
    t(`strategy.${params.withdrawalStrategy}`, {
      rate: format.number(params.dsWithdrawalRate, { style: 'percent', maximumFractionDigits: 1 }),
    })

  const diffRows = useMemo(() => {
    if (ready.length === 0) return []
    return [
      {
        key: 'retirementAge',
        label: t('rows.retirementAge'),
        values: ready.map((run) => format.number(run.params.retirementAge)),
      },
      {
        key: 'bridgeYears',
        label: t('rows.bridgeYears'),
        values: ready.map((run) => format.number(run.kpis.bridgeYears)),
      },
      {
        key: 'savingsYears',
        label: t('rows.savingsYears'),
        values: ready.map((run) =>
          format.number(Math.max(0, run.params.retirementAge - run.params.currentAge))
        ),
      },
      {
        key: 'annualSavings',
        label: t('rows.annualSavings'),
        values: ready.map((run) => euro(run.params.annualSavings)),
      },
      {
        key: 'monthlySpending',
        label: t('rows.monthlySpending'),
        values: ready.map((run) =>
          euro(Math.round(calculateCombinedExpenses(run.params.customExpenses).combinedMonthly))
        ),
      },
      {
        key: 'expectedReturn',
        label: t('rows.expectedReturn'),
        values: ready.map((run) => percent(run.params.averageROI)),
      },
      {
        key: 'withdrawalRule',
        label: t('rows.withdrawalRule'),
        values: ready.map((run) => strategyLabel(run.params)),
      },
      {
        key: 'pension',
        label: t('rows.pension'),
        // Each plan's own start: duplicating a plan and moving its statutory
        // pension from 67 to 63 changes the result, so it has to show here.
        values: ready.map((run) => {
          const amount = euro(run.params.monthlyPension)
          const statutory = (run.params.cashFlows ?? []).find(
            (flow) => flow.id === STATUTORY_PENSION_FLOW_ID
          )
          if (!statutory || !isCashFlowEnabled(statutory) || run.params.monthlyPension <= 0) {
            return t('perMonth', { amount })
          }
          const age = pensionStartAge(statutory, run.params.legalRetirementAge)
          return t('pensionFrom', { amount, age: format.number(age) })
        }),
      },
    ]
  }, [ready, t, format])

  // Flows that set the plans apart: a switch flip ("Erbschaft: berücksichtigt
  // → ausgeschaltet"), a flow only some plans have, or one whose amount or
  // window differs — matched by id, then by kind and name.
  const flowRows = useMemo(() => buildFlowDiffRows(ready.map((run) => run.params)), [ready])
  const [showAllFlows, setShowAllFlows] = useState(false)
  const visibleFlowRows = showAllFlows ? flowRows : flowRows.slice(0, MAX_FLOW_ROWS)
  const hiddenFlowRows = flowRows.length - MAX_FLOW_ROWS

  const formatMonth = monthFormatter(format)

  const flowCell = (row: FlowDiffRow, index: number) => {
    const flow = row.flows[index]
    if (!flow) {
      return (
        <>
          <span aria-hidden="true">—</span>
          <span className="sr-only">{tSwitch('absent')}</span>
        </>
      )
    }
    // Same amount and window, only the switch differs: say just that.
    if (row.change === 'switch' && !row.termsDiffer && !row.indexingDiffers) {
      return tSwitch(row.values[index])
    }
    const off = !isCashFlowEnabled(flow)
    const indexing = flowIndexing(flow)
    return (
      <span className="compare-flow-cell">
        <span className="compare-flow-amount">
          {t(`flow.${flow.frequency}`, { amount: euro(flow.amount) })}
        </span>
        <span className="compare-flow-period">
          {flowWindowLabel(flow, ready[index].params, tFlows, { formatMonth })}
          {off && ` · ${tSwitch('off')}`}
        </span>
        {row.indexingDiffers && (
          <span className="compare-flow-period" data-testid="compare-flow-indexing">
            {t(indexing.inflationLinked ? 'flow.linked' : 'flow.fixed')}
            {indexing.growthRate !== 0 &&
              ` · ${t('flow.growth', {
                rate: format.number(indexing.growthRate, {
                  style: 'percent',
                  maximumFractionDigits: 2,
                  signDisplay: 'always',
                }),
              })}`}
          </span>
        )}
      </span>
    )
  }

  const chartSeries = useMemo<CompareFanSeries[]>(() => {
    if (!base) return []
    return ready.map((run) => {
      const band = (displayReal && run.results.assetPercentilesReal) || run.results.assetPercentiles
      const altIndex = alts.indexOf(run)
      return {
        id: run.plan.id,
        name: planDisplayName(run.plan, tPlans),
        ages: run.results.ages,
        p20: band.p20,
        p50: band.p50,
        p80: band.p80,
        retirementAge: run.params.retirementAge,
        color:
          run === base ? 'var(--viz-1)' : ALT_COLORS[Math.max(0, altIndex) % ALT_COLORS.length],
        base: run === base,
      }
    })
  }, [ready, base, alts, tPlans, displayReal])

  return (
    <div data-testid="compare-view">
      {/* Layout (wrapping header, KPI grid, chart/table columns that stack
          on narrow screens) lives in workspace.css under .compare-*. */}
      <header className="compare-header">
        <h2 id="compare-title" tabIndex={-1} className="compare-title">
          {t('title')}
        </h2>
        {plans.map((plan) => {
          const selected = selectedIds.includes(plan.id)
          const isBase = plan.id === activePlanId
          const altIndex = selectedIds.filter((id) => id !== activePlanId).indexOf(plan.id)
          const altColor =
            selected && !isBase && altIndex !== -1 ? ALT_COLORS[altIndex % ALT_COLORS.length] : null
          return (
            <button
              key={plan.id}
              type="button"
              className="ds-chip compare-chip"
              aria-pressed={selected}
              onClick={() => toggle(plan.id)}
              style={
                altColor
                  ? { background: altColor, borderColor: altColor, color: 'var(--on-hue)' }
                  : undefined
              }
            >
              <span
                className="compare-chip-dot"
                style={{
                  background: selected ? 'currentColor' : 'var(--gray-400)',
                  ...(isBase && selected
                    ? { background: 'var(--viz-1)', outline: '1px solid currentColor' }
                    : {}),
                }}
              />
              {planDisplayName(plan, tPlans)}
            </button>
          )
        })}
        <button
          type="button"
          className="compare-add"
          onClick={addPlan}
          disabled={selectedIds.length >= MAX_COMPARISON_PLANS}
        >
          {t('addPlan', { max: MAX_COMPARISON_PLANS })}
        </button>
        <div className="compare-header-end">
          <span className="compare-meta" role="status">
            {running || staleJobs.length > 0
              ? t('running')
              : hasError
                ? t('failed')
                : t('meta', { count: ready.length })}
          </span>
          <button
            type="button"
            className="workspace-button compare-exit"
            data-testid="compare-exit"
            onClick={onExit}
          >
            {t('exit')}
          </button>
        </div>
      </header>

      <div className="compare-precision">
        <div className="compare-precision-controls">
          {hasMonteCarlo && (
            <button
              type="button"
              className="workspace-button"
              data-testid="compare-final"
              aria-pressed={final}
              onClick={() => setFinal((current) => !current)}
            >
              {final
                ? t('backToPreview')
                : t('runFinal', {
                    runs: format.number(comparisonRunCount(selectedParams, true)),
                  })}
            </button>
          )}
          <span>
            {hasHistorical && hasMonteCarlo
              ? t('mixedModels')
              : hasMonteCarlo
                ? t(final ? 'finalPaths' : 'previewPaths', { runs: format.number(runCount) })
                : t('historicalPaths')}
          </span>
        </div>
        {hasError && (
          <button type="button" className="ws-link-button" onClick={() => setFailedById({})}>
            {t('retry')}
          </button>
        )}
        {ready.map((run) => (
          <p key={run.plan.id}>
            <strong>
              {planDisplayName(run.plan, tPlans)} · {percentValue(run.kpis.successRate)}
            </strong>
            {' · '}
            <SimulationPrecision results={run.results} />
          </p>
        ))}
      </div>

      {base && firstAlt && (
        <div className="compare-kpis">
          {(
            [
              {
                key: 'success',
                label: t('kpi.success'),
                baseValue: percentValue(base.kpis.successRate),
                altValue: percentValue(firstAlt.kpis.successRate),
                delta: Number(
                  (firstAlt.kpis.successRate - base.kpis.successRate).toFixed(final ? 1 : 0)
                ),
                // The catalog's unit ("Pkt." / "pts"), as in the result bar.
                text: (d: number) =>
                  tScenarios('deltaPoints', {
                    value: `${d < 0 ? '−' : '+'}${format.number(Math.abs(d), {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: final ? 1 : 0,
                    })}`,
                  }),
                toneNegative: 'danger' as const,
              },
              {
                key: 'lasts',
                label: t('kpi.lastsTo'),
                baseValue: lastsValue(base),
                altValue: lastsValue(firstAlt),
                delta: lastsAge(firstAlt) - lastsAge(base),
                text: (d: number) =>
                  `${d < 0 ? '−' : '+'}${format.number(Math.abs(d))} ${t('kpi.years')}`,
                toneNegative: 'danger' as const,
              },
              {
                key: 'draw',
                label: [t('kpi.firstYearDraw'), tChart(displayReal ? 'real' : 'nominal')].join(
                  ' · '
                ),
                baseValue: formatThousandsEuro(base.kpis.firstYearWithdrawal, locale),
                altValue: formatThousandsEuro(firstAlt.kpis.firstYearWithdrawal, locale),
                delta: firstAlt.kpis.firstYearWithdrawal - base.kpis.firstYearWithdrawal,
                text: (d: number) => formatEuroDelta(d, locale),
                toneNegative: 'warn' as const,
              },
              {
                key: 'end',
                label: [t('kpi.medianEnd'), tChart(displayReal ? 'real' : 'nominal')].join(' · '),
                baseValue: formatMillionsEuro(base.kpis.medianEndWealth, locale),
                altValue: formatMillionsEuro(firstAlt.kpis.medianEndWealth, locale),
                delta: firstAlt.kpis.medianEndWealth - base.kpis.medianEndWealth,
                text: (d: number) => formatEuroDelta(d, locale),
                toneNegative: 'danger' as const,
              },
            ] as const
          ).map((cell) => (
            <div key={cell.key} className="compare-kpi">
              <p className="compare-kpi-label">{cell.label}</p>
              <div className="compare-kpi-values">
                <span className="compare-kpi-value">{cell.baseValue}</span>
                <span className="compare-kpi-arrow" aria-hidden="true">
                  →
                </span>
                <span className="compare-kpi-value" style={{ color: ALT_COLORS[0] }}>
                  {cell.altValue}
                </span>
                {deltaBadge(
                  cell.delta === 0 ? '±0' : cell.text(cell.delta),
                  cell.delta === 0 ? 'neutral' : cell.delta < 0 ? cell.toneNegative : 'ok'
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="compare-body">
        <div className="compare-chart">
          {chartSeries.length > 0 ? (
            <CompareFanChart series={chartSeries} />
          ) : baseFailed ? (
            <p className="ws-callout">{t('baseChartFailed')}</p>
          ) : (
            <div className="ds-card ws-fan" style={{ padding: 16 }}>
              <Skeleton height={40} width="16rem" />
              <Skeleton variant="chart" height={266} style={{ marginTop: 12 }} />
            </div>
          )}
        </div>

        <div className="ds-table-wrap compare-table">
          <table className="ds-table">
            <thead>
              <tr>
                <th>{t('rows.parameter')}</th>
                {ready.map((run, index) => (
                  <th
                    key={run.plan.id}
                    className="ds-num"
                    style={
                      index > 0 ? { color: ALT_COLORS[(index - 1) % ALT_COLORS.length] } : undefined
                    }
                  >
                    {planDisplayName(run.plan, tPlans)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diffRows.map((row) => {
                const changed = row.values.some((value) => value !== row.values[0])
                return (
                  <tr key={row.key} className={changed ? 'ds-row--behind' : undefined}>
                    <td>{row.label}</td>
                    {row.values.map((value, index) => (
                      <td
                        key={index}
                        className="ds-num"
                        style={changed && index > 0 ? { fontWeight: 600 } : undefined}
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                )
              })}
              {visibleFlowRows.map((row) => (
                <tr
                  key={row.key}
                  className="ds-row--behind"
                  data-testid="compare-flow-row"
                  data-flow-change={row.change}
                >
                  <td>{cashFlowDisplayName(row, (key) => tFlows(`defaults.${key}`))}</td>
                  {row.flows.map((_, index) => (
                    <td
                      key={index}
                      className="ds-num"
                      style={index > 0 ? { fontWeight: 600 } : undefined}
                    >
                      {flowCell(row, index)}
                    </td>
                  ))}
                </tr>
              ))}
              {hiddenFlowRows > 0 && (
                <tr>
                  <td colSpan={ready.length + 1}>
                    <button
                      type="button"
                      className="ws-link-button"
                      data-testid="compare-flow-more"
                      aria-expanded={showAllFlows}
                      onClick={() => setShowAllFlows((open) => !open)}
                    >
                      {showAllFlows ? t('flow.less') : t('flow.more', { count: hiddenFlowRows })}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="compare-table-foot">
            <span>{t('changedRows')}</span>
            <button type="button" className="ws-link-button" onClick={onOpenPlanEditor}>
              {t('openEditor')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
