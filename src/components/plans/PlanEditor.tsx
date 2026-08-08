'use client'

import { useMemo, useState } from 'react'
import type { NumberFormatOptions } from 'next-intl'
import { useFormatter, useTranslations } from 'next-intl'
import { RotateCcw, Save } from 'lucide-react'
import {
  DEFAULT_PARAMS,
  type CustomExpense,
  type OneTimeIncome,
  type SimulationParams,
  type WithdrawalStrategy,
} from '@/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LabeledNumberInput } from '@/components/forms/fields/LabeledNumberInput'
import { WizardSliderField } from '@/components/forms/fields/WizardSliderField'
import { ExpenseList } from '@/components/forms/fields/ExpenseList'
import { OneTimeIncomeList } from '@/components/forms/fields/OneTimeIncomeList'
import { toast } from '@/components/ui/toast'
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { planDisplayName } from '@/lib/plans/planName'
import {
  useActivePlan,
  usePlanIsDirty,
  useRevertPlanDraft,
  useSavePlanDraft,
  useSimulationParams,
  useUpdateParams,
} from '@/lib/stores/simulationStore'
import { cn } from '@/lib/utils'

const INVESTMENT_PRESETS = [
  { key: 'defensive', values: { averageROI: 0.055, roiVolatility: 0.1 } },
  { key: 'historical', values: { averageROI: 0.075, roiVolatility: 0.15 } },
  { key: 'growth', values: { averageROI: 0.095, roiVolatility: 0.2 } },
] as const

const INFLATION_PRESETS = [
  { key: 'low', values: { averageInflation: 0.018, inflationVolatility: 0.005 } },
  { key: 'target', values: { averageInflation: 0.025, inflationVolatility: 0.008 } },
  { key: 'elevated', values: { averageInflation: 0.035, inflationVolatility: 0.012 } },
] as const

const WITHDRAWAL_STRATEGIES = [
  'vanguardDynamic',
  'fixedReal',
] as const satisfies readonly WithdrawalStrategy[]

const isClose = (a: number, b: number, epsilon = 0.0005) => Math.abs(a - b) <= epsilon

interface StatItem {
  label: string
  value: string
  hint?: string
}

function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="border-2 border-neo-black bg-background px-3 py-2">
          <dt className="text-[0.55rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-sm font-black tabular-nums text-neo-black">{item.value}</dd>
          {item.hint && (
            <dd className="mt-0.5 text-[0.55rem] font-medium leading-tight text-muted-foreground">
              {item.hint}
            </dd>
          )}
        </div>
      ))}
    </dl>
  )
}

function EditorCard({
  id,
  title,
  description,
  stats,
  children,
  className,
}: {
  id: string
  title: string
  description: string
  stats?: StatItem[]
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      data-testid={id}
      className={cn(
        'theme-panel-card flex flex-col gap-5 border-3 border-neo-black bg-neo-white p-5 shadow-neo',
        className
      )}
    >
      <header className="border-b-2 border-neo-black pb-3">
        <h3 className="text-[0.92rem] font-black uppercase tracking-[0.16em] text-neo-black">
          {title}
        </h3>
        <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
          {description}
        </p>
      </header>
      {stats && stats.length > 0 && <StatStrip items={stats} />}
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  )
}

function PresetRow({
  label,
  options,
  activeKey,
  onSelect,
}: {
  label: string
  options: { key: string; label: string; detail: string }[]
  activeKey?: string
  onSelect: (key: string) => void
}) {
  return (
    <div className="space-y-2">
      <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-neo-black">
        {label}
      </span>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const isActive = option.key === activeKey
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(option.key)}
              className={cn(
                'flex flex-col items-start gap-0.5 border-2 border-neo-black px-3 py-2 text-left transition-neo',
                isActive
                  ? 'bg-neo-yellow text-neo-black shadow-neo-xs'
                  : 'bg-neo-white text-neo-black hover:bg-neo-blue/10'
              )}
            >
              <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.1em]">
                {option.label}
              </span>
              <span className="text-[0.58rem] font-semibold tabular-nums text-muted-foreground">
                {option.detail}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface PlanEditorProps {
  /** `drawer` stacks every card in one column for the mobile sheet. */
  variant?: 'page' | 'drawer'
  className?: string
}

/**
 * The plan's assumptions as one full-width, always-visible surface: four grouped
 * cards with inline editing and the totals that make the numbers legible. Every
 * edit goes to the working copy, so nothing here mutates a stored plan until the
 * user saves.
 */
export function PlanEditor({ variant = 'page', className }: PlanEditorProps) {
  const t = useTranslations('planEditor')
  const tSetup = useTranslations('setup')
  const tControls = useTranslations('parameterControls')
  const tPlans = useTranslations('plans')
  const tUi = useTranslations('ui')
  const format = useFormatter()

  const params = useSimulationParams()
  const updateParams = useUpdateParams()
  const activePlan = useActivePlan()
  const isDirty = usePlanIsDirty()
  const savePlanDraft = useSavePlanDraft()
  const revertPlanDraft = useRevertPlanDraft()

  const [resetOpen, setResetOpen] = useState(false)

  const planName = activePlan ? planDisplayName(activePlan, tPlans) : ''

  const handleSave = () => {
    if (!isDirty) return
    savePlanDraft()
    toast.success(tPlans('dirty.savedToast', { name: planName }))
  }

  const handleRevert = () => {
    if (!isDirty) return
    revertPlanDraft()
    toast.success(tPlans('dirty.revertedToast', { name: planName }))
  }

  // Cmd/Ctrl+S commits the working copy — the gesture people already reach for
  // when a document says "unsaved changes".
  useKeyboardShortcuts([
    { key: 's', cmd: true, handler: handleSave, description: 'Save the working copy to the plan' },
  ])

  const currency = useMemo<NumberFormatOptions>(
    () => ({
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
    []
  )

  const formatCurrency = (value: number) => format.number(value, currency)
  const formatPercent = (value: number, maximumFractionDigits = 1) =>
    format.number(value, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits })
  const formatInteger = (value: number) =>
    format.number(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  const expenses = params.customExpenses ?? []
  const oneTimeIncomes = params.oneTimeIncomes ?? []
  const combined = useMemo(() => calculateCombinedExpenses(expenses), [expenses])

  const workingYears = Math.max(0, params.retirementAge - params.currentAge)
  const retirementYears = Math.max(0, params.endAge - params.retirementAge)
  const realReturn = (1 + params.averageROI) / (1 + params.averageInflation) - 1
  const savingsBase = params.annualSavings + combined.combinedAnnual
  const savingsRate = savingsBase > 0 ? params.annualSavings / savingsBase : 0

  const investmentPresetKey = INVESTMENT_PRESETS.find(
    (preset) =>
      isClose(params.averageROI, preset.values.averageROI) &&
      isClose(params.roiVolatility, preset.values.roiVolatility)
  )?.key

  const inflationPresetKey = INFLATION_PRESETS.find(
    (preset) =>
      isClose(params.averageInflation, preset.values.averageInflation) &&
      isClose(params.inflationVolatility, preset.values.inflationVolatility)
  )?.key

  const retirementSliderMin = Math.max(50, Math.min(params.currentAge + 1, 69))

  const handleReset = () => {
    const previous: SimulationParams = { ...params }
    updateParams({ ...DEFAULT_PARAMS })
    setResetOpen(false)
    toast(
      (instance) => (
        <span className="flex items-center gap-3 text-sm font-semibold">
          {t('reset.done', { name: planName })}
          <button
            type="button"
            className="border-2 border-neo-black bg-neo-yellow px-2 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-neo-black"
            onClick={() => {
              toast.dismiss(instance.id)
              updateParams(previous)
              toast.success(t('reset.undone'))
            }}
          >
            {tPlans('actions.undo')}
          </button>
        </span>
      ),
      { duration: 8000 }
    )
  }

  const handleAddExpense = (expense: Omit<CustomExpense, 'id'>) => {
    const amount = Number.isFinite(expense.amount) ? Math.max(0, Math.round(expense.amount)) : 0
    const name = expense.name.trim()
    if (!name || amount === 0) return
    updateParams({
      customExpenses: [
        ...expenses,
        {
          ...expense,
          name,
          amount,
          id: `expense-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        },
      ],
    })
  }

  const handleUpdateExpense = (id: string, expense: Omit<CustomExpense, 'id'>) => {
    updateParams({
      customExpenses: expenses.map((entry) => (entry.id === id ? { ...expense, id } : entry)),
    })
  }

  const handleRemoveExpense = (id: string) => {
    updateParams({ customExpenses: expenses.filter((entry) => entry.id !== id) })
  }

  const clampIncomeAge = (age: number) =>
    Math.max(params.currentAge, Math.min(params.endAge, Math.round(age)))

  const handleAddIncome = (income: OneTimeIncome) => {
    updateParams({
      oneTimeIncomes: [
        ...oneTimeIncomes,
        {
          name: income.name || '',
          age: clampIncomeAge(income.age),
          amount: Math.max(0, Math.round(income.amount)),
        },
      ],
    })
  }

  const handleUpdateIncome = (index: number, income: OneTimeIncome) => {
    updateParams({
      oneTimeIncomes: oneTimeIncomes.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              name: income.name || '',
              age: clampIncomeAge(income.age),
              amount: Math.max(0, Math.round(income.amount)),
            }
          : entry
      ),
    })
  }

  const handleRemoveIncome = (index: number) => {
    updateParams({
      oneTimeIncomes: oneTimeIncomes.filter((_, entryIndex) => entryIndex !== index),
    })
  }

  const expenseStrings = {
    addButton: tControls('fields.expenses.add'),
    empty: tControls('fields.expenses.empty'),
    emptyHint: tControls('fields.expenses.emptyHint'),
    nameLabel: tControls('fields.expenses.nameLabel'),
    namePlaceholder: tControls('fields.expenses.namePlaceholder'),
    amountLabel: tControls('fields.expenses.amountLabel'),
    intervalLabel: tControls('fields.expenses.intervalLabel'),
    intervalMonthly: tControls('fields.expenses.intervalMonthly'),
    intervalAnnual: tControls('fields.expenses.intervalAnnual'),
    remove: tControls('fields.expenses.remove'),
    edit: tControls('fields.expenses.edit'),
    save: tControls('fields.expenses.save'),
    cancel: tControls('fields.expenses.cancel'),
    summaryLabel: tControls('fields.expenses.summary'),
    tableHeaders: {
      name: tControls('fields.expenses.table.name'),
      amount: tControls('fields.expenses.table.amount'),
      interval: tControls('fields.expenses.table.interval'),
      actions: tControls('fields.expenses.table.actions'),
    },
  }

  const incomeStrings = {
    addButton: tControls('fields.oneTimeIncomes.add'),
    empty: tControls('fields.oneTimeIncomes.empty'),
    emptyHint: tControls('fields.oneTimeIncomes.emptyHint'),
    nameLabel: tControls('fields.oneTimeIncomes.nameLabel'),
    namePlaceholder: tControls('fields.oneTimeIncomes.namePlaceholder'),
    ageLabel: tControls('fields.oneTimeIncomes.ageLabel'),
    agePrefix: tUi('age'),
    amountLabel: tControls('fields.oneTimeIncomes.amountLabel'),
    remove: tControls('fields.oneTimeIncomes.remove'),
    edit: tControls('fields.oneTimeIncomes.edit'),
    save: tControls('fields.oneTimeIncomes.save'),
    cancel: tControls('fields.oneTimeIncomes.cancel'),
    summaryLabel: tControls('fields.oneTimeIncomes.summary'),
    tableHeaders: {
      name: tControls('fields.oneTimeIncomes.table.name'),
      age: tControls('fields.oneTimeIncomes.table.age'),
      amount: tControls('fields.oneTimeIncomes.table.amount'),
      actions: tControls('fields.oneTimeIncomes.table.actions'),
    },
  }

  const gridClass =
    variant === 'drawer'
      ? 'grid grid-cols-1 gap-5'
      : 'grid grid-cols-1 gap-5 xl:grid-cols-2 xl:items-start'

  return (
    <div className={cn('space-y-5', className)} data-testid="plan-editor">
      <div className="flex flex-col gap-3 border-3 border-neo-black bg-neo-white px-5 py-4 shadow-neo sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[1rem] font-black uppercase tracking-[0.2em] text-neo-black">
            {t('title')}
          </h2>
          <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-muted-foreground">
            {planName ? t('description', { name: planName }) : t('descriptionGeneric')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="h-9"
            disabled={!isDirty}
            data-testid="plan-editor-save"
            onClick={handleSave}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {tPlans('actions.saveToPlan')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={!isDirty}
            data-testid="plan-editor-revert"
            onClick={handleRevert}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {tPlans('actions.revert')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-neo-red"
            data-testid="plan-editor-reset"
            onClick={() => setResetOpen(true)}
          >
            {t('reset.trigger')}
          </Button>
        </div>
      </div>

      <div className={gridClass}>
        <EditorCard
          id="plan-editor-personal"
          title={t('groups.personal.title')}
          description={t('groups.personal.description')}
          stats={[
            {
              label: t('summary.workingYears'),
              value: t('summary.years', { count: workingYears }),
            },
            {
              label: t('summary.retirementYears'),
              value: t('summary.years', { count: retirementYears }),
            },
            {
              label: t('summary.pensionGap', { age: params.legalRetirementAge }),
              value: t('summary.years', {
                count: Math.max(0, params.legalRetirementAge - params.retirementAge),
              }),
            },
          ]}
        >
          <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
            <LabeledNumberInput
              id="editor-currentAge"
              label={tSetup('personal.fields.currentAge.label')}
              value={params.currentAge}
              onChange={(value) => updateParams({ currentAge: value })}
              helpText={tSetup('personal.fields.currentAge.help')}
              className="w-full"
              min={16}
              max={100}
            />
            <LabeledNumberInput
              id="editor-legalRetirementAge"
              label={tSetup('personal.fields.legalRetirementAge.label')}
              value={params.legalRetirementAge}
              onChange={(value) => updateParams({ legalRetirementAge: value })}
              helpText={tSetup('personal.fields.legalRetirementAge.help')}
              tooltip={tSetup('personal.fields.legalRetirementAge.tooltip')}
              className="w-full"
              min={60}
              max={75}
            />
          </div>

          <WizardSliderField
            id="editor-retirementAge"
            label={tSetup('personal.fields.retirementAge.label')}
            value={params.retirementAge}
            onValueChange={(value) => updateParams({ retirementAge: value })}
            min={retirementSliderMin}
            max={70}
            step={1}
            valueLabel={formatInteger(params.retirementAge)}
            minLabel={formatInteger(retirementSliderMin)}
            maxLabel={formatInteger(70)}
            helpText={tSetup('personal.fields.retirementAge.help')}
          />

          <div className="sm:max-w-[50%]">
            <LabeledNumberInput
              id="editor-endAge"
              label={tSetup('personal.fields.endAge.label')}
              value={params.endAge}
              onChange={(value) => updateParams({ endAge: value })}
              helpText={tSetup('personal.fields.endAge.help')}
              className="w-full"
              min={65}
              max={110}
            />
          </div>
        </EditorCard>

        <EditorCard
          id="plan-editor-income"
          title={t('groups.income.title')}
          description={t('groups.income.description')}
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
            {
              label: tSetup('assets.fields.monthlyPension.label'),
              value: formatCurrency(params.monthlyPension),
            },
          ]}
        >
          <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
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
            />
            <LabeledNumberInput
              id="editor-monthlyPension"
              label={tSetup('assets.fields.monthlyPension.label')}
              value={params.monthlyPension}
              onChange={(value) => updateParams({ monthlyPension: value })}
              helpText={tSetup('assets.fields.monthlyPension.help')}
              className="w-full"
              unit={tSetup('units.currency')}
              groupThousands
              min={0}
            />
          </div>

          <div className="space-y-3 border-2 border-neo-black bg-background px-4 py-4">
            <h4 className="text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-neo-black">
              {tControls('sections.financial.oneTime.title')}
            </h4>
            <OneTimeIncomeList
              incomes={oneTimeIncomes}
              minAge={params.currentAge}
              maxAge={params.endAge}
              defaultAge={Math.min(
                params.endAge,
                Math.max(params.retirementAge, params.currentAge + 1)
              )}
              strings={incomeStrings}
              onAdd={handleAddIncome}
              onUpdate={handleUpdateIncome}
              onRemove={handleRemoveIncome}
              formatCurrency={formatCurrency}
            />
          </div>
        </EditorCard>

        <EditorCard
          id="plan-editor-expenses"
          title={t('groups.expenses.title')}
          description={t('groups.expenses.description')}
          stats={[
            {
              label: t('summary.monthlyTotal'),
              value: formatCurrency(combined.totalMonthly),
              hint: t('summary.expenseCount', {
                count: expenses.filter((entry) => entry.interval === 'monthly').length,
              }),
            },
            {
              label: t('summary.annualExtras'),
              value: formatCurrency(combined.totalAnnual),
              hint: t('summary.expenseCount', {
                count: expenses.filter((entry) => entry.interval === 'annual').length,
              }),
            },
            {
              label: t('summary.combinedAnnual'),
              value: formatCurrency(combined.combinedAnnual),
            },
          ]}
        >
          <ExpenseList
            expenses={expenses}
            strings={expenseStrings}
            onAdd={handleAddExpense}
            onUpdate={handleUpdateExpense}
            onRemove={handleRemoveExpense}
            formatCurrency={formatCurrency}
          />
        </EditorCard>

        <EditorCard
          id="plan-editor-market"
          title={t('groups.market.title')}
          description={t('groups.market.description')}
          stats={[
            {
              label: t('summary.realReturn'),
              value: formatPercent(realReturn, 1),
            },
            {
              label: tControls('fields.roiVolatility.label'),
              value: `± ${formatPercent(params.roiVolatility)}`,
            },
            {
              label: tControls('fields.simulationRuns.label'),
              value: formatInteger(params.simulationRuns),
            },
          ]}
        >
          <PresetRow
            label={tControls('presets.investment.title')}
            activeKey={investmentPresetKey}
            options={INVESTMENT_PRESETS.map((preset) => ({
              key: preset.key,
              label: tControls(`presets.investment.items.${preset.key}.name`),
              detail: `${formatPercent(preset.values.averageROI)} · σ ${formatPercent(preset.values.roiVolatility)}`,
            }))}
            onSelect={(key) => {
              const preset = INVESTMENT_PRESETS.find((entry) => entry.key === key)
              if (preset) updateParams({ ...preset.values })
            }}
          />

          <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
            <WizardSliderField
              id="editor-averageROI"
              label={tSetup('market.averageROI.label')}
              value={params.averageROI * 100}
              onValueChange={(value) => updateParams({ averageROI: value / 100 })}
              min={3}
              max={12}
              step={0.25}
              valueLabel={formatPercent(params.averageROI, 2)}
              minLabel={formatPercent(0.03, 0)}
              maxLabel={formatPercent(0.12, 0)}
            />
            <WizardSliderField
              id="editor-roiVolatility"
              label={tControls('fields.roiVolatility.label')}
              value={params.roiVolatility * 100}
              onValueChange={(value) => updateParams({ roiVolatility: value / 100 })}
              min={2}
              max={25}
              step={0.5}
              valueLabel={formatPercent(params.roiVolatility, 1)}
              minLabel={formatPercent(0.02, 0)}
              maxLabel={formatPercent(0.25, 0)}
              helpText={tControls('fields.roiVolatility.range', {
                range: '68%',
                lower: formatPercent(params.averageROI - params.roiVolatility),
                upper: formatPercent(params.averageROI + params.roiVolatility),
              })}
            />
          </div>

          <PresetRow
            label={tControls('presets.inflation.title')}
            activeKey={inflationPresetKey}
            options={INFLATION_PRESETS.map((preset) => ({
              key: preset.key,
              label: tControls(`presets.inflation.items.${preset.key}.name`),
              detail: `${formatPercent(preset.values.averageInflation)} · σ ${formatPercent(preset.values.inflationVolatility)}`,
            }))}
            onSelect={(key) => {
              const preset = INFLATION_PRESETS.find((entry) => entry.key === key)
              if (preset) updateParams({ ...preset.values })
            }}
          />

          <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
            <WizardSliderField
              id="editor-averageInflation"
              label={tSetup('market.averageInflation.label')}
              value={params.averageInflation * 100}
              onValueChange={(value) => updateParams({ averageInflation: value / 100 })}
              min={1}
              max={6}
              step={0.1}
              valueLabel={formatPercent(params.averageInflation, 1)}
              minLabel={formatPercent(0.01, 0)}
              maxLabel={formatPercent(0.06, 0)}
            />
            <WizardSliderField
              id="editor-inflationVolatility"
              label={tControls('fields.inflationVolatility.label')}
              value={params.inflationVolatility * 100}
              onValueChange={(value) => updateParams({ inflationVolatility: value / 100 })}
              min={0.1}
              max={3}
              step={0.1}
              valueLabel={formatPercent(params.inflationVolatility, 2)}
              minLabel={formatPercent(0.001, 1)}
              maxLabel={formatPercent(0.03, 0)}
            />
            <LabeledNumberInput
              id="editor-capitalGainsTax"
              label={tControls('fields.capitalGainsTax.label')}
              value={params.capitalGainsTax}
              onChange={(value) => updateParams({ capitalGainsTax: value })}
              helpText={tControls('fields.capitalGainsTax.tooltip')}
              className="w-full"
              unit="%"
              min={0}
              max={50}
            />
            <LabeledNumberInput
              id="editor-simulationRuns"
              label={tControls('fields.simulationRuns.label')}
              value={params.simulationRuns}
              onChange={(value) => updateParams({ simulationRuns: value })}
              helpText={tControls('fields.simulationRuns.tooltip')}
              className="w-full"
              groupThousands
              min={100}
              max={10000}
            />
          </div>

          <div className="space-y-3">
            <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-neo-black">
              {tControls('fields.withdrawalStrategy.label')}
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {WITHDRAWAL_STRATEGIES.map((strategy) => {
                const isSelected = params.withdrawalStrategy === strategy
                return (
                  <button
                    key={strategy}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => updateParams({ withdrawalStrategy: strategy })}
                    className={cn(
                      'flex flex-col items-start gap-1 border-2 border-neo-black px-3 py-2.5 text-left transition-neo',
                      isSelected
                        ? 'bg-neo-blue text-neo-white shadow-neo-xs'
                        : 'bg-neo-white text-neo-black hover:bg-neo-blue/10'
                    )}
                  >
                    <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.1em]">
                      {tControls(`fields.withdrawalStrategy.options.${strategy}.label`)}
                    </span>
                    <span className="text-[0.58rem] font-medium leading-snug opacity-90">
                      {tControls(`fields.withdrawalStrategy.options.${strategy}.description`)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {params.withdrawalStrategy === 'vanguardDynamic' && (
            <div className="grid gap-x-5 gap-y-6 sm:grid-cols-3">
              <WizardSliderField
                id="editor-dsWithdrawalRate"
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
              <WizardSliderField
                id="editor-dsCeilingRate"
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
              <WizardSliderField
                id="editor-dsFloorRate"
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
            </div>
          )}
        </EditorCard>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="bg-neo-white sm:max-w-[30rem]" data-testid="plan-reset-dialog">
          <DialogHeader>
            <DialogTitle>{t('reset.title')}</DialogTitle>
            <DialogDescription>{t('reset.description', { name: planName })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResetOpen(false)}>
              {tPlans('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              data-testid="plan-reset-confirm"
              onClick={handleReset}
            >
              {t('reset.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
