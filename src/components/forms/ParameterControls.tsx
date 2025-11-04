'use client'

import React from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import type { NumberFormatOptions } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { RotateCcw, HelpCircle, Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { OneTimeIncomeList } from '@/components/forms/fields/OneTimeIncomeList'
import {
  useSimulationParams,
  useUpdateParams,
  useSaveSetup,
  useLoadSetup,
  useDeleteSetup,
  useSavedSetups,
  useSetAutoRunSuspended,
} from '@/lib/stores/simulationStore'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { DEFAULT_PARAMS, SimulationParams, type OneTimeIncome } from '@/types'

type FormatterNumberOptions = Parameters<ReturnType<typeof useFormatter>['number']>[1]

const composeNumberOptions = (
  base: NumberFormatOptions,
  override?: FormatterNumberOptions,
): FormatterNumberOptions => {
  if (!override) return base
  if (typeof override === 'string') return override
  return { ...base, ...override }
}

// Preset configurations
const INVESTMENT_PRESETS = [
  {
    key: 'defensive',
    values: {
      averageROI: 0.055,
      roiVolatility: 0.1,
      simulationRuns: 5000,
    },
  },
  {
    key: 'historical',
    values: {
      averageROI: 0.075,
      roiVolatility: 0.15,
      simulationRuns: 6000,
    },
  },
  {
    key: 'growth',
    values: {
      averageROI: 0.095,
      roiVolatility: 0.2,
      simulationRuns: 7500,
    },
  },
] as const

const INFLATION_PRESETS = [
  {
    key: 'low',
    values: {
      averageInflation: 0.018,
      inflationVolatility: 0.005,
    },
  },
  {
    key: 'target',
    values: {
      averageInflation: 0.025,
      inflationVolatility: 0.008,
    },
  },
  {
    key: 'elevated',
    values: {
      averageInflation: 0.035,
      inflationVolatility: 0.012,
    },
  },
] as const

const sanitizeNumberInput = (rawValue: string, fallback: number): number => {
  if (rawValue === '') return fallback
  const next = Number(rawValue)
  return Number.isFinite(next) ? next : fallback
}

const isClose = (a: number, b: number, epsilon = 0.0005) => Math.abs(a - b) <= epsilon

const FIELD_INPUT_CLASS =
  'h-11 border-2 border-neo-black bg-neo-white px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.12em]'
const COMPACT_INPUT_CLASS =
  'h-10 w-24 border-2 border-neo-black bg-neo-white px-2 text-right text-[0.68rem] font-semibold uppercase tracking-[0.12em]'

// Helper component for parameters with tooltips
interface ParameterFieldProps {
  label: string
  tooltip: string
  children: React.ReactNode
}

function ParameterField({ label, tooltip, children }: ParameterFieldProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Label className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-neo-black">
          {label}
        </Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground/70 transition-colors hover:text-neo-black" />
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="max-w-xs border-4 border-neo-black bg-neo-white px-3 py-2 text-neo-black shadow-neo"
            >
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] leading-relaxed">
                {tooltip}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {children}
    </div>
  )
}

// Collapsible section component
interface CollapsibleSectionProps {
  title: string
  description?: string
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleSection({
  title,
  description,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          className="flex h-auto min-h-16 w-full items-center justify-between border-3 border-neo-black bg-neo-white px-6 py-4 text-left text-[0.74rem] font-extrabold uppercase tracking-[0.14em] text-neo-black shadow-neo hover:-translate-y-[2px] hover:-translate-x-[2px] hover:shadow-neo-md whitespace-normal"
        >
          <div className="flex flex-1 flex-col items-start gap-1 pr-2 overflow-hidden min-w-0">
            <span className="text-left text-[0.82rem] font-extrabold uppercase tracking-[0.14em] leading-tight break-words w-full">
              {title}
            </span>
            {description && (
              <span className="text-left text-[0.6rem] font-semibold uppercase tracking-[0.08em] leading-tight text-muted-foreground break-words w-full">
                {description}
              </span>
            )}
          </div>
          <div className="flex-shrink-0">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">
        <div className="space-y-5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ParameterControls() {
  const t = useTranslations('parameterControls')
  const format = useFormatter()
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false)
  const [setupName, setSetupName] = React.useState('')
  const [selectedSetupId, setSelectedSetupId] = React.useState('')
  const params = useSimulationParams()
  const updateParams = useUpdateParams()
  const setAutoRunSuspended = useSetAutoRunSuspended()
  const resumeRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const suspendAndDebounceResume = React.useCallback(() => {
    setAutoRunSuspended(true)
    if (resumeRef.current) clearTimeout(resumeRef.current)
    resumeRef.current = setTimeout(() => {
      setAutoRunSuspended(false)
    }, 500)
  }, [setAutoRunSuspended])
  const saveSetup = useSaveSetup()
  const loadSetup = useLoadSetup()
  const deleteSetup = useDeleteSetup()
  const savedSetups = useSavedSetups()
  const remainingWorkingYears = Math.max(0, params.retirementAge - params.currentAge)
  const totalMonthlyExpenses = React.useMemo(
    () => Object.values(params.monthlyExpenses).reduce((sum, value) => sum + value, 0),
    [params.monthlyExpenses]
  )
  const totalAnnualExpenses = React.useMemo(
    () => Object.values(params.annualExpenses).reduce((sum, value) => sum + value, 0),
    [params.annualExpenses]
  )
  const combinedExpenses = React.useMemo(
    () => calculateCombinedExpenses(params.monthlyExpenses, params.annualExpenses),
    [params.annualExpenses, params.monthlyExpenses]
  )
  const oneTimeIncomes = params.oneTimeIncomes ?? []
  const defaultOneTimeIncomeAge = React.useMemo(
    () =>
      Math.min(
        params.endAge,
        Math.max(params.retirementAge, params.currentAge + 1)
      ),
    [params.currentAge, params.endAge, params.retirementAge]
  )
  const clampOneTimeIncomeAge = React.useCallback(
    (age: number) => Math.min(params.endAge, Math.max(params.currentAge, Math.round(age))),
    [params.currentAge, params.endAge]
  )
  const sanitizeIncomeAmount = React.useCallback((amount: number) => Math.max(0, Math.round(amount)), [])

  React.useEffect(() => {
    if (params.retirementAge < params.currentAge) {
      suspendAndDebounceResume()
      updateParams({ retirementAge: params.currentAge })
    }
  }, [params.currentAge, params.retirementAge, suspendAndDebounceResume, updateParams])

  const baseCurrencyFormat = React.useMemo<NumberFormatOptions>(
    () => ({
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
    []
  )

  const basePercentFormat = React.useMemo<NumberFormatOptions>(
    () => ({
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }),
    []
  )

  const baseNumberFormat = React.useMemo<NumberFormatOptions>(
    () => ({
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
    []
  )

  const investmentPresetKey = React.useMemo<
    (typeof INVESTMENT_PRESETS)[number]['key'] | undefined
  >(() => {
    const match = INVESTMENT_PRESETS.find((preset) => {
      const matchesReturn = isClose(params.averageROI, preset.values.averageROI)
      const matchesVolatility = isClose(params.roiVolatility, preset.values.roiVolatility)
      const matchesRuns =
        preset.values.simulationRuns == null ||
        preset.values.simulationRuns === params.simulationRuns
      return matchesReturn && matchesVolatility && matchesRuns
    })
    return match?.key
  }, [params.averageROI, params.roiVolatility, params.simulationRuns])

  const inflationPresetKey = React.useMemo<
    (typeof INFLATION_PRESETS)[number]['key'] | undefined
  >(() => {
    const match = INFLATION_PRESETS.find(
      (preset) =>
        isClose(params.averageInflation, preset.values.averageInflation) &&
        isClose(params.inflationVolatility, preset.values.inflationVolatility)
    )
    return match?.key
  }, [params.averageInflation, params.inflationVolatility])

  const formatCurrency = React.useCallback(
    (value: number, options?: FormatterNumberOptions) =>
      format.number(value, composeNumberOptions(baseCurrencyFormat, options)),
    [baseCurrencyFormat, format]
  )

  const formatPercent = React.useCallback(
    (value: number, options?: FormatterNumberOptions) =>
      format.number(value, composeNumberOptions(basePercentFormat, options)),
    [basePercentFormat, format]
  )

  const formatNumber = React.useCallback(
    (value: number, options?: FormatterNumberOptions) =>
      format.number(value, composeNumberOptions(baseNumberFormat, options)),
    [baseNumberFormat, format]
  )

  const handleInputChange = (field: keyof SimulationParams, value: number) => {
    suspendAndDebounceResume()
    updateParams({ [field]: value })
  }

  const handleExpenseChange = (
    category: keyof SimulationParams['monthlyExpenses'],
    value: number
  ) => {
    suspendAndDebounceResume()
    updateParams({
      monthlyExpenses: {
        ...params.monthlyExpenses,
        [category]: value,
      },
    })
  }

  const handleAnnualExpenseChange = (
    category: keyof SimulationParams['annualExpenses'],
    value: number
  ) => {
    suspendAndDebounceResume()
    updateParams({
      annualExpenses: {
        ...params.annualExpenses,
        [category]: value,
      },
    })
  }

  const handleReset = () => {
    updateParams(DEFAULT_PARAMS)
  }

  const handleAddOneTimeIncome = (income: OneTimeIncome) => {
    suspendAndDebounceResume()
    const nextIncome: OneTimeIncome = {
      age: clampOneTimeIncomeAge(income.age),
      amount: sanitizeIncomeAmount(income.amount),
    }
    updateParams({
      oneTimeIncomes: [...oneTimeIncomes, nextIncome],
    })
  }

  const handleUpdateOneTimeIncome = (index: number, income: OneTimeIncome) => {
    if (!oneTimeIncomes[index]) return
    suspendAndDebounceResume()
    const next = oneTimeIncomes.map((existing, existingIndex) =>
      existingIndex === index
        ? {
            age: clampOneTimeIncomeAge(income.age),
            amount: sanitizeIncomeAmount(income.amount),
          }
        : existing
    )
    updateParams({ oneTimeIncomes: next })
  }

  const handleRemoveOneTimeIncome = (index: number) => {
    if (!oneTimeIncomes[index]) return
    suspendAndDebounceResume()
    updateParams({
      oneTimeIncomes: oneTimeIncomes.filter((_, existingIndex) => existingIndex !== index),
    })
  }

  const applyInvestmentPreset = (presetKey: (typeof INVESTMENT_PRESETS)[number]['key']) => {
    const preset = INVESTMENT_PRESETS.find((item) => item.key === presetKey)
    if (!preset) return
    suspendAndDebounceResume()
    updateParams({
      averageROI: preset.values.averageROI,
      roiVolatility: preset.values.roiVolatility,
      simulationRuns: preset.values.simulationRuns ?? params.simulationRuns,
    })
  }

  const applyInflationPreset = (presetKey: (typeof INFLATION_PRESETS)[number]['key']) => {
    const preset = INFLATION_PRESETS.find((item) => item.key === presetKey)
    if (!preset) return
    suspendAndDebounceResume()
    updateParams({
      averageInflation: preset.values.averageInflation,
      inflationVolatility: preset.values.inflationVolatility,
    })
  }

  const handleSaveSetup = () => {
    if (setupName.trim()) {
      saveSetup(setupName.trim())
      setSetupName('')
      setSaveDialogOpen(false)
    }
  }

  const handleLoadSetup = (setupId: string) => {
    if (setupId) {
      loadSetup(setupId)
      setSelectedSetupId('')
    }
  }

  const handleDeleteSetup = (setupId: string) => {
    deleteSetup(setupId)
    if (selectedSetupId === setupId) {
      setSelectedSetupId('')
    }
  }

  return (
    <Card className="w-full border-3 border-neo-black bg-neo-white shadow-neo">
      <CardHeader className="border-b-3 border-neo-black bg-neo-white px-6 py-5">
        <CardTitle className="text-[1.05rem] font-black uppercase tracking-[0.22em] text-neo-black">
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-8 p-6">
        <section className="grid gap-6">
          <div className="space-y-3">
            <h4 className="text-[0.78rem] font-extrabold uppercase tracking-[0.2em] text-neo-black">
              {t('presets.investment.title')}
            </h4>
            <Select
              value={investmentPresetKey ?? undefined}
              onValueChange={applyInvestmentPreset}
            >
              <SelectTrigger size="sm" className="h-10 justify-between bg-neo-white">
                <SelectValue placeholder={t('presets.investment.placeholder')}>
                  {investmentPresetKey ? (
                    <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em]">
                      {t(`presets.investment.items.${investmentPresetKey}.name`)}
                    </span>
                  ) : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {INVESTMENT_PRESETS.map((preset) => (
                  <SelectItem key={preset.key} value={preset.key}>
                    <div className="flex flex-col gap-1">
                      <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.18em]">
                        {t(`presets.investment.items.${preset.key}.name`)}
                      </span>
                      <span className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {t(`presets.investment.items.${preset.key}.description`)}
                      </span>
                      <span className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {formatPercent(preset.values.averageROI)} · σ{' '}
                        {formatPercent(preset.values.roiVolatility)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <h4 className="text-[0.78rem] font-extrabold uppercase tracking-[0.2em] text-neo-black">
              {t('presets.inflation.title')}
            </h4>
            <Select
              value={inflationPresetKey ?? undefined}
              onValueChange={applyInflationPreset}
            >
              <SelectTrigger size="sm" className="h-10 justify-between bg-neo-white">
                <SelectValue placeholder={t('presets.inflation.placeholder')}>
                  {inflationPresetKey ? (
                    <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em]">
                      {t(`presets.inflation.items.${inflationPresetKey}.name`)}
                    </span>
                  ) : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {INFLATION_PRESETS.map((preset) => (
                  <SelectItem key={preset.key} value={preset.key}>
                    <div className="flex flex-col gap-1">
                      <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.18em]">
                        {t(`presets.inflation.items.${preset.key}.name`)}
                      </span>
                      <span className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {t(`presets.inflation.items.${preset.key}.description`)}
                      </span>
                      <span className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {formatPercent(preset.values.averageInflation)} · σ{' '}
                        {formatPercent(preset.values.inflationVolatility)}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <Tabs defaultValue="personal" className="w-full">
          <div className="border-3 border-neo-black shadow-neo-sm">
            <TabsList className="grid grid-cols-3 border-b border-neo-black divide-x-[3px] divide-neo-black bg-neo-white">
              <TabsTrigger value="personal">
                {t('tabs.personal')}
              </TabsTrigger>
              <TabsTrigger value="financial">
                {t('tabs.financial')}
              </TabsTrigger>
              <TabsTrigger value="simulation">
                {t('tabs.simulation')}
              </TabsTrigger>
            </TabsList>

            <div className="border-t-3 border-neo-black bg-neo-white p-6">
          {/* Personal Information Tab */}
          <TabsContent value="personal" className="space-y-6">
            <CollapsibleSection
              title={t('sections.personal.timeline.title')}
              description={t('sections.personal.timeline.description')}
              defaultOpen
            >
              <ParameterField
                label={t('fields.currentAge.label')}
                tooltip={t('fields.currentAge.tooltip')}
              >
                <Input
                  type="number"
                  value={params.currentAge}
                  onChange={(e) =>
                    handleInputChange(
                      'currentAge',
                      sanitizeNumberInput(e.target.value, params.currentAge)
                    )
                  }
                  className={FIELD_INPUT_CLASS}
                  min={18}
                  max={80}
                />
              </ParameterField>

              <ParameterField
                label={t('fields.retirementAge.label')}
                tooltip={t('fields.retirementAge.tooltip')}
              >
                <div>
                  <Input
                    type="number"
                    value={params.retirementAge}
                    onChange={(e) =>
                      handleInputChange(
                        'retirementAge',
                        sanitizeNumberInput(e.target.value, params.retirementAge)
                      )
                    }
                    className={FIELD_INPUT_CLASS}
                    min={params.currentAge}
                    max={Math.max(params.currentAge, params.legalRetirementAge, 70)}
                  />
                  <div className="mt-2 text-center text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t('fields.retirementAge.remaining', { count: remainingWorkingYears })}
                  </div>
                </div>
              </ParameterField>

              <ParameterField
                label={t('fields.legalRetirementAge.label')}
                tooltip={t('fields.legalRetirementAge.tooltip')}
              >
                <Input
                  type="number"
                  value={params.legalRetirementAge}
                  onChange={(e) =>
                    handleInputChange(
                      'legalRetirementAge',
                      sanitizeNumberInput(e.target.value, params.legalRetirementAge)
                    )
                  }
                  className={FIELD_INPUT_CLASS}
                  min={60}
                  max={70}
                />
              </ParameterField>

              <ParameterField
                label={t('fields.endAge.label')}
                tooltip={t('fields.endAge.tooltip')}
              >
                <Input
                  type="number"
                  value={params.endAge}
                  onChange={(e) =>
                    handleInputChange(
                      'endAge',
                      sanitizeNumberInput(e.target.value, params.endAge)
                    )
                  }
                  className={FIELD_INPUT_CLASS}
                  min={70}
                  max={100}
                />
              </ParameterField>
            </CollapsibleSection>
          </TabsContent>

          {/* Financial Parameters Tab */}
          <TabsContent value="financial" className="space-y-6">
            <CollapsibleSection
              title={t('sections.financial.assets.title')}
              description={t('sections.financial.assets.description')}
              defaultOpen
            >
              <ParameterField
                label={t('fields.currentAssets.label')}
                tooltip={t('fields.currentAssets.tooltip')}
              >
                <Input
                  type="number"
                  value={params.currentAssets}
                  onChange={(e) =>
                    handleInputChange(
                      'currentAssets',
                      sanitizeNumberInput(e.target.value, params.currentAssets)
                    )
                  }
                  className={FIELD_INPUT_CLASS}
                  min={0}
                />
              </ParameterField>

              <ParameterField
                label={t('fields.annualSavings.label')}
                tooltip={t('fields.annualSavings.tooltip')}
              >
                <Input
                  type="number"
                  value={params.annualSavings}
                  onChange={(e) =>
                    handleInputChange(
                      'annualSavings',
                      sanitizeNumberInput(e.target.value, params.annualSavings)
                    )
                  }
                  className={FIELD_INPUT_CLASS}
                  min={0}
                />
              </ParameterField>
            </CollapsibleSection>

            <CollapsibleSection
              title={t('sections.financial.pension.title')}
              description={t('sections.financial.pension.description')}
              defaultOpen
            >
              <ParameterField
                label={t('fields.monthlyPension.label')}
                tooltip={t('fields.monthlyPension.tooltip')}
              >
                <Input
                  type="number"
                  value={params.monthlyPension}
                  onChange={(e) =>
                    handleInputChange(
                      'monthlyPension',
                      sanitizeNumberInput(e.target.value, params.monthlyPension)
                    )
                  }
                  className={FIELD_INPUT_CLASS}
                  min={0}
                />
              </ParameterField>

              <ParameterField
                label={t('fields.capitalGainsTax.label')}
                tooltip={t('fields.capitalGainsTax.tooltip')}
              >
                <div className="px-2 py-1">
                  <Slider
                    value={[params.capitalGainsTax]}
                    onValueChange={([value]) => handleInputChange('capitalGainsTax', value)}
                    min={0}
                    max={50}
                    step={0.25}
                    className="w-full"
                  />
                  <div className="mt-2 flex justify-between text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <span>{formatPercent(0, { maximumFractionDigits: 0 })}</span>
                    <span className="border-2 border-neo-black bg-neo-white px-3 py-1 text-neo-black">
                      {formatPercent(params.capitalGainsTax / 100, {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span>{formatPercent(0.5, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </ParameterField>
            </CollapsibleSection>

            <CollapsibleSection
              title={t('sections.financial.oneTime.title')}
              description={t('sections.financial.oneTime.description')}
              defaultOpen={false}
            >
              <OneTimeIncomeList
                incomes={oneTimeIncomes}
                minAge={params.currentAge}
                maxAge={params.endAge}
                defaultAge={defaultOneTimeIncomeAge}
                strings={{
                  addButton: t('fields.oneTimeIncomes.add'),
                  empty: t('fields.oneTimeIncomes.empty'),
                  ageLabel: t('fields.oneTimeIncomes.ageLabel'),
                  amountLabel: t('fields.oneTimeIncomes.amountLabel'),
                  remove: t('fields.oneTimeIncomes.remove'),
                  summaryLabel: t('fields.oneTimeIncomes.summary'),
                  tableHeaders: {
                    age: t('fields.oneTimeIncomes.table.age'),
                    amount: t('fields.oneTimeIncomes.table.amount'),
                    actions: t('fields.oneTimeIncomes.table.actions'),
                  },
                }}
                onAdd={handleAddOneTimeIncome}
                onUpdate={handleUpdateOneTimeIncome}
                onRemove={handleRemoveOneTimeIncome}
                formatCurrency={(value) => formatCurrency(value)}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title={t('sections.financial.monthly.title')}
              description={t('sections.financial.monthly.description', {
                value: formatCurrency(totalMonthlyExpenses),
              })}
              defaultOpen={false}
            >
              <div className="space-y-2">
                {Object.entries(params.monthlyExpenses).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
                      {t(`expenses.monthly.${key}`)}
                    </Label>
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) =>
                        handleExpenseChange(
                          key as keyof typeof params.monthlyExpenses,
                          sanitizeNumberInput(
                            e.target.value,
                            params.monthlyExpenses[key as keyof typeof params.monthlyExpenses]
                          )
                        )
                      }
                      className={COMPACT_INPUT_CLASS}
                      min={0}
                    />
                  </div>
                ))}
                <div className="pt-2 border-t space-y-1">
                  <div className="flex justify-between text-sm font-semibold text-blue-600">
                    <div className="flex items-center gap-1">
                      <span>{t('sections.financial.monthly.combined')}</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-xs border-3 border-neo-black bg-neo-white px-3 py-2 text-neo-black shadow-neo-sm"
                          >
                            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em]">
                              {t('sections.financial.monthly.tooltip')}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <span>{formatCurrency(combinedExpenses.combinedMonthly)}</span>
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title={t('sections.financial.annual.title')}
              description={t('sections.financial.annual.description', {
                value: formatCurrency(totalAnnualExpenses),
              })}
              defaultOpen={false}
            >
              <div className="space-y-2">
                {Object.entries(params.annualExpenses).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-[0.62rem] font-semibold uppercase tracking-[0.12em]">
                      {t(`expenses.annual.${key}`)}
                    </Label>
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) =>
                        handleAnnualExpenseChange(
                          key as keyof typeof params.annualExpenses,
                          sanitizeNumberInput(
                            e.target.value,
                            params.annualExpenses[key as keyof typeof params.annualExpenses]
                          )
                        )
                      }
                      className={COMPACT_INPUT_CLASS}
                      min={0}
                    />
                  </div>
                ))}
                <div className="pt-2 border-t space-y-1">
                  <div className="flex justify-between text-sm font-semibold text-blue-600">
                    <div className="flex items-center gap-1">
                      <span>{t('sections.financial.annual.combined')}</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-xs border-3 border-neo-black bg-neo-white px-3 py-2 text-neo-black shadow-neo-sm"
                          >
                            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em]">
                              {t('sections.financial.annual.tooltip')}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <span>{formatCurrency(combinedExpenses.combinedAnnual)}</span>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          </TabsContent>

          {/* Simulation Parameters Tab */}
          <TabsContent value="simulation" className="space-y-6">
            <CollapsibleSection
              title={t('sections.simulation.market.title')}
              description={t('sections.simulation.market.description')}
              defaultOpen
            >
              <ParameterField
                label={t('fields.averageROI.label')}
                tooltip={t('fields.averageROI.tooltip')}
              >
                <div className="px-2 py-1">
                  <Slider
                    value={[params.averageROI * 100]}
                    onValueChange={([value]) => handleInputChange('averageROI', value / 100)}
                    min={3}
                    max={12}
                    step={0.5}
                    className="w-full"
                  />
                  <div className="mt-2 flex justify-between text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <span>{formatPercent(0.03, { maximumFractionDigits: 0 })}</span>
                    <span className="border-2 border-neo-black bg-neo-white px-3 py-1 text-neo-black">
                      {formatPercent(params.averageROI)}
                    </span>
                    <span>{formatPercent(0.12, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </ParameterField>

              <ParameterField
                label={t('fields.roiVolatility.label')}
                tooltip={t('fields.roiVolatility.tooltip')}
              >
                <div className="px-2 py-1">
                  <Slider
                    value={[params.roiVolatility * 100]}
                    onValueChange={([value]) => handleInputChange('roiVolatility', value / 100)}
                    min={2}
                    max={25}
                    step={0.5}
                    className="w-full"
                  />
                  <div className="mt-2 flex justify-between text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <span>{formatPercent(0.02, { maximumFractionDigits: 0 })}</span>
                    <span className="border-2 border-neo-black bg-neo-white px-3 py-1 text-neo-black">
                      {formatPercent(params.roiVolatility)}
                    </span>
                    <span>{formatPercent(0.25, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="mt-2 text-center text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {t('fields.roiVolatility.range', {
                      range: '68%',
                      lower: formatPercent(params.averageROI - params.roiVolatility),
                      upper: formatPercent(params.averageROI + params.roiVolatility),
                    })}
                  </div>
                </div>
              </ParameterField>
            </CollapsibleSection>

            <CollapsibleSection
              title={t('sections.simulation.inflation.title')}
              description={t('sections.simulation.inflation.description')}
              defaultOpen
            >
              <ParameterField
                label={t('fields.averageInflation.label')}
                tooltip={t('fields.averageInflation.tooltip')}
              >
                <div className="px-2 py-1">
                  <Slider
                    value={[params.averageInflation * 100]}
                    onValueChange={([value]) => handleInputChange('averageInflation', value / 100)}
                    min={1}
                    max={6}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="mt-2 flex justify-between text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <span>{formatPercent(0.01, { maximumFractionDigits: 0 })}</span>
                    <span className="border-2 border-neo-black bg-neo-white px-3 py-1 text-neo-black">
                      {formatPercent(params.averageInflation)}
                    </span>
                    <span>{formatPercent(0.06, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </ParameterField>

              <ParameterField
                label={t('fields.inflationVolatility.label')}
                tooltip={t('fields.inflationVolatility.tooltip')}
              >
                <div className="px-2 py-1">
                  <Slider
                    value={[params.inflationVolatility * 100]}
                    onValueChange={([value]) =>
                      handleInputChange('inflationVolatility', value / 100)
                    }
                    min={0.1}
                    max={3}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="mt-2 flex justify-between text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <span>{formatPercent(0.001, { maximumFractionDigits: 1 })}</span>
                    <span className="border-2 border-neo-black bg-neo-white px-3 py-1 text-neo-black">
                      {formatPercent(params.inflationVolatility)}
                    </span>
                    <span>{formatPercent(0.03, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </ParameterField>
            </CollapsibleSection>

            <CollapsibleSection
              title={t('sections.simulation.quality.title')}
              description={t('sections.simulation.quality.description')}
              defaultOpen={false}
            >
              <ParameterField
                label={t('fields.simulationRuns.label')}
                tooltip={t('fields.simulationRuns.tooltip')}
              >
                <div className="px-2 py-1">
                  <Slider
                    value={[params.simulationRuns]}
                    onValueChange={([value]) => handleInputChange('simulationRuns', value)}
                    min={100}
                    max={10000}
                    step={100}
                    className="w-full"
                  />
                  <div className="mt-2 flex justify-between text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <span>{formatNumber(100)}</span>
                    <span className="border-2 border-neo-black bg-neo-white px-3 py-1 text-neo-black">
                      {formatNumber(params.simulationRuns)}
                    </span>
                    <span>{formatNumber(10000)}</span>
                  </div>
                  <div className="mt-2 text-center text-[0.6rem] font-semibold uppercase tracking-[0.12em]">
                    <span
                      className={
                        params.simulationRuns >= 1000
                          ? 'text-green-600'
                          : params.simulationRuns >= 500
                            ? 'text-yellow-600'
                            : 'text-red-600'
                      }
                    >
                      {params.simulationRuns >= 1000
                        ? t('sections.simulation.quality.level.high')
                        : params.simulationRuns >= 500
                          ? t('sections.simulation.quality.level.medium')
                          : t('sections.simulation.quality.level.low')}
                    </span>
                  </div>
                </div>
              </ParameterField>
            </CollapsibleSection>
          </TabsContent>
            </div>
          </div>
        </Tabs>

        {/* Save/Load/Reset Controls */}
        <div className="mt-8 pt-4 border-t">
          <div className="space-y-4">
            {/* Named Setups */}
            <div className="space-y-2">
              <h4 className="text-[0.75rem] font-extrabold uppercase tracking-[0.18em]">
                {t('saved.title')}
              </h4>
              <div className="flex items-center gap-2">
                <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-10 px-4">
                      <Plus className="mr-2 h-4 w-4" />
                      {t('saved.actions.saveAs')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px] bg-white">
                    <DialogHeader>
                      <DialogTitle>{t('saved.dialog.title')}</DialogTitle>
                      <DialogDescription>{t('saved.dialog.description')}</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <Label htmlFor="setup-name" className="text-sm font-medium">
                        {t('saved.dialog.nameLabel')}
                      </Label>
                      <Input
                        id="setup-name"
                        value={setupName}
                        onChange={(e) => setSetupName(e.target.value)}
                        placeholder={t('saved.dialog.placeholder')}
                        className={`${FIELD_INPUT_CLASS} mt-2`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveSetup()
                        }}
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                        {t('saved.dialog.cancel')}
                      </Button>
                      <Button onClick={handleSaveSetup} disabled={!setupName.trim()}>
                        {t('saved.dialog.confirm')}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Select
                  value={selectedSetupId}
                  onValueChange={(value) => {
                    if (value === '__placeholder') return
                    setSelectedSetupId(value)
                    handleLoadSetup(value)
                  }}
                >
                  <SelectTrigger size="sm" className="flex-1">
                    <SelectValue
                      placeholder={
                        savedSetups.length === 0
                          ? t('saved.empty')
                          : t('saved.actions.loadPlaceholder')
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {savedSetups.length === 0 ? (
                      <SelectItem value="__placeholder" disabled>
                        {t('saved.empty')}
                      </SelectItem>
                    ) : (
                      savedSetups.map((setup) => (
                        <SelectItem key={setup.id} value={setup.id}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-col text-left">
                              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em]">
                                {setup.name}
                              </span>
                              <span className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {new Date(setup.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 border-3 border-neo-black bg-neo-white text-muted-foreground shadow-neo-sm hover:bg-neo-red hover:text-neo-white"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                handleDeleteSetup(setup.id)
                              }}
                              aria-label={t('saved.actions.delete', { name: setup.name })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Reset */}
            <Button size="sm" variant="outline" onClick={handleReset} className="h-10 w-full">
              <RotateCcw className="h-4 w-4 mr-2" />
              {t('saved.actions.reset')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
