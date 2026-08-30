'use client'

import { useMemo, useRef } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import type { CustomExpense } from '@/types'
import { Link } from '@/navigation'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import {
  useActivePlan,
  useActivePlanId,
  usePlanIsDirty,
  usePlans,
  useSavePlanDraft,
  useSetActivePlan,
  useSimulationParams,
  useUpdateParams,
} from '@/lib/stores/simulationStore'
import { useDisplayReal, useSetDisplayReal } from '@/lib/stores/displayStore'
import { planDisplayName } from '@/lib/plans/planName'
import { toast } from '@/components/ui/toast'
import { InlineSlider } from './InlineSlider'

interface CompactCommandBarProps {
  successRate: number | null
  isLoading: boolean
  advancedOpen: boolean
  onToggleAdvanced: () => void
  onRun: () => void
}

export function CompactCommandBar({
  successRate,
  isLoading,
  advancedOpen,
  onToggleAdvanced,
  onRun,
}: CompactCommandBarProps) {
  const t = useTranslations('simulationCompact.commandBar')
  const tPlans = useTranslations('plans')
  const tDisplay = useTranslations('simulation.display')
  const format = useFormatter()
  const params = useSimulationParams()
  const updateParams = useUpdateParams()
  const plans = usePlans()
  const activePlanId = useActivePlanId()
  const setActivePlan = useSetActivePlan()
  const activePlan = useActivePlan()
  const isDirty = usePlanIsDirty()
  const savePlanDraft = useSavePlanDraft()
  const displayReal = useDisplayReal()
  const setDisplayReal = useSetDisplayReal()

  const handleSave = () => {
    if (!isDirty) return
    savePlanDraft()
    toast.success(
      tPlans('dirty.savedToast', {
        name: activePlan ? planDisplayName(activePlan, tPlans) : '',
      })
    )
  }

  const switchPlan = (id: string) => {
    if (id === activePlanId) return
    if (isDirty && !window.confirm(t('unsavedSwitch'))) return
    setActivePlan(id)
  }

  const scaleBaseRef = useRef<{ source: CustomExpense[]; monthly: number } | null>(null)
  const emittedRef = useRef<CustomExpense[] | null>(null)

  const expenses = params.customExpenses ?? []
  if (scaleBaseRef.current && emittedRef.current !== expenses) {
    scaleBaseRef.current = null
  }

  const combined = useMemo(() => calculateCombinedExpenses(expenses), [expenses])
  const planCombined = useMemo(
    () => calculateCombinedExpenses(activePlan?.params.customExpenses ?? expenses),
    [activePlan, expenses]
  )

  const scaleExpenses = (targetMonthly: number) => {
    const base = scaleBaseRef.current ?? { source: expenses, monthly: combined.combinedMonthly }
    scaleBaseRef.current = base
    if (base.monthly <= 0) return

    const factor = targetMonthly / base.monthly
    const next = base.source.map((expense) => ({
      ...expense,
      amount: Math.max(0, Math.round(expense.amount * factor)),
    }))
    emittedRef.current = next
    updateParams({ customExpenses: next })
  }

  const formatCurrency = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })

  const retirementMin = Math.max(50, Math.min(params.currentAge + 1, 69))
  const retirementMax = Math.min(69, params.endAge - 1)
  const savingsMax = Math.max(
    100000,
    Math.ceil(((activePlan?.params.annualSavings ?? 0) * 2) / 1000) * 1000
  )
  const monthlyAnchor = Math.max(1000, Math.round(planCombined.combinedMonthly * 2))
  const monthlyNow = Math.round(combined.combinedMonthly)

  const successTone =
    successRate == null ? 'ok' : successRate >= 90 ? 'ok' : successRate >= 75 ? 'warn' : 'danger'
  const pillClass =
    successTone === 'ok'
      ? 'ds-pill'
      : successTone === 'warn'
        ? 'ds-pill ds-pill--warn'
        : 'ds-pill ds-pill--danger'

  return (
    <header
      data-testid="compact-command-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 52,
        padding: '4px 14px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--line)',
        overflowX: 'auto',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          background: 'var(--accent)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          font: '600 10px var(--font-mono)',
          flex: 'none',
        }}
      >
        R
      </span>
      <select
        className="ds-select"
        style={{ width: 136, minHeight: 36, flex: 'none', fontSize: 13 }}
        aria-label={t('planAria')}
        value={activePlanId}
        onChange={(event) => {
          const next = event.target.value
          if (next !== activePlanId) {
            switchPlan(next)
            event.target.value = activePlanId
          }
        }}
      >
        {plans.map((plan) => (
          <option key={plan.id} value={plan.id}>
            {planDisplayName(plan, tPlans)}
          </option>
        ))}
      </select>
      <div style={{ width: 1, height: 28, background: 'var(--line)', flex: 'none' }} />
      <InlineSlider
        width={158}
        label={t('age')}
        ariaLabel={t('ageAria')}
        value={params.retirementAge}
        min={retirementMin}
        max={Math.max(retirementMin, retirementMax)}
        step={1}
        formattedValue={format.number(params.retirementAge)}
        onChange={(value) => updateParams({ retirementAge: value })}
      />
      <InlineSlider
        width={184}
        label={t('save')}
        ariaLabel={t('saveAria')}
        value={params.annualSavings}
        min={0}
        max={savingsMax}
        step={1000}
        formattedValue={formatCurrency(params.annualSavings)}
        onChange={(value) => updateParams({ annualSavings: value })}
      />
      <InlineSlider
        width={178}
        label={t('spend')}
        ariaLabel={t('spendAria')}
        value={monthlyNow}
        min={Math.min(1000, monthlyAnchor)}
        max={monthlyAnchor}
        step={50}
        formattedValue={formatCurrency(monthlyNow)}
        valueText={t('spendValue', { amount: formatCurrency(monthlyNow) })}
        onChange={scaleExpenses}
      />
      <InlineSlider
        width={138}
        label={t('roi')}
        ariaLabel={t('roiAria')}
        value={params.averageROI}
        min={0}
        max={0.12}
        step={0.001}
        formattedValue={format.number(params.averageROI, {
          style: 'percent',
          maximumFractionDigits: 1,
        })}
        onChange={(value) => updateParams({ averageROI: value })}
      />
      <button
        type="button"
        className="ds-btn ds-btn--ghost ds-btn--sm"
        style={{ whiteSpace: 'nowrap', flex: 'none', minHeight: 36, fontSize: 13 }}
        aria-expanded={advancedOpen}
        onClick={onToggleAdvanced}
      >
        {t('advanced')}{' '}
        <span aria-hidden="true" style={{ color: 'var(--text-hint)' }}>
          {advancedOpen ? '▾' : '▸'}
        </span>
      </button>
      <div style={{ flex: 1 }} />
      <div
        role="radiogroup"
        aria-label={tDisplay('label')}
        title={tDisplay('realHint')}
        data-testid="display-toggle"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          flex: 'none',
          minHeight: 36,
        }}
      >
        {(
          [
            { key: 'nominal', label: tDisplay('nominal'), real: false },
            { key: 'real', label: tDisplay('real'), real: true },
          ] as const
        ).map((option) => {
          const selected = displayReal === option.real
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setDisplayReal(option.real)}
              style={{
                border: 0,
                font: 'inherit',
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1,
                padding: '8px 10px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: selected ? 'var(--accent)' : 'var(--surface)',
                color: selected ? '#fff' : 'var(--text-label)',
                transition: 'background-color .12s, color .12s',
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <Link
        href="/setup"
        className="ds-btn ds-btn--ghost ds-btn--sm"
        style={{ flex: 'none', minHeight: 36, fontSize: 13 }}
        data-testid="setup-link"
      >
        {t('setup')}
      </Link>
      {successRate != null && (
        <span className={pillClass} aria-label={t('successAria')} data-testid="success-pill">
          <span className="ds-pill-dot" />
          {format.number(successRate / 100, {
            style: 'percent',
            minimumFractionDigits: 0,
            maximumFractionDigits: successRate % 1 === 0 ? 0 : 1,
          })}
        </span>
      )}
      <button
        type="button"
        className="ds-btn ds-btn--outline ds-btn--sm"
        style={{ flex: 'none', minHeight: 36, fontSize: 13 }}
        onClick={handleSave}
        disabled={!isDirty}
        data-testid="command-save"
      >
        {t('saveButton')}
      </button>
      <button
        type="button"
        className="ds-btn ds-btn--default ds-btn--sm"
        style={{ flex: 'none', minHeight: 36, fontSize: 13 }}
        onClick={onRun}
        disabled={isLoading}
        data-testid="run-button"
      >
        {t('run')}{' '}
        <span
          className="ds-kbd"
          style={{
            background: 'rgba(255,255,255,.2)',
            borderColor: 'rgba(255,255,255,.4)',
            color: '#fff',
          }}
          aria-hidden="true"
        >
          R
        </span>
      </button>
    </header>
  )
}
