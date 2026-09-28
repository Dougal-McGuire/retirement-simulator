'use client'

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ArrowLeftRight, ArrowRight, CopyPlus, Info, SlidersHorizontal } from 'lucide-react'
import { MAX_PLANS, type SimulationResults } from '@/types'
import type { CompactKpis } from '@/components/simulation-compact/metrics'
import type { PlanSectionGroup } from '@/components/plans/planSections'
import { FanChartCard } from '@/components/simulation-compact/FanChartCard'
import { CompactCommandBar } from '@/components/simulation-compact/CompactCommandBar'
import { AdvancedParamsPanel } from '@/components/simulation-compact/AdvancedParamsPanel'
import { toast } from '@/components/ui/toast'
import { PlanNameDialog } from '@/components/plans/PlanNameDialog'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { planDisplayName } from '@/lib/plans/planName'
import {
  useActivePlanId,
  useDuplicatePlan,
  usePlanIsDirty,
  usePlans,
} from '@/lib/stores/simulationStore'
import { useSetComparisonSelection } from '@/lib/stores/comparisonStore'
import { suggestDuplicateName } from '@/lib/stores/plans'
import './overview.css'

/**
 * The collapsed "What if …?" strip. Its sliders write to the same working copy
 * as the plan editor, which is why the header flips to "Unsaved changes" — so
 * the strip says so itself and carries a draft marker while that copy differs
 * from the saved plan. Saving and discarding stay in the header (one path,
 * one undo); the strip's hint points there.
 */
export function WhatIfStrip({
  results,
  loading,
  onRun,
  onEdit,
}: {
  results: SimulationResults | null
  loading: boolean
  onRun: () => void
  onEdit: (section: PlanSectionGroup) => void
}) {
  const t = useTranslations('workspace')
  const [advanced, setAdvanced] = useState(false)
  const dirty = usePlanIsDirty()
  return (
    <details
      className="workspace-experiment workspace-whatif"
      data-testid="whatif-strip"
      data-dirty={dirty || undefined}
    >
      <summary>
        <SlidersHorizontal size={20} aria-hidden="true" />
        <div>
          <strong>{t('experiment')}</strong>
          {dirty && (
            <em
              className="workspace-draft-marker"
              data-testid="whatif-draft"
              title={t('whatIf.draftAria')}
            >
              {t('whatIf.draft')}
            </em>
          )}
          <span>{t('experimentHint')}</span>
        </div>
      </summary>
      <div className="workspace-whatif-note" data-testid="whatif-note">
        <Info size={16} aria-hidden="true" />
        {/* Save and Discard live once, in the header next to the unsaved
            marker (with undo for Discard); the strip only points there. */}
        <p>
          {t('whatIf.note')}
          {dirty && <> {t('whatIf.pending')}</>}
        </p>
      </div>
      <CompactCommandBar
        quickOnly
        results={results}
        successRate={results?.successRate ?? null}
        isLoading={loading}
        advancedOpen={advanced}
        onToggleAdvanced={() => setAdvanced((v) => !v)}
        onRun={onRun}
      />
      {advanced && <AdvancedParamsPanel onOpenFullEditor={() => onEdit('market')} />}
    </details>
  )
}

/**
 * Entry into plan comparison from the overview. With two or more plans it
 * lines up the active plan against the most recently updated other one; with
 * a single plan it offers to duplicate it, which is what makes a comparison
 * possible in the first place.
 */
function CompareEntry({ onCompare }: { onCompare: () => void }) {
  const t = useTranslations('workspace.compareEntry')
  const tPlans = useTranslations('plans')
  const plans = usePlans()
  const activeId = useActivePlanId()
  const duplicate = useDuplicatePlan()
  const setSelection = useSetComparisonSelection()
  const [naming, setNaming] = useState(false)
  const active = plans.find((plan) => plan.id === activeId)
  const other = plans
    .filter((plan) => plan.id !== activeId)
    .reduce<
      (typeof plans)[number] | null
    >((latest, plan) => (!latest || plan.updatedAt > latest.updatedAt ? plan : latest), null)

  if (active && other) {
    return (
      <button
        type="button"
        className="workspace-compare-entry"
        data-testid="overview-compare"
        onClick={() => {
          setSelection([active.id, other.id])
          onCompare()
        }}
      >
        <ArrowLeftRight size={18} aria-hidden="true" />
        <span>
          <strong>{t('title')}</strong>
          <small>
            {t('detail', {
              active: planDisplayName(active, tPlans),
              other: planDisplayName(other, tPlans),
            })}
          </small>
        </span>
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    )
  }
  if (!active || plans.length >= MAX_PLANS) return null
  const activeName = planDisplayName(active, tPlans)
  return (
    <>
      <button
        type="button"
        className="workspace-compare-entry workspace-compare-entry-quiet"
        data-testid="overview-duplicate"
        onClick={() => setNaming(true)}
      >
        <CopyPlus size={18} aria-hidden="true" />
        <span>
          <strong>{t('duplicateTitle')}</strong>
          <small>{t('duplicateDetail')}</small>
        </span>
      </button>
      {/* Same naming step as "Duplicate" everywhere else: the copy's name is
          what the comparison legend and the PDF will show. */}
      <PlanNameDialog
        open={naming}
        onOpenChange={setNaming}
        inputId="overview-duplicate-name"
        initialName={suggestDuplicateName(
          activeName,
          plans.map((plan) => planDisplayName(plan, tPlans))
        )}
        title={tPlans('dialogs.duplicate.title')}
        description={tPlans('dialogs.duplicate.description', { name: activeName })}
        label={tPlans('dialogs.duplicate.label')}
        placeholder={tPlans('dialogs.duplicate.placeholder')}
        confirmLabel={tPlans('actions.confirmDuplicate')}
        onConfirm={(name) => {
          if (duplicate(active.id, name)) toast.success(tPlans('duplicated.toast', { name }))
        }}
      />
    </>
  )
}

export function Overview({
  results,
  kpis,
  displayReal,
  onEdit,
  onCashflow,
  onCompare,
}: {
  results: SimulationResults
  kpis: CompactKpis
  displayReal: boolean
  onEdit: (section: PlanSectionGroup) => void
  onCashflow: () => void
  onCompare: () => void
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
      <CompareEntry onCompare={onCompare} />
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
