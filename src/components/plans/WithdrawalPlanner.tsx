'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { WITHDRAWAL_STRATEGIES, type SimulationParams, type WithdrawalStrategy } from '@/types'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { Slider } from '@/components/ui/slider'
import { LabeledNumberInput } from '@/components/forms/fields/LabeledNumberInput'
import { SpendingCorridorChart } from '@/components/charts/SpendingCorridorChart'
import { useChartFormatters } from '@/components/charts/useChartFormatters'
import { AnimatedNumber } from '@/components/workspace/AnimatedNumber'
import { LazyMount } from '@/components/workspace/LazyMount'
import { Skeleton } from '@/components/workspace/Skeleton'
import { useNearViewport } from '@/components/workspace/useNearViewport'
import { useRunStatus } from '@/components/workspace/useRunStatus'
import { useWorkspace } from '@/components/workspace/WorkspaceProvider'
import {
  bestStrategyValues,
  buildSpendingCorridor,
  corridorReferenceAge,
  isBestValue,
  summarizeStrategyOutcome,
  type StrategyOutcomeMetrics,
} from '@/lib/simulation/spendingCorridor'
import { comparisonFingerprint } from '@/lib/simulation/planDiff'
import { areSimulationParamsEqual } from '@/lib/simulation/planInsights'
import { useDisplayReal } from '@/lib/stores/displayStore'
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

/**
 * The comparison shares the one simulation worker with the result bar. After
 * anything closed the gate (an edit, a run, an open panel), the next strategy
 * run waits until the plan has been quiet this long — the same settle the
 * lever measurements use.
 */
const COMPARE_SETTLE_MS = 800
const GATE_POLL_MS = 120

interface StrategySnapshot extends StrategyOutcomeMetrics {
  strategy: WithdrawalStrategy
}

interface StatItem {
  key: string
  label: string
  /** The readout; `null` shows `placeholder` ("None", or "—" before a run). */
  value: number | null
  format: (value: number) => string
  placeholder: string
  hint: string
  /** Fine print folded into an ⓘ beside the label. */
  tip?: string
}

/** Scroll-into-view distance at which the comparison may use the worker. */
const COMPARE_NEAR_MARGIN = '200px 0px'

/**
 * Entnahme: how the plan turns a portfolio into an income.
 *
 * Cause next to effect: pick a rule and tune it on one side; the readouts and
 * the spending corridor answer on the other, live. Underneath, the same plan
 * runs under all four rules over the same market paths, so the
 * stability ↔ survival trade-off is a table rather than a hunch.
 *
 * The corridor is the section's only spending chart. It carries what the old
 * "spending strategy in detail" chart added (the mean withdrawal rate in its
 * tooltip, the reading guide, the legend note); the rule explanation sits
 * under the settings as "How your rule behaves".
 *
 * Every edit goes through `updateParams`, i.e. into the plan's working copy.
 * Nothing here writes to a stored plan.
 */
export function WithdrawalPlanner() {
  const t = useTranslations('withdrawalPlanner')
  const tControls = useTranslations('parameterControls')
  const tSpending = useTranslations('spendingChart')
  const tSetup = useTranslations('setup')
  const format = useFormatter()

  const params = useSimulationParams()
  const results = useSimulationResults()
  const updateParams = useUpdateParams()
  const displayReal = useDisplayReal()
  const { formatCurrency, formatCurrencyShort } = useChartFormatters()
  const rootRef = useRef<HTMLDivElement>(null)

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
  const strategy = params.withdrawalStrategy

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
    const pending = t('compare.none')
    const unit = t('stats.unit')
    const monthly = (value: number) => `${formatCurrency(Math.round(value))}${unit}`
    const floor =
      metrics?.guaranteedFloor != null && metrics.guaranteedFloor > 0
        ? Math.round(metrics.guaranteedFloor)
        : null
    return [
      {
        key: 'firstYear',
        label: t('stats.firstYear'),
        value: metrics ? Math.round(metrics.firstYearMonthlySpending) : null,
        format: monthly,
        placeholder: pending,
        hint: t('stats.firstYearHint', { age: Math.max(params.currentAge, params.retirementAge) }),
      },
      {
        key: 'floor',
        label: t('stats.floor'),
        value: floor,
        format: monthly,
        placeholder: metrics ? none : pending,
        hint: t('stats.floorHint', { age: referenceAge }),
        // A floor is paid from the portfolio: say so wherever one is promised.
        tip: floor !== null ? t('corridor.caveat') : undefined,
      },
      {
        key: 'volatility',
        label: t('stats.volatility'),
        value: metrics?.volatilityRatio || null,
        format: formatRatio,
        placeholder: metrics ? none : pending,
        hint: t('stats.volatilityHint', { age: referenceAge }),
      },
      {
        key: 'success',
        label: t('stats.success'),
        value: metrics ? metrics.successRate / 100 : null,
        format: (value) => formatPercent(value, 1),
        placeholder: pending,
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

  const strategyLabel = useCallback(
    (value: WithdrawalStrategy) => tControls(`fields.withdrawalStrategy.options.${value}.label`),
    [tControls]
  )

  const showRateSlider = strategy !== 'fixedReal'
  const showGuardrails = strategy === 'vanguardDynamic'
  const showRealFloor = strategy === 'percentOfPortfolio'

  // "How your rule behaves" follows the settings live, not the last run.
  const ruleEffect = tSpending(`explanation.strategies.${strategy}`, {
    withdrawalRate: formatPercent(params.dsWithdrawalRate, 2),
    ceiling: formatPercent(params.dsCeilingRate, 1),
    floor: formatPercent(params.dsFloorRate, 1),
  })

  // Stable, so the memoized chart does not redraw on every planner render.
  const corridorHeading = useMemo(
    () => (
      <div className="ws-withdrawal-heading">
        <h3 id="withdrawal-corridor-title" className="ws-withdrawal-h3">
          {t('corridor.title')}
        </h3>
        <InfoTip
          content={tSpending('explanation.reading')}
          label={tSpending('explanation.readingLabel')}
          side="bottom"
        />
      </div>
    ),
    [t, tSpending]
  )

  const retirementAge = Math.max(
    results?.params.currentAge ?? 0,
    results?.params.retirementAge ?? 0
  )

  return (
    <div ref={rootRef} className="ws-withdrawal" data-testid="withdrawal-planner">
      <div className="ws-withdrawal-grid">
        <div className="ws-withdrawal-cause">
          <div className="ws-withdrawal-step">
            <h3 id="withdrawal-choose-title" className="ws-withdrawal-h3">
              {t('steps.choose')}
            </h3>
            <div
              className="ws-withdrawal-options"
              role="group"
              aria-labelledby="withdrawal-choose-title"
              data-testid="withdrawal-strategy-picker"
            >
              {WITHDRAWAL_STRATEGIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="ws-withdrawal-option"
                  aria-pressed={strategy === option}
                  data-testid={`withdrawal-strategy-${option}`}
                  onClick={() => updateParams({ withdrawalStrategy: option })}
                >
                  <span className="ws-withdrawal-option-mark" aria-hidden="true" />
                  <span className="ws-withdrawal-option-text">
                    <span className="ws-withdrawal-option-label">{strategyLabel(option)}</span>
                    <span className="ws-withdrawal-option-description">
                      {tControls(`fields.withdrawalStrategy.options.${option}.description`)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="ws-withdrawal-step">
            <div className="ws-withdrawal-heading">
              <h3 className="ws-withdrawal-h3">{t('steps.tune')}</h3>
              <InfoTip
                label={t('steps.tune')}
                side="bottom"
                content={
                  <>
                    {showRateSlider && <p>{tControls('fields.dsWithdrawalRate.tooltip')}</p>}
                    <p className={showRateSlider ? 'mt-2' : undefined}>{t('tradeoff')}</p>
                  </>
                }
              />
            </div>

            {showRateSlider ? (
              <div className="ws-withdrawal-settings">
                <RuleSlider
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
                    <RuleSlider
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
                    <RuleSlider
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
                    helpPlacement="tooltip"
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
            ) : (
              <p className="ws-withdrawal-muted">{t('noParams')}</p>
            )}

            <div className="ws-withdrawal-effect" data-testid="withdrawal-rule-effect">
              <h4>{t('steps.effect')}</h4>
              <p>{ruleEffect}</p>
            </div>
          </div>
        </div>

        <div className="ws-withdrawal-outcome">
          <dl className="ws-withdrawal-stats" data-testid="withdrawal-planner-stats">
            {stats.map((item) => (
              <div key={item.key} data-testid={`withdrawal-stat-${item.key}`}>
                <dt>
                  {item.label}
                  {item.tip && <InfoTip content={item.tip} label={item.label} side="bottom" />}
                </dt>
                <dd className="ws-withdrawal-stat-value">
                  <AnimatedNumber
                    value={item.value}
                    format={item.format}
                    placeholder={item.placeholder}
                  />
                </dd>
                <dd className="ws-withdrawal-stat-hint">{item.hint}</dd>
              </div>
            ))}
          </dl>

          <section className="ws-withdrawal-card" aria-labelledby="withdrawal-corridor-title">
            <LazyMount
              minHeight="var(--ws-withdrawal-chart-reserve)"
              fallback={
                <div className="ws-withdrawal-chart">
                  {corridorHeading}
                  <Skeleton
                    variant="chart"
                    height="calc(var(--ws-withdrawal-chart-h) + 64px)"
                    className="ws-withdrawal-chart-placeholder"
                  />
                </div>
              }
            >
              {corridor ? (
                <SpendingCorridorChart
                  title={corridorHeading}
                  points={corridor.points}
                  retirementAge={retirementAge}
                  legalRetirementAge={results?.params.legalRetirementAge ?? 0}
                  hasFloor={corridor.paths.hasFloor}
                  hasCeiling={corridor.paths.hasCeiling}
                  formatCurrency={formatCurrency}
                  formatCurrencyShort={formatCurrencyShort}
                />
              ) : (
                <div className="ws-withdrawal-chart">
                  {corridorHeading}
                  <div className="ws-skeleton ws-withdrawal-chart-placeholder">
                    <span>{t('corridor.empty')}</span>
                  </div>
                </div>
              )}
            </LazyMount>
          </section>
        </div>
      </div>

      <StrategyCompare
        areaRef={rootRef}
        params={params}
        referenceAge={referenceAge}
        strategyLabel={strategyLabel}
        onApply={(next) => updateParams({ withdrawalStrategy: next })}
        formatPercent={formatPercent}
        formatRatio={formatRatio}
        formatCurrency={formatCurrency}
        formatCurrencyShort={formatCurrencyShort}
      />
    </div>
  )
}

interface RuleSliderProps {
  id: string
  label: string
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  step: number
  valueLabel: string
  minLabel: string
  maxLabel: string
}

/**
 * A rule parameter: label and live readout on one line, the slider, its
 * bounds. The id sits on the slider root (deep links and tests address
 * `#planner-… [role="slider"]`); the thumb is named by the visible label and
 * reads the formatted value.
 */
function RuleSlider({
  id,
  label,
  value,
  onValueChange,
  min,
  max,
  step,
  valueLabel,
  minLabel,
  maxLabel,
}: RuleSliderProps) {
  return (
    <div className="ws-withdrawal-slider">
      <div className="ws-withdrawal-slider-head">
        <label id={`${id}-label`} htmlFor={id}>
          {label}
        </label>
        <output htmlFor={id} aria-live="off" className="ws-withdrawal-readout">
          {valueLabel}
        </output>
      </div>
      <Slider
        id={id}
        value={[value]}
        onValueChange={([next]) => onValueChange(next)}
        min={min}
        max={max}
        step={step}
        aria-labelledby={`${id}-label`}
        aria-valuetext={valueLabel}
      />
      <div className="ws-withdrawal-slider-range" aria-hidden="true">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  )
}

type CompareStatus = 'idle' | 'running' | 'ready' | 'error'

interface StrategyCompareProps {
  areaRef: RefObject<HTMLDivElement | null>
  params: SimulationParams
  referenceAge: number
  strategyLabel: (strategy: WithdrawalStrategy) => string
  onApply: (strategy: WithdrawalStrategy) => void
  formatPercent: (value: number, maximumFractionDigits?: number) => string
  formatRatio: (value: number) => string
  formatCurrency: (value: number) => string
  formatCurrencyShort: (value: number) => string
}

/**
 * "Compare all four rules": the same plan under every strategy, over the same
 * market paths. On demand only, and polite about the shared worker: each of
 * the four runs waits until the section is near the viewport, no edit panel is
 * open and the plan's own result is current and settled, so the result bar is
 * never queued behind a comparison. A plan edited mid-way restarts the
 * comparison on the new plan instead of finishing one that would be stale.
 */
function StrategyCompare({
  areaRef,
  params,
  referenceAge,
  strategyLabel,
  onApply,
  formatPercent,
  formatRatio,
  formatCurrency,
  formatCurrencyShort,
}: StrategyCompareProps) {
  const t = useTranslations('withdrawalPlanner')
  const format = useFormatter()
  const results = useSimulationResults()
  const { editor } = useWorkspace()
  const { busy } = useRunStatus()
  const near = useNearViewport(areaRef, COMPARE_NEAR_MARGIN, { once: false })

  const [snapshots, setSnapshots] = useState<StrategySnapshot[]>([])
  const [comparedFingerprint, setComparedFingerprint] = useState<string | null>(null)
  const [comparedRuns, setComparedRuns] = useState(0)
  const [status, setStatus] = useState<CompareStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const runIdRef = useRef(0)

  const current = results !== null && areSimulationParamsEqual(params, results.params)
  const gateOpen = near && editor === null && !busy && current

  // The async loop reads the latest plan and gate through refs.
  const paramsRef = useRef(params)
  const gateRef = useRef<{ open: boolean; since: number | null }>({ open: false, since: null })
  useEffect(() => {
    paramsRef.current = params
  }, [params])
  useEffect(() => {
    const gate = gateRef.current
    if (gateOpen && gate.since === null) gate.since = performance.now()
    if (!gateOpen) gate.since = null
    gate.open = gateOpen
  }, [gateOpen])
  useEffect(
    () => () => {
      // Unmounting abandons a running comparison.
      runIdRef.current += 1
    },
    []
  )

  /** Resolves true once the worker is ours to use, false if this run was superseded. */
  const waitForGate = useCallback(
    (runId: number, startNow: boolean) =>
      new Promise<boolean>((resolve) => {
        let first = true
        const check = () => {
          if (runIdRef.current !== runId) return resolve(false)
          const { open, since } = gateRef.current
          const quietFor = since === null ? 0 : performance.now() - since
          if (open && ((startNow && first) || quietFor >= COMPARE_SETTLE_MS)) {
            setWaiting(false)
            return resolve(true)
          }
          first = false
          setWaiting(!open)
          window.setTimeout(check, GATE_POLL_MS)
        }
        check()
      }),
    []
  )

  const runComparison = async () => {
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setStatus('running')
    setProgress(0)
    setWaiting(false)

    try {
      const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
      let base = paramsRef.current
      let baseFingerprint = comparisonFingerprint(base)
      let next: StrategySnapshot[] = []
      let first = true

      while (next.length < WITHDRAWAL_STRATEGIES.length) {
        if (!(await waitForGate(runId, first))) return
        first = false
        const latest = paramsRef.current
        const latestFingerprint = comparisonFingerprint(latest)
        if (latestFingerprint !== baseFingerprint) {
          base = latest
          baseFingerprint = latestFingerprint
          next = []
          setProgress(0)
        }
        const strategy = WITHDRAWAL_STRATEGIES[next.length]
        const strategyResults = await runSimulationInClient({
          ...base,
          withdrawalStrategy: strategy,
          simulationRuns: Math.min(base.simulationRuns, STRATEGY_COMPARE_RUNS),
        })
        if (runIdRef.current !== runId) return
        next = [
          ...next,
          { strategy, ...summarizeStrategyOutcome(strategyResults.params, strategyResults) },
        ]
        setProgress(next.length)
      }

      setSnapshots(next)
      setComparedFingerprint(baseFingerprint)
      setComparedRuns(Math.min(base.simulationRuns, STRATEGY_COMPARE_RUNS))
      setStatus('ready')
    } catch (error) {
      console.error('Strategy comparison failed:', error)
      if (runIdRef.current !== runId) return
      setSnapshots([])
      setStatus('error')
    } finally {
      if (runIdRef.current === runId) setWaiting(false)
    }
  }

  const running = status === 'running'
  const fingerprint = useMemo(() => comparisonFingerprint(params), [params])
  const isStale = comparedFingerprint !== null && comparedFingerprint !== fingerprint
  const best = useMemo(() => bestStrategyValues(snapshots), [snapshots])
  const total = WITHDRAWAL_STRATEGIES.length

  const cells = (snapshot: StrategySnapshot) => [
    {
      key: 'success',
      value: formatPercent(snapshot.successRate / 100, 1),
      best: isBestValue(snapshot.successRate, best?.successRate),
    },
    {
      key: 'lifetimeSpending',
      value: formatCurrencyShort(Math.round(snapshot.medianLifetimeSpending)),
      best: isBestValue(snapshot.medianLifetimeSpending, best?.medianLifetimeSpending),
    },
    {
      key: 'floor',
      value:
        snapshot.guaranteedFloor && snapshot.guaranteedFloor > 0
          ? `${formatCurrency(Math.round(snapshot.guaranteedFloor))}${t('stats.unit')}`
          : t('compare.none'),
      best: isBestValue(snapshot.guaranteedFloor, best?.guaranteedFloor),
    },
    {
      key: 'volatility',
      value: snapshot.volatilityRatio ? formatRatio(snapshot.volatilityRatio) : t('compare.none'),
      best: isBestValue(snapshot.volatilityRatio, best?.volatilityRatio),
    },
  ]

  const bestTag = (show: boolean) =>
    show ? <span className="ws-withdrawal-best">{t('compare.best')}</span> : null

  const rowAction = (snapshot: StrategySnapshot, withTestId: boolean) =>
    snapshot.strategy === params.withdrawalStrategy ? (
      <span className="ws-withdrawal-active">{t('compare.active')}</span>
    ) : (
      <button
        type="button"
        className="ws-withdrawal-apply"
        onClick={() => onApply(snapshot.strategy)}
        data-testid={withTestId ? `strategy-compare-apply-${snapshot.strategy}` : undefined}
      >
        {t('compare.apply')}
      </button>
    )

  const statusText = running
    ? waiting
      ? t('compare.waiting')
      : `${t('compare.running')} ${t('compare.progress', { done: progress, total })}`
    : ''

  return (
    <div className="ws-withdrawal-compare">
      <div className="ws-withdrawal-compare-head">
        <div>
          <h3 className="ws-withdrawal-h3">{t('steps.compare')}</h3>
          <p className="ws-withdrawal-muted">{t('compare.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          className="ws-withdrawal-compare-run"
          onClick={() => void runComparison()}
          disabled={running}
          data-testid="strategy-compare-run"
        >
          {running
            ? t('compare.running')
            : snapshots.length > 0
              ? t('compare.rerun')
              : t('compare.run')}
        </Button>
      </div>

      <p className="ws-withdrawal-status" role="status" aria-live="polite">
        {statusText}
      </p>

      {status === 'error' && (
        <p className="ws-withdrawal-callout" data-tone="danger">
          {t('compare.error')}
        </p>
      )}

      {running && snapshots.length === 0 && (
        <div className="ws-withdrawal-compare-skeleton" aria-hidden="true">
          {WITHDRAWAL_STRATEGIES.map((key, index) => (
            <div key={key} className="ws-skeleton" data-done={index < progress || undefined} />
          ))}
        </div>
      )}

      {snapshots.length > 0 && (
        <>
          {isStale && !running && (
            <p
              className="ws-withdrawal-callout"
              data-tone="warn"
              data-testid="strategy-compare-stale"
            >
              {t('compare.stale')}
            </p>
          )}

          <div className="ws-withdrawal-compare-body" data-dim={isStale || running || undefined}>
            {/* Wide: one row per strategy. */}
            <div className="ws-withdrawal-table-frame">
              <table className="ws-withdrawal-compare-table" data-testid="strategy-compare-table">
                <thead>
                  <tr>
                    <th scope="col">{t('compare.columns.strategy')}</th>
                    {(['success', 'lifetimeSpending', 'floor', 'volatility'] as const).map(
                      (column) => (
                        <th key={column} scope="col" className="ws-withdrawal-num">
                          {t(`compare.columns.${column}`)}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((snapshot) => (
                    <tr
                      key={snapshot.strategy}
                      data-testid="strategy-compare-row"
                      data-strategy={snapshot.strategy}
                      data-active={snapshot.strategy === params.withdrawalStrategy || undefined}
                    >
                      <th scope="row">
                        <span className="ws-withdrawal-row-name">
                          {strategyLabel(snapshot.strategy)}
                        </span>
                        {rowAction(snapshot, true)}
                      </th>
                      {cells(snapshot).map((cell) => (
                        <td
                          key={cell.key}
                          className={cn('ws-withdrawal-num', cell.best && 'ws-withdrawal-strong')}
                          data-testid={`strategy-compare-${cell.key}`}
                        >
                          {cell.value}
                          {bestTag(cell.best)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Narrow: the same four numbers per strategy, nothing clipped. */}
            <ul className="ws-withdrawal-compare-list">
              {snapshots.map((snapshot) => (
                <li
                  key={snapshot.strategy}
                  data-testid="strategy-compare-card"
                  data-strategy={snapshot.strategy}
                  data-active={snapshot.strategy === params.withdrawalStrategy || undefined}
                >
                  <div className="ws-withdrawal-compare-list-head">
                    <span className="ws-withdrawal-row-name">
                      {strategyLabel(snapshot.strategy)}
                    </span>
                    {rowAction(snapshot, false)}
                  </div>
                  <dl>
                    {cells(snapshot).map((cell) => (
                      <div key={cell.key}>
                        <dt>{t(`compare.columns.${cell.key}`)}</dt>
                        <dd className={cn(cell.best && 'ws-withdrawal-strong')}>
                          {cell.value}
                          {bestTag(cell.best)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </div>

          <p className="ws-withdrawal-caption">
            {t('compare.runsNote', {
              runs: format.number(
                comparedRuns || Math.min(params.simulationRuns, STRATEGY_COMPARE_RUNS)
              ),
              age: referenceAge,
            })}
          </p>
        </>
      )}
    </div>
  )
}
