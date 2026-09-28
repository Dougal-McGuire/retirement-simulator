'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { CashFlowList } from '@/components/forms/fields/CashFlowList'
import { buildCashFlowTemplates } from '@/components/forms/fields/cashFlowTemplates'
import type { CashFlow } from '@/types'
import {
  hasLifetimeExpenseShape,
  isCashFlowEnabled,
  pensionMonthlyAtAge,
} from '@/lib/simulation/cashFlows'
import { calculateCombinedExpenses, taxContext } from '@/lib/simulation/engine'
import { useSimulationParams, useUpdateParams } from '@/lib/stores/simulationStore'
import { PanelGroupBody, useEditorFormat } from './shared'

/** Panel `flows`: Einnahmen & Ausgaben. */
export function FlowsGroup() {
  const t = useTranslations('planEditor')
  const tSetup = useTranslations('setup')
  const params = useSimulationParams()
  const updateParams = useUpdateParams()
  const { formatCurrency } = useEditorFormat()

  const expenses = params.customExpenses ?? []
  const combined = useMemo(() => calculateCombinedExpenses(expenses), [expenses])
  const cashFlows = params.cashFlows ?? []
  // Every figure counts switched-on flows only; what is switched off is named
  // next to the figure it would otherwise be part of.
  const pensionFlowCount = cashFlows.filter(
    (flow) => flow.kind === 'pension' && isCashFlowEnabled(flow)
  ).length
  const offCount = (matches: (flow: CashFlow) => boolean) =>
    cashFlows.filter((flow) => !isCashFlowEnabled(flow) && matches(flow)).length
  const withOff = (hint: string, count: number) =>
    count > 0 ? `${hint} · ${t('summary.switchedOff', { count })}` : hint
  const monthlyOff = offCount(
    (flow) => hasLifetimeExpenseShape(flow) && flow.frequency === 'monthly'
  )
  const annualOff = offCount((flow) => hasLifetimeExpenseShape(flow) && flow.frequency === 'annual')
  const pensionsOff = offCount((flow) => flow.kind === 'pension')
  // Every pension paying out at the statutory age, gross.
  const pensionGrossMonthly = pensionMonthlyAtAge(
    cashFlows,
    params.legalRetirementAge,
    params.legalRetirementAge
  ).total

  const cashFlowTemplates = useMemo(
    () =>
      buildCashFlowTemplates((key) => tSetup(`cashFlows.templates.items.${key}`), {
        currentAge: params.currentAge,
        retirementAge: params.retirementAge,
        legalRetirementAge: params.legalRetirementAge,
        endAge: params.endAge,
      }),
    [tSetup, params.currentAge, params.retirementAge, params.legalRetirementAge, params.endAge]
  )

  return (
    <PanelGroupBody
      id="plan-editor-expenses"
      stats={[
        {
          label: t('summary.monthlyTotal'),
          value: formatCurrency(combined.totalMonthly),
          hint: withOff(
            t('summary.expenseCount', {
              count: expenses.filter((entry) => entry.interval === 'monthly').length,
            }),
            monthlyOff
          ),
        },
        {
          label: t('summary.annualExtras'),
          value: formatCurrency(combined.totalAnnual),
          hint: withOff(
            t('summary.expenseCount', {
              count: expenses.filter((entry) => entry.interval === 'annual').length,
            }),
            annualOff
          ),
        },
        {
          label: t('summary.pensions', { age: params.legalRetirementAge }),
          value: formatCurrency(pensionGrossMonthly),
          hint: withOff(t('summary.pensionsHint', { count: pensionFlowCount }), pensionsOff),
        },
      ]}
    >
      <CashFlowList
        compact
        flows={cashFlows}
        currentAge={params.currentAge}
        retirementAge={params.retirementAge}
        legalRetirementAge={params.legalRetirementAge}
        endAge={params.endAge}
        tax={taxContext(params)}
        templates={cashFlowTemplates}
        onChange={(next) => updateParams({ cashFlows: next })}
      />
    </PanelGroupBody>
  )
}
