'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { SimulationParams, SimulationResults } from '@/types'
import { comparisonFingerprint } from '@/lib/simulation/planDiff'
import { buildScenarioParams } from '@/lib/simulation/planInsights'
import { useUpdateParams } from '@/lib/stores/simulationStore'
import type { CompactKpis } from './metrics'
import { formatPpDelta } from './format'

interface RecChip {
  id: string
  label: string
  apply: Partial<SimulationParams>
}

interface BottomStripProps {
  params: SimulationParams
  results: SimulationResults
  kpis: CompactKpis
  onOpenFullEditor: () => void
}

/**
 * Design 1b's bottom strip: the pension-bridge mini bar on the left, then the
 * top recommendations as one-click chips, each labelled with its measured
 * success-rate delta. Clicking a chip applies the lever to the working copy —
 * as reversible as any other edit.
 */
export function BottomStrip({ params, results, kpis, onOpenFullEditor }: BottomStripProps) {
  const t = useTranslations('simulationCompact.bottom')
  const format = useFormatter()
  const locale = useLocale()
  const updateParams = useUpdateParams()

  const [recs, setRecs] = useState<Array<RecChip & { delta: number }>>([])
  const runIdRef = useRef(0)

  const fingerprint = useMemo(() => comparisonFingerprint(results.params), [results.params])

  /** The levers the strip measures, built against the params the shown results used. */
  const chips = useMemo<RecChip[]>(() => {
    const base = results.params
    const scenarios = buildScenarioParams(base)
    const later = scenarios.find((entry) => entry.id === 'laterRetirement')
    const lower = scenarios.find((entry) => entry.id === 'lowerSpending')

    const list: RecChip[] = []
    if (later && later.params.retirementAge !== base.retirementAge) {
      list.push({
        id: 'laterRetirement',
        label: t('recRetire', { age: format.number(later.params.retirementAge) }),
        apply: { retirementAge: later.params.retirementAge },
      })
    }
    if (lower) {
      list.push({
        id: 'lowerSpending',
        label: t('recSpend'),
        apply: { customExpenses: lower.params.customExpenses, cashFlows: lower.params.cashFlows },
      })
    }
    if (!base.glidePathEnabled) {
      list.push({
        id: 'glidePath',
        label: t('recGlide', {
          start: format.number(base.equityAllocationStart, {
            style: 'percent',
            maximumFractionDigits: 0,
          }),
          end: format.number(base.equityAllocationEnd, {
            style: 'percent',
            maximumFractionDigits: 0,
          }),
        }),
        apply: { glidePathEnabled: true },
      })
    }
    return list
  }, [fingerprint, t, format])

  // Measure each lever against the currently shown baseline. Debounced so
  // slider scrubbing (which re-runs the main simulation every ~100 ms) doesn't
  // queue three extra runs per step; only the settled state is measured.
  useEffect(() => {
    const runId = ++runIdRef.current
    setRecs([])
    if (chips.length === 0) return

    const timer = setTimeout(async () => {
      try {
        const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
        const base = results.params
        const measured: Array<RecChip & { delta: number }> = []
        for (const chip of chips) {
          const scenarioResults = await runSimulationInClient({ ...base, ...chip.apply })
          if (runIdRef.current !== runId) return
          measured.push({ ...chip, delta: scenarioResults.successRate - results.successRate })
        }
        measured.sort((a, b) => b.delta - a.delta)
        setRecs(measured)
      } catch {
        // Recommendations are an extra; a failed measurement just hides them.
      }
    }, 600)

    return () => clearTimeout(timer)
  }, [chips])

  const span = Math.max(1, params.endAge - params.currentAge)
  const savingPct = (Math.max(0, params.retirementAge - params.currentAge) / span) * 100
  const bridgePct = (Math.max(0, kpis.firstPensionAge - params.retirementAge) / span) * 100

  const pensionMonthly = format.number(params.monthlyPension, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

  return (
    <div
      data-testid="bottom-strip"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface)',
        padding: '6px 12px',
        fontSize: 'var(--fs-xs)',
      }}
    >
      <span className="ds-micro">{t('bridge')}</span>
      <div
        style={{ display: 'flex', height: 12, width: 220, borderRadius: 2, overflow: 'hidden', flex: 'none' }}
        aria-hidden="true"
      >
        <div style={{ width: `${savingPct.toFixed(1)}%`, background: 'var(--gray-200)' }} />
        <div style={{ width: `${bridgePct.toFixed(1)}%`, background: 'var(--viz-seq-3)' }} />
        <div style={{ flex: 1, background: 'var(--viz-seq-1)' }} />
      </div>
      <span className="ds-meta">
        {kpis.bridgeYears > 0
          ? t('bridgeMeta', {
              years: format.number(kpis.bridgeYears),
              from: format.number(params.retirementAge),
              to: format.number(kpis.firstPensionAge),
              pension: pensionMonthly,
            })
          : t('bridgeMetaImmediate', { pension: pensionMonthly })}
      </span>
      <div style={{ width: 1, height: 18, background: 'var(--line)', flex: 'none' }} />
      <span className="ds-micro">{t('recs')}</span>
      {recs.length === 0 ? (
        <span className="ds-meta">{t('recsPending')}</span>
      ) : (
        recs.map((rec) => (
          <button
            key={rec.id}
            type="button"
            className="ds-chip"
            title={t('recApply')}
            onClick={() => updateParams(rec.apply)}
          >
            {rec.label} · {formatPpDelta(rec.delta, locale)}
          </button>
        ))
      )}
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={onOpenFullEditor}
        style={{
          border: 0,
          background: 'none',
          padding: 0,
          font: 'inherit',
          fontSize: 'var(--fs-xs)',
          color: 'var(--link)',
          textDecoration: 'underline',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {t('editFullPlan')}
      </button>
    </div>
  )
}
