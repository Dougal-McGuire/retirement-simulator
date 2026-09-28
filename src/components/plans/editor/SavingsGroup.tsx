'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
import { LabeledNumberInput } from '@/components/forms/fields/LabeledNumberInput'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { useSimulationParams, useUpdateParams } from '@/lib/stores/simulationStore'
import { useWorkspace } from '@/components/workspace/WorkspaceProvider'
import { PanelGroupBody, useEditorFormat, useInvalidFields } from './shared'

/** Panel `savings`: Vermögen & Sparen. */
export function SavingsGroup() {
  const t = useTranslations('planEditor')
  const tSetup = useTranslations('setup')
  const tWorkspace = useTranslations('workspace.editPanel')
  const params = useSimulationParams()
  const updateParams = useUpdateParams()
  const { openEditor } = useWorkspace()
  const { markInvalid } = useInvalidFields()
  const { formatCurrency, formatPercent, numberRange, atLeast, notANumber } = useEditorFormat()

  const expenses = params.customExpenses ?? []
  const combined = useMemo(() => calculateCombinedExpenses(expenses), [expenses])
  const savingsBase = params.annualSavings + combined.combinedAnnual
  const savingsRate = savingsBase > 0 ? params.annualSavings / savingsBase : 0
  const onceIncomeCount = (params.cashFlows ?? []).filter(
    (flow) => flow.kind === 'income' && flow.frequency === 'once'
  ).length

  return (
    <PanelGroupBody
      id="plan-editor-income"
      stats={[
        {
          label: t('summary.savingsRate'),
          value: formatPercent(savingsRate),
          hint: t('summary.savingsRateHint'),
        },
        {
          label: tSetup('assets.fields.annualSavings.label'),
          value: formatCurrency(params.annualSavings),
        },
      ]}
    >
      <div className="grid gap-x-5 gap-y-6 @md:grid-cols-2">
        <LabeledNumberInput
          id="editor-currentAssets"
          label={tSetup('assets.fields.currentAssets.label')}
          value={params.currentAssets}
          onChange={(value) => updateParams({ currentAssets: value })}
          helpText={tSetup('assets.fields.currentAssets.help')}
          className="w-full"
          unit={tSetup('units.currency')}
          groupThousands
          min={0}
          rangeMessage={atLeast(0)}
          invalidMessage={notANumber}
          onInvalidChange={(invalid) => markInvalid('editor-currentAssets', invalid)}
        />
        <LabeledNumberInput
          id="editor-annualSavings"
          label={tSetup('assets.fields.annualSavings.label')}
          value={params.annualSavings}
          onChange={(value) => updateParams({ annualSavings: value })}
          helpText={tSetup('assets.fields.annualSavings.help')}
          className="w-full"
          unit={tSetup('units.currency')}
          groupThousands
          min={0}
          rangeMessage={atLeast(0)}
          invalidMessage={notANumber}
          onInvalidChange={(invalid) => markInvalid('editor-annualSavings', invalid)}
        />
        <LabeledNumberInput
          id="editor-annualSavingsGrowthRate"
          label={tSetup('assets.fields.annualSavingsGrowthRate.label')}
          value={Number((params.annualSavingsGrowthRate * 100).toFixed(2))}
          onChange={(value) => updateParams({ annualSavingsGrowthRate: value / 100 })}
          helpText={tSetup('assets.fields.annualSavingsGrowthRate.help')}
          className="w-full"
          unit={tSetup('units.percentPerYear')}
          min={-10}
          max={20}
          rangeMessage={numberRange(-10, 20)}
          invalidMessage={notANumber}
          onInvalidChange={(invalid) => markInvalid('editor-annualSavingsGrowthRate', invalid)}
        />
      </div>

      {/* One-off income is a cash flow like any other, so the flows panel owns
          it — two editors writing the same list is how they drift apart. The
          pointer switches the panel in place. */}
      <button
        type="button"
        className="ws-pointer"
        onClick={() => openEditor({ panel: 'flows' })}
      >
        <span>{t('groups.cashFlows.incomePointer', { count: onceIncomeCount })}</span>
        <span className="ws-pointer-link">
          {tWorkspace('toFlows')}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>
    </PanelGroupBody>
  )
}
