'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { Check, GitCompareArrows } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { MAX_COMPARISON_PLANS, type Plan } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  axisTick,
  chartInk,
  ChartLegend,
  ChartTooltipCard,
  LegendSwatch,
  type TooltipRow,
} from '@/components/charts/chartTheme'
import { useChartFormatters } from '@/components/charts/useChartData'
import { AssumptionsDiff } from '@/components/plans/AssumptionsDiff'
import { deriveDepletionAges } from '@/lib/insights/depletion'
import { planDisplayName } from '@/lib/plans/planName'
import { comparisonFingerprint } from '@/lib/simulation/planDiff'
import { effectiveRunCount } from '@/lib/simulation/context'
import { getPlanHealth } from '@/lib/simulation/planInsights'
import {
  useActivePlanId,
  usePlanIsDirty,
  usePlans,
  useSimulationStore,
} from '@/lib/stores/simulationStore'
import {
  MIN_COMPARISON_PLANS,
  useComparisonStore,
  type ComparisonSnapshot,
} from '@/lib/stores/comparisonStore'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

/**
 * Budget for an on-demand comparison. Plans below this run count (the default
 * 500 is) are simulated at their own count, so the comparison reports exactly
 * the same success rate as the dashboard; only unusually heavy plans are
 * clamped, and the footnote says so.
 */
const COMPARISON_RUNS = 1200

/** One hue per compared plan, all drawn from the active theme's tokens. */
const planHues = [
  { solid: 'var(--neo-blue)', rgb: '--neo-blue-rgb' },
  { solid: 'var(--neo-purple)', rgb: '--neo-purple-rgb' },
  { solid: 'var(--neo-green)', rgb: '--neo-green-rgb' },
] as const

const healthClasses = {
  strong: 'border-success-600 bg-success-50 text-success-700',
  watch: 'border-warning-600 bg-warning-50 text-warning-700',
  strained: 'border-neo-red bg-red-50 text-neo-red',
} as const

const hueFor = (index: number) => planHues[index % planHues.length]

export function PlanComparison() {
  const t = useTranslations('plans')
  const tc = useTranslations('plans.comparison')
  const format = useFormatter()
  const isMobile = useIsMobile()
  const plans = usePlans()
  const activePlanId = useActivePlanId()
  // Unsaved edits to the active plan make its comparison row describe a plan
  // the user is no longer looking at — exactly as stale as a changed snapshot.
  const isDirty = usePlanIsDirty()
  const workingParams = useSimulationStore((state) => state.params)
  const { formatCurrency, formatCurrencyShort } = useChartFormatters()

  // Selection and the last run's numbers are persisted: switching tabs or
  // reloading should not silently throw a comparison away.
  const selectedIds = useComparisonStore((state) => state.selectedIds)
  const snapshots = useComparisonStore((state) => state.snapshots)
  const setSelectedIds = useComparisonStore((state) => state.setSelectedIds)
  const toggleSelected = useComparisonStore((state) => state.toggleSelected)
  const setSnapshots = useComparisonStore((state) => state.setSnapshots)

  const [status, setStatus] = useState<'idle' | 'running' | 'ready' | 'error'>('idle')
  const runIdRef = useRef(0)

  const chartFrameRef = useRef<HTMLDivElement>(null)
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const frame = chartFrameRef.current
    if (!frame) return

    const measure = () =>
      setChartSize({
        width: Math.max(320, Math.floor(frame.clientWidth)),
        height: Math.max(220, Math.floor(frame.clientHeight)),
      })

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [snapshots.length])

  // Once the user has touched a chip the selection is theirs: dropping below two
  // plans is a legitimate state (the button then explains itself) and must not
  // be silently topped back up.
  const selectionTouchedRef = useRef(false)

  // Both stores rehydrate from localStorage after the first render. Seeding or
  // pruning the selection before that would throw away a persisted comparison.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const persisted = [useComparisonStore.persist, useSimulationStore.persist]
    const check = () => {
      if (persisted.every((store) => store.hasHydrated())) setHydrated(true)
    }
    check()
    const unsubscribe = persisted.map((store) => store.onFinishHydration(check))
    return () => unsubscribe.forEach((off) => off())
  }, [])

  // Default selection: the active plan plus the next one, kept valid as plans
  // are created or deleted. Never triggers a run on its own.
  useEffect(() => {
    if (!hydrated) return

    // Read through the stores: a rehydration that lands between renders would
    // otherwise be invisible to this effect's closure.
    const livePlans = useSimulationStore.getState().plans
    const liveActiveId = useSimulationStore.getState().activePlanId
    const liveSelected = useComparisonStore.getState().selectedIds

    const stillValid = liveSelected.filter((id) => livePlans.some((plan) => plan.id === id))
    if (stillValid.length !== liveSelected.length) {
      setSelectedIds(stillValid)
      return
    }
    if (selectionTouchedRef.current || stillValid.length >= MIN_COMPARISON_PLANS) return

    const seeded = [...stillValid, liveActiveId, ...livePlans.map((plan) => plan.id)]
      .filter((id, index, list) => id && list.indexOf(id) === index)
      .filter((id) => livePlans.some((plan) => plan.id === id))
      .slice(0, MIN_COMPARISON_PLANS)

    if (seeded.length !== liveSelected.length || seeded.some((id, i) => id !== liveSelected[i])) {
      setSelectedIds(seeded)
    }
  }, [hydrated, plans, activePlanId, selectedIds, setSelectedIds])

  const onToggleSelected = (id: string) => {
    selectionTouchedRef.current = true
    toggleSelected(id)
  }

  const selectedPlans = useMemo(
    () =>
      selectedIds
        .map((id) => plans.find((plan) => plan.id === id))
        .filter((plan): plan is Plan => Boolean(plan)),
    [selectedIds, plans]
  )

  /**
   * The parameters a plan is *currently* worth: the working copy for the active
   * plan while it has unsaved edits, the stored params otherwise. Both the run
   * and the staleness check use this, so a re-run actually clears the STALE
   * badge instead of reproducing it.
   */
  const paramsFor = useCallback(
    (plan: Plan) =>
      isDirty && plan.id === activePlanId ? workingParams : plan.params,
    [isDirty, activePlanId, workingParams]
  )

  const hasEnoughSelected = selectedPlans.length >= MIN_COMPARISON_PLANS
  const canRun = hasEnoughSelected && status !== 'running'
  const hasEnoughPlans = plans.length >= MIN_COMPARISON_PLANS

  const runComparison = async () => {
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setStatus('running')

    try {
      const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
      const next: ComparisonSnapshot[] = []

      for (const plan of selectedPlans) {
        const planParams = paramsFor(plan)
        const requested = Math.min(planParams.simulationRuns, COMPARISON_RUNS)
        // What the engine will really do with that request — 125 fixed paths
        // under the historical model, whatever number was asked for.
        const runs = effectiveRunCount({ ...planParams, simulationRuns: requested })
        const results = await runSimulationInClient({ ...planParams, simulationRuns: requested })
        const lastIndex = Math.max(0, results.ages.length - 1)
        const depletionShare = results.depletionByAge?.[lastIndex]

        next.push({
          planId: plan.id,
          name: planDisplayName(plan, t),
          successRate: results.successRate,
          medianEndAssets: results.assetPercentiles.p50[lastIndex] ?? 0,
          depletionRisk:
            typeof depletionShare === 'number' ? depletionShare * 100 : 100 - results.successRate,
          shortfallAge: deriveDepletionAges(results).p10DepletionAge,
          retirementAge: planParams.retirementAge,
          ages: results.ages,
          medianAssets: results.assetPercentiles.p50,
          fingerprint: comparisonFingerprint(planParams),
          runs,
          marketModel: planParams.marketModel,
          ranAt: Date.now(),
        })
      }

      if (runIdRef.current !== runId) return
      setSnapshots(next)
      setStatus('ready')
    } catch (error) {
      console.error('Plan comparison failed:', error)
      if (runIdRef.current !== runId) return
      setSnapshots([])
      setStatus('error')
    }
  }

  // A snapshot is stale once its plan's parameters moved on since the run, once
  // the plan is gone entirely — or, for the active plan, once the working copy
  // carries unsaved edits: the dashboard then shows one plan and this row
  // another, and only saying so keeps the table honest.
  const staleIds = useMemo(() => {
    const stale = new Set<string>()
    snapshots.forEach((snapshot) => {
      const plan = plans.find((entry) => entry.id === snapshot.planId)
      if (!plan || comparisonFingerprint(paramsFor(plan)) !== snapshot.fingerprint) {
        stale.add(snapshot.planId)
      }
    })
    return stale
  }, [snapshots, plans, paramsFor])

  /**
   * True when the only reason anything is stale is the unsaved working copy —
   * the snapshot still matches the *stored* plan, so the banner has to say
   * "unsaved edits" rather than "parameters changed".
   */
  const dirtyOnly = useMemo(
    () =>
      isDirty &&
      staleIds.size > 0 &&
      snapshots.every((snapshot) => {
        const plan = plans.find((entry) => entry.id === snapshot.planId)
        return plan !== undefined && comparisonFingerprint(plan.params) === snapshot.fingerprint
      }),
    [isDirty, staleIds, snapshots, plans]
  )

  const formatRanAt = (timestamp: number) =>
    format.dateTime(new Date(timestamp), { dateStyle: 'short', timeStyle: 'short' })

  /** "Stale · run 12/08, 14:31" — the badge and when the number was measured. */
  const staleBadge = (snapshot: ComparisonSnapshot) =>
    staleIds.has(snapshot.planId) ? (
      <span
        className="mt-1 inline-flex items-center gap-1 border-2 border-warning-600 bg-warning-50 px-1.5 py-0.5 text-[0.52rem] font-extrabold uppercase tracking-[0.1em] text-warning-700"
        data-testid="plan-comparison-stale-badge"
        title={tc('staleRanAt', { time: formatRanAt(snapshot.ranAt) })}
      >
        {tc('staleBadge')}
        <span className="font-semibold tracking-normal normal-case">
          {tc('staleRanAt', { time: formatRanAt(snapshot.ranAt) })}
        </span>
      </span>
    ) : null

  // Results belong to the plans that were run; if the chips have moved on since,
  // say so instead of letting the table quietly disagree with the selection.
  const selectionChanged =
    snapshots.length > 0 &&
    (snapshots.length !== selectedIds.length ||
      snapshots.some((snapshot, index) => snapshot.planId !== selectedIds[index]))

  const chartData = useMemo(() => {
    if (snapshots.length === 0) return []

    const ages = Array.from(new Set(snapshots.flatMap((snapshot) => snapshot.ages))).sort(
      (a, b) => a - b
    )

    return ages.map((age) => {
      const point: Record<string, number | null> = { age }
      snapshots.forEach((snapshot, index) => {
        const ageIndex = snapshot.ages.indexOf(age)
        point[`plan${index}`] = ageIndex === -1 ? null : (snapshot.medianAssets[ageIndex] ?? null)
      })
      return point
    })
  }, [snapshots])

  const bestSuccess =
    snapshots.length > 0 ? Math.max(...snapshots.map((snapshot) => snapshot.successRate)) : null
  const baseline = snapshots[0]

  // One dashed marker per distinct retirement age, labelled with the plan it
  // belongs to — an unlabelled dash in a multi-plan chart is just noise.
  const retirementMarkers = useMemo(() => {
    const byAge = new Map<number, { names: string[]; index: number }>()
    snapshots.forEach((snapshot, index) => {
      // Long plan names would run off the plot; the legend carries the full one.
      const short =
        snapshot.name.length > 16 ? `${snapshot.name.slice(0, 15).trimEnd()}…` : snapshot.name
      const entry = byAge.get(snapshot.retirementAge)
      if (entry) entry.names.push(short)
      else byAge.set(snapshot.retirementAge, { names: [short], index })
    })
    return Array.from(byAge.entries())
      .map(([age, entry]) => ({ age, ...entry }))
      .sort((a, b) => a.age - b.age)
  }, [snapshots])

  const formatPercentValue = (value: number) =>
    format.number(value / 100, {
      style: 'percent',
      minimumFractionDigits: value % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    })

  const signed = (value: number, body: string) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${body}`

  const formatPointsDelta = (value: number) =>
    Math.abs(value) < 0.05
      ? tc('deltaSame')
      : tc('deltaPoints', {
          value: signed(
            value,
            format.number(Math.abs(value), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
          ),
        })

  const formatCurrencyDelta = (value: number) =>
    // Rounded first: locales that do not abbreviate thousands (German keeps
    // "949.171 €") would otherwise render a stray decimal.
    Math.abs(value) < 1
      ? tc('deltaSame')
      : signed(value, formatCurrencyShort(Math.round(Math.abs(value))))

  const formatYearsDelta = (value: number) =>
    value === 0
      ? tc('deltaSame')
      : tc('deltaYears', { value: signed(value, format.number(Math.abs(value))) })

  const deltaTone = (value: number, higherIsBetter: boolean) => {
    if (Math.abs(value) < 1e-9) return 'text-muted-foreground'
    return (higherIsBetter ? value > 0 : value < 0) ? 'text-success-700' : 'text-neo-red'
  }

  /** Delta against the first (base) plan, or the "Base" tag on that plan itself. */
  const renderDelta = (index: number, value: string, tone: string) =>
    index === 0 ? (
      <span className="block text-[0.56rem] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
        {tc('base')}
      </span>
    ) : (
      <span className={cn('block text-[0.58rem] font-extrabold tabular-nums', tone)}>{value}</span>
    )

  const shortfallDelta = (snapshot: ComparisonSnapshot) => {
    if (!baseline || snapshot.shortfallAge === null || baseline.shortfallAge === null) return null
    return snapshot.shortfallAge - baseline.shortfallAge
  }

  const successDelta = (snapshot: ComparisonSnapshot) =>
    snapshot.successRate - (baseline?.successRate ?? 0)
  const assetsDelta = (snapshot: ComparisonSnapshot) =>
    snapshot.medianEndAssets - (baseline?.medianEndAssets ?? 0)
  const riskDelta = (snapshot: ComparisonSnapshot) =>
    snapshot.depletionRisk - (baseline?.depletionRisk ?? 0)

  const renderTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean
    payload?: ReadonlyArray<{ dataKey?: string | number; value?: number | null }>
    label?: string | number
  }) => {
    if (!active || !payload?.length) return null

    const tooltipRows = snapshots
      .map((snapshot, index): TooltipRow | null => {
        const entry = payload.find((item) => item.dataKey === `plan${index}`)
        if (!entry || entry.value == null) return null
        return {
          key: snapshot.planId,
          label: snapshot.name,
          value: formatCurrency(entry.value),
          kind: 'line',
          color: hueFor(index).solid,
        }
      })
      .filter((row): row is TooltipRow => row !== null)

    if (tooltipRows.length === 0) return null

    return <ChartTooltipCard title={tc('chart.tooltip', { age: label ?? '' })} rows={tooltipRows} />
  }

  /** Stale numbers stay readable but visibly out of date. */
  const staleClass = (planId: string) => (staleIds.has(planId) ? 'opacity-45 grayscale' : undefined)

  // Assumptions follow the plans that were actually run, so the columns line up
  // with the results above even if the selection has moved on since.
  const assumptionPlans = snapshots
    .map((snapshot, index) => {
      const plan = plans.find((entry) => entry.id === snapshot.planId)
      return plan
        ? {
            id: plan.id,
            name: planDisplayName(plan, t),
            params: plan.params,
            color: hueFor(index).solid,
          }
        : null
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  return (
    <Card className="overflow-hidden" data-testid="plan-comparison">
      <CardContent className="bg-neo-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <GitCompareArrows
              className="mt-0.5 h-5 w-5 shrink-0 text-neo-blue"
              aria-hidden="true"
            />
            <div>
              <h4 className="text-sm font-extrabold uppercase tracking-[0.16em]">{tc('title')}</h4>
              <p className="mt-1 max-w-xl text-xs font-medium text-muted-foreground">
                {tc('subtitle')}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => void runComparison()}
            disabled={!canRun}
            title={hasEnoughSelected ? undefined : tc('selectMore', { min: MIN_COMPARISON_PLANS })}
            data-testid="plan-comparison-run"
          >
            {status === 'running' ? tc('running') : snapshots.length > 0 ? tc('rerun') : tc('run')}
          </Button>
        </div>

        <fieldset className="mt-5 border-0 p-0">
          <legend className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
            {tc('select')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {plans.map((plan) => {
              const index = selectedIds.indexOf(plan.id)
              const isSelected = index !== -1
              const atLimit = !isSelected && selectedIds.length >= MAX_COMPARISON_PLANS

              return (
                <button
                  key={plan.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => onToggleSelected(plan.id)}
                  disabled={atLimit}
                  data-testid="plan-comparison-option"
                  data-selected={isSelected ? 'true' : 'false'}
                  className={cn(
                    'flex items-center gap-2 border-2 py-2 pl-2 pr-3 text-[0.66rem] font-extrabold uppercase tracking-[0.12em] transition-neo',
                    isSelected
                      ? 'border-neo-black bg-neo-yellow text-neo-black shadow-neo-xs'
                      : 'border-dashed border-neo-black/40 bg-neo-white text-muted-foreground hover:border-solid hover:border-neo-black hover:text-neo-black',
                    atLimit && 'cursor-not-allowed opacity-40'
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center border-2',
                      isSelected
                        ? 'border-neo-black bg-neo-black text-neo-white'
                        : 'border-neo-black/40 bg-neo-white'
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" strokeWidth={4} />}
                  </span>
                  {isSelected && <LegendSwatch kind="line" color={hueFor(index).solid} />}
                  <span className="max-w-[12rem] truncate">{planDisplayName(plan, t)}</span>
                  {plan.id === activePlanId && (
                    <span className="text-[0.56rem] font-semibold tracking-[0.1em] text-neo-blue">
                      {tc('active')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p
            className={cn(
              'mt-2 text-[0.62rem]',
              hasEnoughPlans && !hasEnoughSelected
                ? 'font-semibold text-neo-red'
                : 'font-medium text-muted-foreground'
            )}
            data-testid="plan-comparison-hint"
          >
            {!hasEnoughPlans
              ? tc('needMorePlans')
              : hasEnoughSelected
                ? tc('hint', { min: MIN_COMPARISON_PLANS, max: MAX_COMPARISON_PLANS })
                : tc('selectMore', { min: MIN_COMPARISON_PLANS })}
          </p>
        </fieldset>

        {status === 'error' && (
          <p className="mt-4 border-2 border-neo-red bg-red-50 px-3 py-2 text-xs font-semibold text-neo-red">
            {tc('error')}
          </p>
        )}

        {snapshots.length === 0 ? (
          <p className="mt-5 border-2 border-dashed border-neo-black/30 px-4 py-6 text-center text-xs font-medium text-muted-foreground">
            {status === 'running'
              ? tc('running')
              : hasEnoughSelected
                ? tc('emptyReady', { count: selectedPlans.length })
                : tc('emptyNeedsSelection', { min: MIN_COMPARISON_PLANS })}
          </p>
        ) : (
          <>
            {(staleIds.size > 0 || selectionChanged) && (
              <div
                className="mt-4 flex flex-col gap-2 border-2 border-warning-600 bg-warning-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                data-testid="plan-comparison-stale"
              >
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-warning-700">
                  {staleIds.size === 0
                    ? tc('selectionChanged')
                    : dirtyOnly
                      ? tc('staleDirty')
                      : tc('stale')}
                </p>
                <Button
                  size="sm"
                  className="h-8 shrink-0 px-3 text-[0.6rem]"
                  onClick={() => void runComparison()}
                  disabled={!canRun}
                  data-testid="plan-comparison-stale-rerun"
                >
                  {tc('staleRerun')}
                </Button>
              </div>
            )}

            {/* Desktop: one row per plan. */}
            <div className="mt-5 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[34rem] border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-neo-black text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                    <th scope="col" className="py-2 pr-3">
                      {tc('columns.plan')}
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      {tc('columns.successRate')}
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      {tc('columns.medianEnd')}
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      {tc('columns.depletionRisk')}
                    </th>
                    <th scope="col" className="py-2 text-right">
                      {tc('columns.shortfallAge')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snapshot, index) => {
                    const health = getPlanHealth(snapshot.successRate)
                    const years = shortfallDelta(snapshot)
                    const muted = staleClass(snapshot.planId)

                    return (
                      <tr
                        key={snapshot.planId}
                        className="border-b border-neo-black/15 text-[0.72rem] font-semibold text-neo-black"
                        data-testid="plan-comparison-row"
                        data-stale={staleIds.has(snapshot.planId) ? 'true' : 'false'}
                      >
                        <th scope="row" className="py-3 pr-3 font-extrabold">
                          <span className="flex items-center gap-2">
                            <LegendSwatch kind="line" color={hueFor(index).solid} />
                            <span className="max-w-[12rem] truncate">{snapshot.name}</span>
                          </span>
                          {staleBadge(snapshot)}
                        </th>
                        <td className={cn('py-3 pr-3 text-right tabular-nums', muted)}>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 border-2 px-2 py-1 text-[0.66rem] font-extrabold',
                              healthClasses[health]
                            )}
                          >
                            {formatPercentValue(snapshot.successRate)}
                            {bestSuccess !== null && snapshot.successRate === bestSuccess && (
                              <span className="text-[0.54rem] tracking-[0.1em]">{tc('best')}</span>
                            )}
                          </span>
                          {renderDelta(
                            index,
                            formatPointsDelta(successDelta(snapshot)),
                            deltaTone(successDelta(snapshot), true)
                          )}
                        </td>
                        <td className={cn('py-3 pr-3 text-right tabular-nums', muted)}>
                          {formatCurrency(snapshot.medianEndAssets)}
                          {renderDelta(
                            index,
                            formatCurrencyDelta(assetsDelta(snapshot)),
                            deltaTone(assetsDelta(snapshot), true)
                          )}
                        </td>
                        <td className={cn('py-3 pr-3 text-right tabular-nums', muted)}>
                          {formatPercentValue(snapshot.depletionRisk)}
                          {renderDelta(
                            index,
                            formatPointsDelta(riskDelta(snapshot)),
                            deltaTone(riskDelta(snapshot), false)
                          )}
                        </td>
                        <td className={cn('py-3 text-right tabular-nums', muted)}>
                          {snapshot.shortfallAge ?? tc('never')}
                          {years !== null &&
                            renderDelta(index, formatYearsDelta(years), deltaTone(years, true))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: the same numbers as one card per plan, nothing clipped. */}
            <ul className="mt-5 space-y-3 md:hidden" data-testid="plan-comparison-cards">
              {snapshots.map((snapshot, index) => {
                const health = getPlanHealth(snapshot.successRate)
                const years = shortfallDelta(snapshot)
                const muted = staleClass(snapshot.planId)

                return (
                  <li
                    key={snapshot.planId}
                    className="border-2 border-neo-black bg-neo-white px-4 py-3"
                    data-testid="plan-comparison-card"
                    data-stale={staleIds.has(snapshot.planId) ? 'true' : 'false'}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 flex-col">
                        <span className="flex min-w-0 items-center gap-2 text-[0.74rem] font-extrabold text-neo-black">
                          <LegendSwatch kind="line" color={hueFor(index).solid} />
                          <span className="truncate">{snapshot.name}</span>
                        </span>
                        {staleBadge(snapshot)}
                      </span>
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 border-2 px-2 py-1 text-[0.66rem] font-extrabold',
                          healthClasses[health],
                          muted
                        )}
                      >
                        {formatPercentValue(snapshot.successRate)}
                        {bestSuccess !== null && snapshot.successRate === bestSuccess && (
                          <span className="text-[0.54rem] tracking-[0.1em]">{tc('best')}</span>
                        )}
                      </span>
                    </div>

                    <dl className={cn('mt-3 divide-y divide-neo-black/10 text-[0.68rem]', muted)}>
                      {[
                        {
                          key: 'success',
                          label: tc('columns.successRate'),
                          value:
                            index === 0 ? tc('base') : formatPointsDelta(successDelta(snapshot)),
                          tone:
                            index === 0
                              ? 'text-muted-foreground'
                              : deltaTone(successDelta(snapshot), true),
                          delta: null,
                        },
                        {
                          key: 'medianEnd',
                          label: tc('columns.medianEnd'),
                          value: formatCurrency(snapshot.medianEndAssets),
                          tone: undefined,
                          delta:
                            index === 0
                              ? null
                              : {
                                  text: formatCurrencyDelta(assetsDelta(snapshot)),
                                  tone: deltaTone(assetsDelta(snapshot), true),
                                },
                        },
                        {
                          key: 'depletion',
                          label: tc('columns.depletionRisk'),
                          value: formatPercentValue(snapshot.depletionRisk),
                          tone: undefined,
                          delta:
                            index === 0
                              ? null
                              : {
                                  text: formatPointsDelta(riskDelta(snapshot)),
                                  tone: deltaTone(riskDelta(snapshot), false),
                                },
                        },
                        {
                          key: 'shortfall',
                          label: tc('columns.shortfallAge'),
                          value: `${snapshot.shortfallAge ?? tc('never')}`,
                          tone: undefined,
                          delta:
                            years === null || index === 0
                              ? null
                              : { text: formatYearsDelta(years), tone: deltaTone(years, true) },
                        },
                      ].map((row) => (
                        <div
                          key={row.key}
                          className="flex items-baseline justify-between gap-3 py-1.5"
                        >
                          <dt className="font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            {row.label}
                          </dt>
                          <dd
                            className={cn(
                              'shrink-0 text-right font-extrabold tabular-nums',
                              row.tone
                            )}
                          >
                            {row.value}
                            {row.delta && (
                              <span className={cn('ml-2 text-[0.6rem]', row.delta.tone)}>
                                {row.delta.text}
                              </span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                )
              })}
            </ul>

            <div className="mt-6 border-3 border-neo-black bg-neo-white p-4 shadow-neo-sm">
              <h5 className="text-[0.72rem] font-extrabold uppercase tracking-[0.16em] text-neo-black">
                {tc('chart.title')}
              </h5>
              <p className="mt-1 text-[0.66rem] font-medium text-muted-foreground">
                {tc('chart.description')}
              </p>

              <ChartLegend
                className="mt-3"
                items={snapshots.map((snapshot, index) => ({
                  key: snapshot.planId,
                  label: snapshot.name,
                  kind: 'line',
                  color: hueFor(index).solid,
                }))}
              />

              <div
                ref={chartFrameRef}
                className={cn(
                  'mt-3 h-[16rem] w-full min-w-0 sm:h-[19rem]',
                  staleIds.size === snapshots.length && 'opacity-45 grayscale'
                )}
                role="img"
                aria-label={tc('chart.aria')}
              >
                {chartSize.width > 0 && (
                  <LineChart
                    width={chartSize.width}
                    height={chartSize.height}
                    data={chartData}
                    margin={
                      isMobile
                        ? { top: 26, right: 8, left: 0, bottom: 4 }
                        : { top: 30, right: 16, left: 4, bottom: 4 }
                    }
                  >
                    <CartesianGrid vertical={false} stroke={chartInk.grid} strokeWidth={1} />
                    <XAxis
                      dataKey="age"
                      tick={axisTick(isMobile)}
                      tickLine={false}
                      tickMargin={8}
                      minTickGap={isMobile ? 24 : 32}
                      axisLine={{ stroke: chartInk.axisLine }}
                    />
                    <YAxis
                      // Wide enough for compact currency labels in every
                      // locale (German renders e.g. "4 Mio. €").
                      width={isMobile ? 56 : 74}
                      tick={axisTick(isMobile)}
                      tickLine={false}
                      tickMargin={6}
                      axisLine={false}
                      tickFormatter={formatCurrencyShort}
                    />
                    <Tooltip content={renderTooltip} cursor={{ stroke: chartInk.cursor }} />
                    <ReferenceLine y={0} stroke={chartInk.axisLine} strokeWidth={1} />
                    {retirementMarkers.map((marker, markerIndex) => (
                      <ReferenceLine
                        key={`retirement-${marker.age}`}
                        x={marker.age}
                        stroke={hueFor(marker.index).solid}
                        strokeOpacity={0.6}
                        strokeDasharray="4 4"
                        label={{
                          value: `${marker.names.join(' · ')} · ${marker.age}`,
                          position: 'top',
                          dy: markerIndex * 12,
                          fill: hueFor(marker.index).solid,
                          fontSize: isMobile ? 9 : 10,
                          fontWeight: 700,
                        }}
                      />
                    ))}
                    {snapshots.map((snapshot, index) => (
                      <Line
                        key={snapshot.planId}
                        type="monotone"
                        dataKey={`plan${index}`}
                        name={snapshot.name}
                        stroke={hueFor(index).solid}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 3 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                )}
              </div>
            </div>

            {assumptionPlans.length >= MIN_COMPARISON_PLANS && (
              <AssumptionsDiff plans={assumptionPlans} />
            )}

            {/* The footnote used to promise "up to 1 200 runs per plan" while
                every plan actually ran at its own count — 500, or 125 fixed
                historical paths. It now lists what was really used. */}
            <p className="mt-3 text-[0.6rem] font-medium text-muted-foreground">
              {tc('runsNote', {
                detail: snapshots
                  .map((snapshot) =>
                    snapshot.marketModel === 'historical'
                      ? tc('runsNoteEntryHistorical', {
                          name: snapshot.name,
                          runs: format.number(snapshot.runs),
                        })
                      : tc('runsNoteEntry', {
                          name: snapshot.name,
                          runs: format.number(snapshot.runs),
                        })
                  )
                  .join(' · '),
              })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
