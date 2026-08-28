'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { CompactKpis } from './metrics'
import { sparklinePath } from './fanGeometry'
import { formatEuro, formatMillionsEuro, formatMillionsShort, formatPpDelta } from './format'

const HISTORY_CAP = 40

interface KpiStripProps {
  kpis: CompactKpis
  /** Age the plan ends at; "lasts to" renders `${endAge}+` when never depleted. */
  endAge: number
  /** Bumps once per completed simulation run — the sparklines append on it. */
  resultsComputedAt: number | null
}

interface KpiCellProps {
  value: string
  label: string
  sub: React.ReactNode
  spark: number[]
  last?: boolean
}

function KpiCell({ value, label, sub, spark, last }: KpiCellProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 14px',
        borderRight: last ? undefined : '1px solid var(--line)',
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 18,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="ds-micro" style={{ letterSpacing: '.03em' }}>
          {label}
        </span>
        <span className="ds-meta" style={{ whiteSpace: 'nowrap' }}>
          {sub}
        </span>
      </div>
      <svg width={52} height={20} viewBox="0 0 60 22" aria-hidden="true" style={{ marginLeft: 'auto', flex: 'none' }}>
        <path d={sparklinePath(spark)} fill="none" stroke="var(--viz-1)" strokeWidth={1.5} />
      </svg>
    </div>
  )
}

/**
 * Design 1b's inline KPI strip: success, wealth-lasts-to, first-year
 * withdrawal, median end wealth — each with a sparkline of its own recent
 * history, so scrubbing a slider leaves a visible trace of where the plan
 * has been this session.
 */
export function KpiStrip({ kpis, endAge, resultsComputedAt }: KpiStripProps) {
  const t = useTranslations('simulationCompact.kpi')
  const format = useFormatter()
  const locale = useLocale()

  // Session-local history per metric. Appended once per completed run;
  // deliberately not persisted — the traces describe this editing session.
  const [history, setHistory] = useState<{
    success: number[]
    lasts: number[]
    draw: number[]
    end: number[]
  }>({ success: [], lasts: [], draw: [], end: [] })
  const lastStampRef = useRef<number | null>(null)

  useEffect(() => {
    if (resultsComputedAt == null || resultsComputedAt === lastStampRef.current) return
    lastStampRef.current = resultsComputedAt
    setHistory((prev) => ({
      success: [...prev.success, kpis.successRate].slice(-HISTORY_CAP),
      lasts: [...prev.lasts, kpis.lastsToMedian ?? endAge].slice(-HISTORY_CAP),
      draw: [...prev.draw, kpis.firstYearWithdrawal].slice(-HISTORY_CAP),
      end: [...prev.end, kpis.medianEndWealth].slice(-HISTORY_CAP),
    }))
  }, [resultsComputedAt, kpis, endAge])

  const previousSuccess =
    history.success.length >= 2 ? history.success[history.success.length - 2] : null
  const successDelta = previousSuccess == null ? null : kpis.successRate - previousSuccess

  const successValue = format.number(kpis.successRate / 100, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: kpis.successRate % 1 === 0 ? 0 : 1,
  })
  const lastsValue = kpis.lastsToMedian == null ? `${format.number(endAge)}+` : format.number(kpis.lastsToMedian)
  const lastsSub =
    kpis.lastsToP10 == null
      ? t('p10Age', { age: `${format.number(endAge)}+` })
      : t('p10Age', { age: format.number(kpis.lastsToP10) })

  return (
    <div
      data-testid="kpi-strip"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4,1fr)',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <KpiCell
        value={successValue}
        label={t('success')}
        sub={
          successDelta == null ? (
            <span style={{ color: 'var(--text-hint)' }}>—</span>
          ) : (
            <span
              style={{
                color:
                  successDelta > 0.05
                    ? 'var(--ok)'
                    : successDelta < -0.05
                      ? 'var(--danger)'
                      : 'var(--text-label)',
              }}
            >
              {formatPpDelta(successDelta, locale)}
            </span>
          )
        }
        spark={history.success}
      />
      <KpiCell
        value={lastsValue}
        label={t('lastsTo')}
        sub={lastsSub}
        spark={history.lasts}
      />
      <KpiCell
        value={formatEuro(kpis.firstYearWithdrawal, locale)}
        label={t('firstYearDraw')}
        sub={t('perMonth', { amount: formatEuro(kpis.firstYearWithdrawalMonthly, locale) })}
        spark={history.draw}
      />
      <KpiCell
        value={formatMillionsEuro(kpis.medianEndWealth, locale)}
        label={t('medianEnd')}
        sub={t('p10End', { value: formatMillionsShort(kpis.p10EndWealth, locale) })}
        spark={history.end}
        last
      />
    </div>
  )
}
