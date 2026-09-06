'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
import type { SimulationResults } from '@/types'
import type { CompactKpis } from '@/components/simulation-compact/metrics'
import type { PlanSectionGroup } from '@/components/plans/planSections'
import { FanChartCard } from '@/components/simulation-compact/FanChartCard'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'

export function Overview({
  results,
  kpis,
  displayReal,
  onEdit,
  onCashflow,
}: {
  results: SimulationResults
  kpis: CompactKpis
  displayReal: boolean
  onEdit: (section: PlanSectionGroup) => void
  onCashflow: () => void
}) {
  const t = useTranslations('workspace')
  const f = useFormatter()
  const p = results.params
  const euro = (value: number) =>
    f.number(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  const rate = f.number(results.successRate / 100, { style: 'percent', maximumFractionDigits: 1 })
  const budget = calculateCombinedExpenses(p.customExpenses).combinedMonthly
  const stats = [
    {
      label: t('lastsTo'),
      value: kpis.lastsToMedian === null ? `${p.endAge}+` : String(kpis.lastsToMedian),
      hint: t('badPaths', { age: kpis.lastsToP10 ?? `${p.endAge}+` }),
    },
    { label: t('firstDraw'), value: euro(kpis.firstYearWithdrawalMonthly), hint: t('grossMean') },
    {
      label: t('endAssets'),
      value: euro(kpis.medianEndWealth),
      hint: t('lowAssets', { amount: euro(kpis.p10EndWealth) }),
    },
  ]
  return (
    <div className="workspace-stack">
      <section aria-label={t('outcome')} data-testid="kpi-strip">
        <dl className="workspace-result-grid">
          <div>
            <dt>{t('outcome')}</dt>
            <dd data-testid="success-pill">{rate}</dd>
            <p>{t('successfulPaths')}</p>
          </div>
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
              <p>{stat.hint}</p>
            </div>
          ))}
        </dl>
        <p className="workspace-result-note">{t('outcomeExplain', { end: p.endAge })}</p>
      </section>
      <section className="workspace-life-stages">
        <div>
          <span>{t('today')}</span>
          <strong>{t('ageValue', { age: p.currentAge })}</strong>
        </div>
        <div>
          <span>{t('retirement')}</span>
          <strong>{t('ageValue', { age: p.retirementAge })}</strong>
        </div>
        <button onClick={() => onEdit('cashFlows')}>
          <span>{t('firstPension')}</span>
          <strong>
            {p.cashFlows.some((flow) => flow.kind === 'pension' && flow.amount > 0)
              ? t('ageValue', { age: kpis.firstPensionAge })
              : t('noPension')}
          </strong>
        </button>
        <div>
          <span>{t('horizon')}</span>
          <strong>{t('ageValue', { age: p.endAge })}</strong>
        </div>
      </section>
      <section className="workspace-panel">
        <div className="workspace-section-heading">
          <div>
            <h2>{t('assetTitle')}</h2>
            <p>{t('assetDescription')}</p>
          </div>
        </div>
        <FanChartCard results={results} displayReal={displayReal} height={330} />
      </section>
      <section className="workspace-panel">
        <div className="workspace-section-heading">
          <div>
            <h2>{t('planSnapshot')}</h2>
            <p>{t('snapshotHint')}</p>
          </div>
          <button className="workspace-text-button" onClick={onCashflow}>
            {t('followMoney')}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="workspace-assumptions">
          {[
            {
              label: t('retirement'),
              value: t('ageValue', { age: p.retirementAge }),
              hint: t('timelineHint', { current: p.currentAge, end: p.endAge }),
              section: 'personal',
            },
            {
              label: t('startingAssets'),
              value: euro(p.currentAssets),
              hint: t('savingsHint', { amount: euro(p.annualSavings) }),
              section: 'income',
            },
            {
              label: t('plannedBudget'),
              value: euro(budget),
              hint: t('budgetHint'),
              section: 'cashFlows',
            },
          ].map((item) => (
            <button key={item.section} onClick={() => onEdit(item.section as PlanSectionGroup)}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.hint}</small>
              <span className="workspace-edit-link">
                {t('edit')} <ArrowRight size={14} aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
