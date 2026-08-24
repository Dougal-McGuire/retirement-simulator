'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ChevronDown, Wallet } from 'lucide-react'
import { WITHDRAWAL_STRATEGIES, type SimulationParams, type WithdrawalStrategy } from '@/types'
import { Button } from '@/components/ui/button'
import { WizardSliderField } from '@/components/forms/fields/WizardSliderField'
import { LabeledNumberInput } from '@/components/forms/fields/LabeledNumberInput'
import { RealToggle } from '@/components/charts/RealToggle'
import { SpendingCorridorChart } from '@/components/charts/SpendingCorridorChart'
import { hasRealSeries, useChartFormatters } from '@/components/charts/useChartData'
import {
  buildSpendingCorridor,
  corridorReferenceAge,
  summarizeStrategyOutcome,
  type StrategyOutcomeMetrics,
} from '@/lib/simulation/spendingCorridor'
import { comparisonFingerprint } from '@/lib/simulation/planDiff'
import { useDisplayReal, useSetDisplayReal } from '@/lib/stores/displayStore'
import {
  useSimulationParams,
  useSimulationResults,
  useUpdateParams,
} from '@/lib/stores/simulationStore'
import { cn } from '@/lib/utils'

/**
 * Run budget for the four-strategy comparison.
 *
 * Deliberately the same number the plan comparison uses: both answer "how do
 * these two things differ", both rely on the engine's fixed scenario set to
 * make that difference signal rather than sampling noise, and a user who sees
 * 1,200 in one footnote and 400 in the other has to wonder which to believe.
 */
const STRATEGY_COMPARE_RUNS = 1200

interface StrategySnapshot extends StrategyOutcomeMetrics {
  strategy: WithdrawalStrategy
}

interface StatItem {
  key: string
  label: string
  value: string
  hint: string
}

function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="withdrawal-planner-stats">
      {items.map((item) => (
        <div
          key={item.key}
          className="border-2 border-neo-black bg-background px-3 py-2"
          data-testid={`withdrawal-stat-${item.key}`}
        >
          <dt className="text-[0.55rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-sm font-black tabular-nums text-neo-black">{item.value}</dd>
          <dd className="mt-0.5 text-[0.55rem] font-medium leading-tight text-muted-foreground">
            {item.hint}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The Dynamic Spending Planner.
 *
 * Three bare number fields used to be the whole withdrawal story. This card is
 * the same model with the consequences made visible: pick a rule, see what it
 * promises (the corridor), see what it costs (success rate), and — the point of
 * the whole surface — run the *same* plan under all four rules over the same
 * market paths, so the stability↔survival trade-off is a table rather than a
 * hunch.
 *
 * Every edit goes through `updateParams`, i.e. into the plan's working copy,
 * exactly like the rest of the editor. Nothing here writes to a stored plan.
 */
interface WithdrawalPlannerProps {
  className?: string
  /**
   * Optional collapse wiring, supplied by the plan editor so this section folds
   * away like the four cards above it. Omitted everywhere else, which leaves
   * the planner permanently open exactly as before.
   */
  collapsed?: boolean
  onToggleCollapsed?: () => void
  collapseLabel?: string
}

export function WithdrawalPlanner({
  className,
  collapsed = false,
  onToggleCollapsed,
  collapseLabel,
}: WithdrawalPlannerProps) {
  const t = useTranslations('withdrawalPlanner')
  const tControls = useTranslations('parameterControls')
  const tSetup = useTranslations('setup')
  const format = useFormatter()

  const params = useSimulationParams()
  const results = useSimulationResults()
  const updateParams = useUpdateParams()

  const displayReal = useDisplayReal()
  const setDisplayReal = useSetDisplayReal()
  const canShowReal = hasRealSeries(results)

  const { formatCurrency, formatCurrencyShort } = useChartFormatters()

  const [snapshots, setSnapshots] = useState<StrategySnapshot[]>([])
  const [comparedFingerprint, setComparedFingerprint] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'running' | 'ready' | 'error'>('idle')
  const runIdRef = useRef(0)

  const formatPercent = useCallback(
    (value: number, maximumFractionDigits = 1) =>
      format.number(value, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits }),
    [format]
  )

  const formatRatio = useCallback(
    (value: number) =>
      `${format.number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`,
    [format]
  )

  const referenceAge = corridorReferenceAge(params)

  // The corridor always follows the *results'* own parameter set: drawing the
  // floor of the strategy the user just picked over a band produced by the
  // previous one would be a straightforward lie for the ~100ms until the
  // debounced re-run lands.
  const corridor = useMemo(
    () => (results ? buildSpendingCorridor(results.params, results, displayReal) : null),
    [results, displayReal]
  )

  const metrics = useMemo(
    () => (results ? summarizeStrategyOutcome(results.params, results) : null),
    [results]
  )

  const stats = useMemo<StatItem[]>(() => {
    const none = t('stats.none')
    const unit = t('stats.unit')
    return [
      {
        key: 'firstYear',
        label: t('stats.firstYear'),
        value: metrics
          ? `${formatCurrency(Math.round(metrics.firstYearMonthlySpending))}${unit}`
          : none,
        hint: t('stats.firstYearHint', { age: Math.max(params.currentAge, params.retirementAge) }),
      },
      {
        key: 'floor',
        label: t('stats.floor'),
        value:
          metrics && metrics.guaranteedFloor !== null && metrics.guaranteedFloor > 0
            ? `${formatCurrency(Math.round(metrics.guaranteedFloor))}${unit}`
            : none,
        hint: t('stats.floorHint', { age: referenceAge }),
      },
      {
        key: 'volatility',
        label: t('stats.volatility'),
        value: metrics?.volatilityRatio ? formatRatio(metrics.volatilityRatio) : none,
        hint: t('stats.volatilityHint', { age: referenceAge }),
      },
      {
        key: 'success',
        label: t('stats.success'),
        value: metrics ? formatPercent(metrics.successRate / 100, 1) : none,
        hint: t('stats.successHint'),
      },
    ]
  }, [
    t,
    metrics,
    formatCurrency,
    formatPercent,
    formatRatio,
    params.currentAge,
    params.retirementAge,
    referenceAge,
  ])

  const fingerprint = comparisonFingerprint(params)
  const isStale = comparedFingerprint !== null && comparedFingerprint !== fingerprint

  const runComparison = async () => {
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setStatus('running')

    try {
      const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
      const runs = Math.min(params.simulationRuns, STRATEGY_COMPARE_RUNS)
      const next: StrategySnapshot[] = []

      for (const strategy of WITHDRAWAL_STRATEGIES) {
        const strategyParams: SimulationParams = {
          ...params,
          withdrawalStrategy: strategy,
          simulationRuns: runs,
        }
        const strategyResults = await runSimulationInClient(strategyParams)
        next.push({
          strategy,
          ...summarizeStrategyOutcome(strategyResults.params, strategyResults),
        })
      }

      if (runIdRef.current !== runId) return
      setSnapshots(next)
      setComparedFingerprint(fingerprint)
      setStatus('ready')
    } catch (error) {
      console.error('Strategy comparison failed:', error)
      if (runIdRef.current !== runId) return
      setSnapshots([])
      setStatus('error')
    }
  }

  /** Highest value wins, except for the spread where lowest wins. */
  const bestValues = useMemo(() => {
    if (snapshots.length === 0) return null
    const finite = (values: Array<number | null>) =>
      values.filter((value): value is number => value !== null && Number.isFinite(value))
    const successes = finite(snapshots.map((s) => s.successRate))
    const spending = finite(snapshots.map((s) => s.medianLifetimeSpending))
    const floors = finite(snapshots.map((s) => s.guaranteedFloor))
    const spreads = finite(snapshots.map((s) => s.volatilityRatio))
    return {
      successRate: successes.length ? Math.max(...successes) : null,
      medianLifetimeSpending: spending.length ? Math.max(...spending) : null,
      guaranteedFloor: floors.length ? Math.max(...floors) : null,
      volatilityRatio: spreads.length ? Math.min(...spreads) : null,
    }
  }, [snapshots])

  const isBest = (value: number | null, best: number | null | undefined) =>
    value !== null && best !== null && best !== undefined && Math.abs(value - best) < 1e-9

  const strategyLabel = (strategy: WithdrawalStrategy) =>
    tControls(`fields.withdrawalStrategy.options.${strategy}.label`)

  const renderBest = (show: boolean) =>
    show ? (
      <span className="ml-1.5 border border-neo-black bg-neo-yellow px-1 py-px text-[0.5rem] font-extrabold uppercase tracking-[0.1em] text-neo-black">
        {t('compare.best')}
      </span>
    ) : null

  const compareCells = (snapshot: StrategySnapshot) => [
    {
      key: 'success',
      value: formatPercent(snapshot.successRate / 100, 1),
      best: isBest(snapshot.successRate, bestValues?.successRate),
    },
    {
      key: 'lifetimeSpending',
      value: formatCurrencyShort(Math.round(snapshot.medianLifetimeSpending)),
      best: isBest(snapshot.medianLifetimeSpending, bestValues?.medianLifetimeSpending),
    },
    {
      key: 'floor',
      value:
        snapshot.guaranteedFloor && snapshot.guaranteedFloor > 0
          ? `${formatCurrency(Math.round(snapshot.guaranteedFloor))}${t('stats.unit')}`
          : t('compare.none'),
      best: isBest(snapshot.guaranteedFloor, bestValues?.guaranteedFloor),
    },
    {
      key: 'volatility',
      value: snapshot.volatilityRatio ? formatRatio(snapshot.volatilityRatio) : t('compare.none'),
      best: isBest(snapshot.volatilityRatio, bestValues?.volatilityRatio),
    },
  ]

  const showRateSlider = params.withdrawalStrategy !== 'fixedReal'
  const showGuardrails = params.withdrawalStrategy === 'vanguardDynamic'
  const showRealFloor = params.withdrawalStrategy === 'percentOfPortfolio'

  return (
    <section
      id="plan-editor-withdrawal"
      data-testid="withdrawal-planner"
      data-collapsed={collapsed || undefined}
      className={cn(
        'theme-panel-card flex scroll-mt-32 flex-col gap-5 border-3 border-neo-black bg-neo-white p-5 shadow-neo',
        className
      )}
    >
      <header className="flex flex-col gap-3 border-b-2 border-neo-black pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-neo-purple" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-[0.92rem] font-black uppercase tracking-[0.16em] text-neo-black">
              {t('title')}
            </h3>
            <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-muted-foreground">
              {t('description')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canShowReal && <RealToggle value={displayReal} onChange={setDisplayReal} />}
          {onToggleCollapsed && (
            <button
              type="button"
              data-testid="plan-editor-withdrawal-toggle"
              aria-expanded={!collapsed}
              aria-controls="plan-editor-withdrawal-body"
              aria-label={collapseLabel}
              title={collapseLabel}
              onClick={onToggleCollapsed}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center border-2 border-neo-black bg-neo-white text-neo-black transition-neo hover:bg-neo-yellow"
            >
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', collapsed && '-rotate-90')}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </header>

      <StatStrip items={stats} />

      <div
        id="plan-editor-withdrawal-body"
        className={cn('flex-col gap-5', collapsed ? 'hidden' : 'flex')}
      >
        <div className="space-y-3" data-testid="withdrawal-strategy-picker">
          <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-neo-black">
            {t('strategyLabel')}
          </span>
          <div className="grid gap-2 sm:grid-cols-2" role="group">
            {WITHDRAWAL_STRATEGIES.map((strategy) => {
              const isSelected = params.withdrawalStrategy === strategy
              return (
                <button
                  key={strategy}
                  type="button"
                  aria-pressed={isSelected}
                  data-testid={`withdrawal-strategy-${strategy}`}
                  onClick={() => updateParams({ withdrawalStrategy: strategy })}
                  className={cn(
                    'flex flex-col items-start gap-1 border-2 border-neo-black px-3 py-2.5 text-left transition-neo',
                    isSelected
                      ? 'bg-neo-blue text-neo-white shadow-neo-xs'
                      : 'bg-neo-white text-neo-black hover:bg-neo-blue/10'
                  )}
                >
                  <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.1em]">
                    {strategyLabel(strategy)}
                  </span>
                  <span className="text-[0.58rem] font-medium leading-snug opacity-90">
                    {tControls(`fields.withdrawalStrategy.options.${strategy}.description`)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {corridor ? (
          <SpendingCorridorChart
            points={corridor.points}
            retirementAge={Math.max(
              results?.params.currentAge ?? 0,
              results?.params.retirementAge ?? 0
            )}
            legalRetirementAge={results?.params.legalRetirementAge ?? 0}
            hasFloor={corridor.paths.hasFloor}
            hasCeiling={corridor.paths.hasCeiling}
            formatCurrency={formatCurrency}
            formatCurrencyShort={formatCurrencyShort}
          />
        ) : (
          <p className="border-2 border-dashed border-neo-black/30 px-4 py-6 text-center text-xs font-medium text-muted-foreground">
            {t('corridor.empty')}
          </p>
        )}

        <div className="space-y-4 border-2 border-neo-black bg-background px-4 py-4">
          <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-neo-black">
            {t('paramsLabel')}
          </span>

          {!showRateSlider && (
            <p className="text-[0.62rem] font-medium leading-snug text-muted-foreground">
              {t('noParams')}
            </p>
          )}

          {showRateSlider && (
            <div
              className={cn(
                'grid gap-x-5 gap-y-6',
                // Three sliders fit one row; a rate plus a euro field reads
                // better as two wider columns.
                showGuardrails ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
              )}
            >
              <WizardSliderField
                id="planner-dsWithdrawalRate"
                label={tControls('fields.dsWithdrawalRate.label')}
                value={params.dsWithdrawalRate * 100}
                onValueChange={(value) => updateParams({ dsWithdrawalRate: value / 100 })}
                min={2}
                max={8}
                step={0.25}
                valueLabel={formatPercent(params.dsWithdrawalRate, 2)}
                minLabel={formatPercent(0.02, 0)}
                maxLabel={formatPercent(0.08, 0)}
              />

              {showGuardrails && (
                <>
                  <WizardSliderField
                    id="planner-dsCeilingRate"
                    label={tControls('fields.dsCeilingRate.label')}
                    value={params.dsCeilingRate * 100}
                    onValueChange={(value) => updateParams({ dsCeilingRate: value / 100 })}
                    min={0}
                    max={15}
                    step={0.5}
                    valueLabel={formatPercent(params.dsCeilingRate, 1)}
                    minLabel={formatPercent(0, 0)}
                    maxLabel={formatPercent(0.15, 0)}
                  />
                  <WizardSliderField
                    id="planner-dsFloorRate"
                    label={tControls('fields.dsFloorRate.label')}
                    value={params.dsFloorRate * 100}
                    onValueChange={(value) => updateParams({ dsFloorRate: value / 100 })}
                    min={-15}
                    max={0}
                    step={0.5}
                    valueLabel={formatPercent(params.dsFloorRate, 1)}
                    minLabel={formatPercent(-0.15, 0)}
                    maxLabel={formatPercent(0, 0)}
                  />
                </>
              )}

              {showRealFloor && (
                <LabeledNumberInput
                  id="planner-spendingFloorReal"
                  label={tControls('fields.spendingFloorReal.label')}
                  value={params.spendingFloorReal}
                  onChange={(value) => updateParams({ spendingFloorReal: value })}
                  helpText={tControls('fields.spendingFloorReal.tooltip')}
                  className="w-full"
                  unit={tSetup('units.currency')}
                  groupThousands
                  min={0}
                  max={500000}
                  rangeMessage={tSetup('validation.range', {
                    min: format.number(0),
                    max: format.number(500000),
                  })}
                  invalidMessage={tSetup('validation.notANumber')}
                />
              )}
            </div>
          )}

          {showRateSlider && (
            <p className="text-[0.6rem] font-medium leading-snug text-muted-foreground">
              {tControls('fields.dsWithdrawalRate.tooltip')}
            </p>
          )}

          <p className="text-[0.6rem] font-medium leading-snug text-muted-foreground">
            {t('tradeoff')}
          </p>
        </div>

        <div className="space-y-4 border-3 border-neo-black bg-neo-white p-4 shadow-neo-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h4 className="text-[0.78rem] font-extrabold uppercase tracking-[0.16em] text-neo-black">
                {t('compare.title')}
              </h4>
              <p className="mt-1 max-w-xl text-[0.66rem] font-medium text-muted-foreground">
                {t('compare.subtitle')}
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => void runComparison()}
              disabled={status === 'running'}
              data-testid="strategy-compare-run"
            >
              {status === 'running'
                ? t('compare.running')
                : snapshots.length > 0
                  ? t('compare.rerun')
                  : t('compare.run')}
            </Button>
          </div>

          {status === 'error' && (
            <p className="border-2 border-neo-red bg-red-50 px-3 py-2 text-xs font-semibold text-neo-red">
              {t('compare.error')}
            </p>
          )}

          {snapshots.length === 0 ? (
            <p className="border-2 border-dashed border-neo-black/30 px-4 py-5 text-center text-xs font-medium text-muted-foreground">
              {status === 'running' ? t('compare.running') : t('compare.empty')}
            </p>
          ) : (
            <>
              {isStale && (
                <p
                  className="border-2 border-warning-600 bg-warning-50 px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-warning-700"
                  data-testid="strategy-compare-stale"
                >
                  {t('compare.stale')}
                </p>
              )}

              {/* Desktop: one row per strategy. */}
              <div className={cn('hidden overflow-x-auto md:block', isStale && 'opacity-50')}>
                <table
                  className="w-full min-w-[34rem] border-collapse text-left"
                  data-testid="strategy-compare-table"
                >
                  <thead>
                    <tr className="border-b-2 border-neo-black text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                      <th scope="col" className="py-2 pr-3">
                        {t('compare.columns.strategy')}
                      </th>
                      {(['success', 'lifetimeSpending', 'floor', 'volatility'] as const).map(
                        (column) => (
                          <th key={column} scope="col" className="py-2 pr-3 text-right">
                            {t(`compare.columns.${column}`)}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((snapshot) => {
                      const active = snapshot.strategy === params.withdrawalStrategy
                      return (
                        <tr
                          key={snapshot.strategy}
                          data-testid="strategy-compare-row"
                          data-strategy={snapshot.strategy}
                          className={cn(
                            'border-b border-neo-black/15 text-[0.72rem] font-semibold text-neo-black',
                            active && 'bg-neo-yellow/25'
                          )}
                        >
                          <th scope="row" className="py-3 pr-3 font-extrabold">
                            <span className="flex flex-wrap items-center gap-2">
                              {strategyLabel(snapshot.strategy)}
                              {active && (
                                <span className="text-[0.54rem] font-semibold uppercase tracking-[0.1em] text-neo-blue">
                                  {t('compare.active')}
                                </span>
                              )}
                              {!active && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateParams({ withdrawalStrategy: snapshot.strategy })
                                  }
                                  data-testid={`strategy-compare-apply-${snapshot.strategy}`}
                                  className="border border-neo-black px-1.5 py-px text-[0.52rem] font-extrabold uppercase tracking-[0.1em] text-muted-foreground transition-neo hover:bg-neo-blue hover:text-neo-white"
                                >
                                  {t('compare.apply')}
                                </button>
                              )}
                            </span>
                          </th>
                          {compareCells(snapshot).map((cell) => (
                            <td
                              key={cell.key}
                              className="py-3 pr-3 text-right tabular-nums"
                              data-testid={`strategy-compare-${cell.key}`}
                            >
                              {cell.value}
                              {renderBest(cell.best)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile: the same four numbers per strategy, nothing clipped. */}
              <ul className={cn('space-y-3 md:hidden', isStale && 'opacity-50')}>
                {snapshots.map((snapshot) => {
                  const active = snapshot.strategy === params.withdrawalStrategy
                  return (
                    <li
                      key={snapshot.strategy}
                      data-testid="strategy-compare-card"
                      data-strategy={snapshot.strategy}
                      className={cn(
                        'border-2 border-neo-black bg-neo-white px-4 py-3',
                        active && 'bg-neo-yellow/25'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[0.72rem] font-extrabold text-neo-black">
                          {strategyLabel(snapshot.strategy)}
                        </span>
                        {active ? (
                          <span className="shrink-0 text-[0.54rem] font-semibold uppercase tracking-[0.1em] text-neo-blue">
                            {t('compare.active')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateParams({ withdrawalStrategy: snapshot.strategy })}
                            className="shrink-0 border border-neo-black px-1.5 py-px text-[0.52rem] font-extrabold uppercase tracking-[0.1em] text-muted-foreground"
                          >
                            {t('compare.apply')}
                          </button>
                        )}
                      </div>
                      <dl className="mt-2 divide-y divide-neo-black/10 text-[0.68rem]">
                        {compareCells(snapshot).map((cell) => (
                          <div
                            key={cell.key}
                            className="flex items-baseline justify-between gap-3 py-1.5"
                          >
                            <dt className="font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                              {t(`compare.columns.${cell.key}`)}
                            </dt>
                            <dd className="shrink-0 text-right font-extrabold tabular-nums">
                              {cell.value}
                              {renderBest(cell.best)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  )
                })}
              </ul>

              <p className="text-[0.6rem] font-medium leading-snug text-muted-foreground">
                {t('compare.runsNote', {
                  runs: format.number(Math.min(params.simulationRuns, STRATEGY_COMPARE_RUNS)),
                  age: referenceAge,
                })}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
