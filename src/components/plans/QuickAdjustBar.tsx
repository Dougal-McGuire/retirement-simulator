'use client'

import { useMemo, useRef } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { SlidersHorizontal } from 'lucide-react'
import type { CustomExpense } from '@/types'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { WizardSliderField } from '@/components/forms/fields/WizardSliderField'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { useActivePlan, useSimulationParams, useUpdateParams } from '@/lib/stores/simulationStore'
import { cn } from '@/lib/utils'

interface QuickAdjustBarProps {
  /** Opens the full plan editor (the simulation page owns tab state). */
  onOpenEditor?: () => void
  className?: string
}

/**
 * The three or four levers people actually scrub, kept one glance away from the
 * charts. Every change goes through the same working copy as the full editor,
 * so quick what-ifs are as reversible as any other edit.
 */
export function QuickAdjustBar({ onOpenEditor, className }: QuickAdjustBarProps) {
  const t = useTranslations('quickAdjust')
  const tControls = useTranslations('parameterControls')
  const format = useFormatter()
  const params = useSimulationParams()
  const updateParams = useUpdateParams()
  const activePlan = useActivePlan()

  // Scaling expenses needs a stable starting point, otherwise every drag step
  // compounds its own rounding. The snapshot resets as soon as the expense list
  // changes from anywhere else (editor, plan switch, revert).
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

  const formatCurrency = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  const formatPercent = (value: number) =>
    format.number(value, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 1 })
  const formatInteger = (value: number) =>
    format.number(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  const retirementMin = Math.max(50, Math.min(params.currentAge + 1, 69))
  const savingsMax = Math.max(
    100000,
    Math.ceil(((activePlan?.params.annualSavings ?? 0) * 2) / 1000) * 1000
  )
  const monthlyAnchor = Math.max(1000, Math.round(planCombined.combinedMonthly * 2))
  const monthlyNow = Math.round(combined.combinedMonthly)
  /** How many items the lever actually touches — the lifetime expenses only. */
  const scaledCount = expenses.length
  const windowedCount = (params.cashFlows ?? []).length - scaledCount

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

  return (
    <section
      data-testid="quick-adjust"
      className={cn('border-3 border-neo-black bg-neo-white px-5 py-4 shadow-neo', className)}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-neo-blue" aria-hidden="true" />
          <h2 className="text-[0.78rem] font-black uppercase tracking-[0.2em] text-neo-black">
            {t('title')}
          </h2>
          <InfoTip content={t('description')} label={t('title')} side="bottom" />
        </div>
        {onOpenEditor && (
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            data-testid="quick-adjust-open-editor"
            onClick={onOpenEditor}
          >
            {t('openEditor')}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
        <WizardSliderField
          id="quick-retirementAge"
          label={t('fields.retirementAge')}
          value={params.retirementAge}
          onValueChange={(value) => updateParams({ retirementAge: value })}
          min={retirementMin}
          max={70}
          step={1}
          valueLabel={formatInteger(params.retirementAge)}
          minLabel={formatInteger(retirementMin)}
          maxLabel={formatInteger(70)}
        />
        <WizardSliderField
          id="quick-annualSavings"
          label={t('fields.annualSavings')}
          value={Math.min(params.annualSavings, savingsMax)}
          onValueChange={(value) => updateParams({ annualSavings: value })}
          min={0}
          max={savingsMax}
          step={1000}
          valueLabel={formatCurrency(params.annualSavings)}
          minLabel={formatCurrency(0)}
          maxLabel={formatCurrency(savingsMax)}
        />
        <WizardSliderField
          id="quick-monthlyExpenses"
          label={t('fields.monthlyExpenses')}
          value={Math.min(monthlyNow, monthlyAnchor)}
          onValueChange={scaleExpenses}
          min={0}
          max={monthlyAnchor}
          step={50}
          valueLabel={formatCurrency(monthlyNow)}
          minLabel={formatCurrency(0)}
          maxLabel={formatCurrency(monthlyAnchor)}
          // The lever writes `customExpenses`, which is the *lifetime* expense
          // projection: a flow with an age window (care costs at 80–90, a roof
          // in one year) is not in it and does not move. Saying "every expense
          // in this plan" was simply wrong, and the caption now names both the
          // number of items it does scale and their total.
          helpText={
            windowedCount > 0
              ? t('expensesHintScheduled', {
                  count: scaledCount,
                  total: formatCurrency(monthlyNow),
                  scheduled: windowedCount,
                })
              : t('expensesHint', { count: scaledCount, total: formatCurrency(monthlyNow) })
          }
        />
        <WizardSliderField
          id="quick-averageROI"
          label={t('fields.averageROI')}
          value={params.averageROI * 100}
          onValueChange={(value) => updateParams({ averageROI: value / 100 })}
          min={3}
          max={12}
          step={0.25}
          valueLabel={formatPercent(params.averageROI)}
          minLabel={formatPercent(0.03)}
          maxLabel={formatPercent(0.12)}
          // The historical model takes its returns from the record, so this
          // lever would move a number the simulation never reads.
          disabled={params.marketModel === 'historical'}
          helpText={
            params.marketModel === 'historical'
              ? tControls('fields.marketModel.leverIgnored')
              : undefined
          }
          helpPlacement="inline"
        />
      </div>
    </section>
  )
}
