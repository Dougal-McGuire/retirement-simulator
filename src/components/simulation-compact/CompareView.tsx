'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { Plan, SimulationParams, SimulationResults } from '@/types'
import { MAX_COMPARISON_PLANS } from '@/types'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { comparisonFingerprint } from '@/lib/simulation/planDiff'
import { effectiveRunCount } from '@/lib/simulation/context'
import { planDisplayName } from '@/lib/plans/planName'
import {
  useActivePlanId,
  useDuplicatePlan,
  usePlans,
  useSimulationParams,
} from '@/lib/stores/simulationStore'
import { buildCompactKpis, type CompactKpis } from './metrics'
import { buildFanGeometry, FAN_H, FAN_W } from './fanGeometry'
import {
  formatAxisEuro,
  formatEuroDelta,
  formatMillionsEuro,
  formatPpDelta,
  formatThousandsEuro,
} from './format'

/** Hue per non-base plan — straight from the design's categorical scale. */
const ALT_COLORS = ['var(--viz-3)', 'var(--viz-5)'] as const

interface CompareViewProps {
  onExit: () => void
  /** Exit compare and land on the plan editor tab. */
  onOpenPlanEditor: () => void
}

interface PlanRun {
  plan: Plan
  params: SimulationParams
  results: SimulationResults
  kpis: CompactKpis
}

function deltaBadge(
  text: string,
  tone: 'ok' | 'warn' | 'danger' | 'neutral',
  key?: string | number
) {
  return (
    <span key={key} className={`ds-delta ds-delta--${tone}`}>
      {text}
    </span>
  )
}

/**
 * Design 1c: compare plans with overlaid fans, delta KPIs and a parameter
 * diff table. The base plan is the active plan's working copy (unsaved edits
 * included — what you see on the dashboard is what you compare against); the
 * other chips run their stored params.
 */
export function CompareView({ onExit, onOpenPlanEditor }: CompareViewProps) {
  const t = useTranslations('simulationCompact.compare')
  const tPlans = useTranslations('plans')
  const format = useFormatter()
  const locale = useLocale()

  const plans = usePlans()
  const activePlanId = useActivePlanId()
  const workingParams = useSimulationParams()
  const duplicatePlan = useDuplicatePlan()

  const paramsFor = useCallback(
    (plan: Plan): SimulationParams => (plan.id === activePlanId ? workingParams : plan.params),
    [activePlanId, workingParams]
  )

  // Base is always the active plan; the default challenger is the next plan.
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const next = plans.find((plan) => plan.id !== activePlanId)
    return next ? [activePlanId, next.id] : [activePlanId]
  })

  // Plans can be deleted while compare is open; the selection follows.
  useEffect(() => {
    setSelectedIds((current) => {
      const valid = current.filter((id) => plans.some((plan) => plan.id === id))
      const withBase = valid.includes(activePlanId) ? valid : [activePlanId, ...valid]
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

  const [runsById, setRunsById] = useState<Record<string, { fingerprint: string; results: SimulationResults }>>({})
  const [running, setRunning] = useState(false)
  const runIdRef = useRef(0)

  // Re-run whichever selected plan's params moved on. Sequential on purpose:
  // the worker is one thread anyway, and order keeps progress legible.
  useEffect(() => {
    const stale = selectedPlans.filter((plan) => {
      const entry = runsById[plan.id]
      return !entry || entry.fingerprint !== comparisonFingerprint(paramsFor(plan))
    })
    if (stale.length === 0) return

    const runId = ++runIdRef.current
    setRunning(true)
    const timer = setTimeout(async () => {
      try {
        const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
        for (const plan of stale) {
          const params = paramsFor(plan)
          const results = await runSimulationInClient(params)
          if (runIdRef.current !== runId) return
          setRunsById((current) => ({
            ...current,
            [plan.id]: { fingerprint: comparisonFingerprint(params), results },
          }))
        }
      } finally {
        if (runIdRef.current === runId) setRunning(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [selectedPlans, runsById, paramsFor])

  const ready: PlanRun[] = useMemo(
    () =>
      selectedPlans.flatMap((plan) => {
        const entry = runsById[plan.id]
        if (!entry || entry.fingerprint !== comparisonFingerprint(paramsFor(plan))) return []
        const params = paramsFor(plan)
        return [
          {
            plan,
            params,
            results: entry.results,
            kpis: buildCompactKpis(params, entry.results),
          },
        ]
      }),
    [selectedPlans, runsById, paramsFor]
  )

  const base = ready.find((run) => run.plan.id === activePlanId) ?? ready[0]
  const alts = ready.filter((run) => run !== base)
  const firstAlt = alts[0]

  const geometry = useMemo(() => {
    if (!base) return null
    return buildFanGeometry(
      base.results.ages,
      [base.results.assetPercentiles.p80, ...alts.map((alt) => alt.results.assetPercentiles.p80)]
    )
  }, [base, alts])

  const toggle = (id: string) => {
    if (id === activePlanId) return // the base plan cannot leave its own comparison
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
    // Nothing left to add: fork the base plan so there is a challenger to
    // edit. `duplicatePlan` activates the copy, so the copy becomes the new
    // base and the previous base stays selected as the comparison partner.
    const copyId = duplicatePlan(activePlanId)
    if (copyId) {
      setSelectedIds((current) =>
        current.length >= MAX_COMPARISON_PLANS ? current : [...current, copyId]
      )
    }
  }

  const runsLabel = base ? format.number(effectiveRunCount(base.params)) : null

  const percentValue = (rate: number) =>
    format.number(rate / 100, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: rate % 1 === 0 ? 0 : 1,
    })

  const lastsValue = (run: PlanRun) =>
    run.kpis.lastsToMedian == null
      ? `${format.number(run.params.endAge)}+`
      : format.number(run.kpis.lastsToMedian)

  const lastsAge = (run: PlanRun) => run.kpis.lastsToMedian ?? run.params.endAge

  // ── diff table rows ──────────────────────────────────────────
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
      rate: format.number(params.dsWithdrawalRate, {
        style: 'percent',
        maximumFractionDigits: 1,
      }),
    })

  const diffRows = useMemo(() => {
    if (ready.length === 0) return []
    const rows: Array<{ key: string; label: string; values: string[] }> = [
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
        label: t('rows.pension', {
          age: format.number(ready[0].params.legalRetirementAge),
        }),
        values: ready.map((run) => t('perMonth', { amount: euro(run.params.monthlyPension) })),
      },
    ]
    return rows
  }, [ready, t, format])

  return (
    <div data-testid="compare-view">
      {/* ── header ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          height: 40,
          padding: '0 14px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            background: 'var(--accent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            font: '600 9px var(--font-mono)',
            flex: 'none',
          }}
        >
          R
        </span>
        <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('title')}</span>
        <div style={{ width: 1, height: 22, background: 'var(--line)', flex: 'none' }} />
        {plans.map((plan) => {
          const selected = selectedIds.includes(plan.id)
          const isBase = plan.id === activePlanId
          // Alt hues follow the order among the *non-base* selected plans —
          // the base can sit anywhere in the selection (adding a duplicate
          // activates the copy, which re-bases mid-list).
          const altIndex = selectedIds.filter((id) => id !== activePlanId).indexOf(plan.id)
          const altColor =
            selected && !isBase && altIndex !== -1
              ? ALT_COLORS[altIndex % ALT_COLORS.length]
              : null
          return (
            <button
              key={plan.id}
              type="button"
              className="ds-chip"
              aria-pressed={selected}
              onClick={() => toggle(plan.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                ...(altColor ? { background: altColor, borderColor: altColor } : {}),
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: selected ? '#fff' : 'var(--gray-400)',
                  ...(isBase && selected ? { background: 'var(--viz-1)', outline: '1px solid #fff' } : {}),
                }}
              />
              {planDisplayName(plan, tPlans)}
            </button>
          )
        })}
        <button
          type="button"
          className="ds-btn ds-btn--ghost ds-btn--sm"
          style={{ whiteSpace: 'nowrap' }}
          onClick={addPlan}
          disabled={selectedIds.length >= MAX_COMPARISON_PLANS}
        >
          {t('addPlan', { max: MAX_COMPARISON_PLANS })}
        </button>
        <div style={{ flex: 1 }} />
        <span className="ds-meta" style={{ whiteSpace: 'nowrap' }}>
          {running || !runsLabel
            ? t('running')
            : t('meta', { count: ready.length, runs: runsLabel })}
        </span>
        <button type="button" className="ds-btn ds-btn--outline ds-btn--sm" onClick={onExit}>
          {t('exit')}
        </button>
      </header>

      {/* ── delta KPI strip ── */}
      {base && firstAlt && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4,1fr)',
            background: 'var(--surface)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          {(
            [
              {
                key: 'success',
                label: t('kpi.success'),
                baseValue: percentValue(base.kpis.successRate),
                altValue: percentValue(firstAlt.kpis.successRate),
                delta: firstAlt.kpis.successRate - base.kpis.successRate,
                text: (d: number) => formatPpDelta(d, locale),
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
                label: t('kpi.firstYearDraw'),
                baseValue: formatThousandsEuro(base.kpis.firstYearWithdrawal, locale),
                altValue: formatThousandsEuro(firstAlt.kpis.firstYearWithdrawal, locale),
                delta: firstAlt.kpis.firstYearWithdrawal - base.kpis.firstYearWithdrawal,
                text: (d: number) => formatEuroDelta(d, locale),
                toneNegative: 'warn' as const,
              },
              {
                key: 'end',
                label: t('kpi.medianEnd'),
                baseValue: formatMillionsEuro(base.kpis.medianEndWealth, locale),
                altValue: formatMillionsEuro(firstAlt.kpis.medianEndWealth, locale),
                delta: firstAlt.kpis.medianEndWealth - base.kpis.medianEndWealth,
                text: (d: number) => formatEuroDelta(d, locale),
                toneNegative: 'danger' as const,
              },
            ] as const
          ).map((cell, index, list) => (
            <div
              key={cell.key}
              style={{
                padding: '7px 14px',
                borderRight: index === list.length - 1 ? undefined : '1px solid var(--line)',
              }}
            >
              <p className="ds-micro">{cell.label}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cell.baseValue}
                </span>
                <span className="ds-meta">→</span>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    color: ALT_COLORS[0],
                    whiteSpace: 'nowrap',
                  }}
                >
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

      {/* ── chart + diff ── */}
      <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 10 }}>
        <div className="ds-card" style={{ padding: '10px 12px 6px' }}>
          <div style={{ position: 'relative', height: 266 }}>
            {base && geometry && (
              <>
                <svg
                  viewBox={`0 0 ${FAN_W} ${FAN_H}`}
                  preserveAspectRatio="none"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                  aria-hidden="true"
                >
                  {geometry.gridLines.map((grid) => (
                    <line
                      key={grid.value}
                      x1={0}
                      x2={FAN_W}
                      y1={grid.y}
                      y2={grid.y}
                      stroke="var(--gray-200)"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {alts.map((alt, index) =>
                    alt.params.retirementAge !== base.params.retirementAge ? (
                      <line
                        key={`marker-${alt.plan.id}`}
                        x1={geometry.ageX(alt.params.retirementAge)}
                        x2={geometry.ageX(alt.params.retirementAge)}
                        y1={0}
                        y2={FAN_H}
                        stroke={ALT_COLORS[index % ALT_COLORS.length]}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        opacity={0.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null
                  )}
                  <line
                    x1={geometry.ageX(base.params.retirementAge)}
                    x2={geometry.ageX(base.params.retirementAge)}
                    y1={0}
                    y2={FAN_H}
                    stroke="var(--gray-300)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <path
                    d={geometry.band(
                      base.results.assetPercentiles.p20,
                      base.results.assetPercentiles.p80
                    )}
                    fill="var(--viz-seq-2)"
                    opacity={0.8}
                  />
                  {alts.map((alt, index) => (
                    <path
                      key={`band-${alt.plan.id}`}
                      d={geometry.band(
                        alt.results.assetPercentiles.p20,
                        alt.results.assetPercentiles.p80
                      )}
                      fill={ALT_COLORS[index % ALT_COLORS.length]}
                      opacity={0.13}
                    />
                  ))}
                  <path
                    d={geometry.line(base.results.assetPercentiles.p50)}
                    fill="none"
                    stroke="var(--viz-1)"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                  {alts.map((alt, index) => (
                    <path
                      key={`median-${alt.plan.id}`}
                      d={geometry.line(alt.results.assetPercentiles.p50)}
                      fill="none"
                      stroke={ALT_COLORS[index % ALT_COLORS.length]}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
                {geometry.gridLines.map((grid) => (
                  <span
                    key={grid.value}
                    className="ds-meta"
                    style={{
                      position: 'absolute',
                      left: 4,
                      top: grid.topPct,
                      transform: 'translateY(-110%)',
                      background: 'rgba(255,255,255,.7)',
                      padding: '0 3px',
                      borderRadius: 2,
                    }}
                  >
                    {formatAxisEuro(grid.value, locale)}
                  </span>
                ))}
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 6,
                    display: 'flex',
                    gap: 10,
                    fontSize: 11,
                    color: 'var(--text-label)',
                    background: 'rgba(255,255,255,.85)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 12, height: 2, background: 'var(--viz-1)' }} />
                    {t('legendBase', { name: planDisplayName(base.plan, tPlans) })}
                  </span>
                  {alts.map((alt, index) => (
                    <span
                      key={alt.plan.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 0,
                          borderTop: `2px dashed ${ALT_COLORS[index % ALT_COLORS.length]}`,
                        }}
                      />
                      {planDisplayName(alt.plan, tPlans)}
                    </span>
                  ))}
                </div>
                {alts.map((alt, index) =>
                  alt.params.retirementAge !== base.params.retirementAge ? (
                    <span
                      key={`label-${alt.plan.id}`}
                      className="ds-meta"
                      style={{
                        position: 'absolute',
                        left: geometry.agePct(alt.params.retirementAge),
                        bottom: 4,
                        transform: 'translateX(-50%)',
                        color: ALT_COLORS[index % ALT_COLORS.length],
                      }}
                    >
                      {format.number(alt.params.retirementAge)}
                    </span>
                  ) : null
                )}
                <span
                  className="ds-meta"
                  style={{
                    position: 'absolute',
                    left: geometry.agePct(base.params.retirementAge),
                    bottom: 4,
                    transform: 'translateX(-50%)',
                  }}
                >
                  {format.number(base.params.retirementAge)}
                </span>
              </>
            )}
            {!base && (
              <span
                className="ds-meta"
                style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}
              >
                {t('running')}
              </span>
            )}
          </div>
          <div style={{ position: 'relative', height: 14, marginTop: 2 }}>
            {geometry?.axisTicks.map((tick) => (
              <span
                key={tick.age}
                className="ds-meta"
                style={{ position: 'absolute', left: tick.leftPct, transform: 'translateX(-50%)' }}
              >
                {format.number(tick.age)}
              </span>
            ))}
          </div>
        </div>

        {/* ── param diff ── */}
        <div className="ds-table-wrap" style={{ alignSelf: 'start' }}>
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
            </tbody>
          </table>
          <div
            style={{
              padding: '6px 12px',
              borderTop: '1px solid var(--line)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--gray-50)',
            }}
          >
            <span className="ds-meta">{t('changedRows')}</span>
            <button
              type="button"
              onClick={onOpenPlanEditor}
              style={{
                border: 0,
                background: 'none',
                padding: 0,
                font: 'inherit',
                fontSize: 'var(--fs-xs)',
                color: 'var(--link)',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              {t('openEditor')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
