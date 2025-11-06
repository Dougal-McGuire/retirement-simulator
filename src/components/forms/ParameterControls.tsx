'use client'

import React from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { useKeyboardShortcuts } from '@/lib/hooks/useKeyboardShortcuts'
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
import { ExpenseList } from '@/components/forms/fields/ExpenseList'
import { EnhancedSlider } from '@/components/forms/fields/EnhancedSlider'
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
import { DEFAULT_PARAMS, SimulationParams, type OneTimeIncome, type CustomExpense } from '@/types'


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
  const uiT = useTranslations('ui')
  const format = useFormatter()
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false)
  const [setupName, setSetupName] = React.useState('')
  const [selectedSetupId, setSelectedSetupId] = React.useState('')
  const [lastLoadedSetup, setLastLoadedSetup] = React.useState<{ name: string; timestamp: number } | null>(null)
  const params = useSimulationParams()
  const updateParams = useUpdateParams()
  const setAutoRunSuspended = useSetAutoRunSuspended()
  const resumeRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keyboard shortcut: Cmd+S / Ctrl+S to open save dialog
  useKeyboardShortcuts([
    {
      key: 's',
      cmd: true,
      handler: () => {
        setSaveDialogOpen(true)
      },
      description: 'Save current setup',
    },
  ])

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
  const customExpenses = params.customExpenses ?? []
  const combinedExpenses = React.useMemo(
    () => calculateCombinedExpenses(params.customExpenses),
    [params.customExpenses]
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
    (value: number, options?: NumberFormatOptions) => {
      const finalOptions = options ? { ...baseCurrencyFormat, ...options } : baseCurrencyFormat
      return format.number(value, finalOptions)
    },
    [baseCurrencyFormat, format]
  )

  const formatPercent = React.useCallback(
    (value: number, options?: NumberFormatOptions) => {
      const finalOptions = options ? { ...basePercentFormat, ...options } : basePercentFormat
      return format.number(value, finalOptions)
    },
    [basePercentFormat, format]
  )

  const formatNumber = React.useCallback(
    (value: number, options?: NumberFormatOptions) => {
      const finalOptions = options ? { ...baseNumberFormat, ...options } : baseNumberFormat
      return format.number(value, finalOptions)
    },
    [baseNumberFormat, format]
  )

  const handleInputChange = (field: keyof SimulationParams, value: number) => {
    suspendAndDebounceResume()
    updateParams({ [field]: value })
  }

  const handleAddExpense = (expense: Omit<CustomExpense, 'id'>) => {
    suspendAndDebounceResume()
    const newExpense: CustomExpense = {
      ...expense,
      id: `expense-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    }
    updateParams({
      customExpenses: [...customExpenses, newExpense],
    })
  }

  const handleUpdateExpense = (id: string, expense: Omit<CustomExpense, 'id'>) => {
    suspendAndDebounceResume()
    updateParams({
      customExpenses: customExpenses.map((e) => (e.id === id ? { ...expense, id } : e)),
    })
  }

  const handleRemoveExpense = (id: string) => {
    suspendAndDebounceResume()
    updateParams({
      customExpenses: customExpenses.filter((e) => e.id !== id),
    })
  }

  const handleReset = () => {
    updateParams(DEFAULT_PARAMS)
  }

  const handleAddOneTimeIncome = (income: OneTimeIncome) => {
    suspendAndDebounceResume()
    const nextIncome: OneTimeIncome = {
      name: income.name,
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
            name: income.name,
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
      const trimmedName = setupName.trim()
      saveSetup(trimmedName)
      // Set the newly saved setup as currently loaded
      setLastLoadedSetup({ name: trimmedName, timestamp: Date.now() })
      setSetupName('')
      setSaveDialogOpen(false)
    }
  }

  const handleLoadSetup = (setupId: string) => {
    if (setupId) {
      const setup = savedSetups.find((s) => s.id === setupId)
      if (setup) {
        loadSetup(setupId)
        setLastLoadedSetup({ name: setup.name, timestamp: setup.timestamp })
        setSelectedSetupId('')
      }
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
              value={investmentPresetKey ?? 'custom'}
              onValueChange={(value) => {
                if (value !== 'custom') {
                  applyInvestmentPreset(value as typeof INVESTMENT_PRESETS[number]['key'])
                }
              }}
            >
              <SelectTrigger size="sm" className="h-auto min-h-10 justify-between bg-neo-white py-2">
                <SelectValue placeholder={t('presets.investment.placeholder')}>
                  {investmentPresetKey ? (
                    <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em]">
                      {t(`presets.investment.items.${investmentPresetKey}.name`)}
                    </span>
                  ) : (
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-neo-black">
                        {t('customConfiguration')}
                      </span>
                      <span className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {formatPercent(params.averageROI)} ROI · σ {formatPercent(params.roiVolatility)}
                      </span>
                    </div>
                  )}
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
              value={inflationPresetKey ?? 'custom'}
              onValueChange={(value) => {
                if (value !== 'custom') {
                  applyInflationPreset(value as typeof INFLATION_PRESETS[number]['key'])
                }
              }}
            >
              <SelectTrigger size="sm" className="h-auto min-h-10 justify-between bg-neo-white py-2">
                <SelectValue placeholder={t('presets.inflation.placeholder')}>
                  {inflationPresetKey ? (
                    <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em]">
                      {t(`presets.inflation.items.${inflationPresetKey}.name`)}
                    </span>
                  ) : (
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-neo-black">
                        {t('customConfiguration')}
                      </span>
                      <span className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {formatPercent(params.averageInflation)} · σ {formatPercent(params.inflationVolatility)}
                      </span>
                    </div>
                  )}
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

                  {/* Enhanced working years display */}
                  <div className="mt-4 border-3 border-neo-black bg-gradient-to-r from-neo-blue/10 to-neo-yellow/10 p-4 shadow-neo-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">
                          {t('workingYearsRemaining')}
                        </div>
                        <div className="text-[1.2rem] font-black uppercase tracking-[0.14em] text-neo-black">
                          {t('workingYears', { count: remainingWorkingYears })}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 text-right">
                        <div className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-neo-blue">
                          {t('accumulationPhase')}
                        </div>
                        <div className="text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          {t('agesRange', { start: params.currentAge, end: params.retirementAge })}
                        </div>
                      </div>
                    </div>

                    {/* Visual timeline */}
                    <div className="mt-3 flex items-center gap-2">
                      <div
                        className="h-2 bg-neo-blue border-2 border-neo-black transition-all duration-300"
                        style={{
                          width: `${Math.max(10, (remainingWorkingYears / (params.endAge - params.currentAge)) * 100)}%`
                        }}
                      />
                      <div
                        className="h-2 flex-1 bg-neo-yellow/30 border-2 border-neo-black"
                      />
                      <div className="text-[0.58rem] font-bold uppercase tracking-[0.1em] text-muted-foreground whitespace-nowrap">
                        {t('retirementYears', { years: params.endAge - params.retirementAge })}
                      </div>
                    </div>
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
                <EnhancedSlider
                  value={params.capitalGainsTax}
                  onChange={(value) => handleInputChange('capitalGainsTax', value)}
                  min={0}
                  max={50}
                  step={0.25}
                  formatValue={(value) =>
                    formatPercent(value / 100, { maximumFractionDigits: 2 })
                  }
                />
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
                  nameLabel: t('fields.oneTimeIncomes.nameLabel'),
                  namePlaceholder: t('fields.oneTimeIncomes.namePlaceholder'),
                  ageLabel: t('fields.oneTimeIncomes.ageLabel'),
                  agePrefix: uiT('age'),
                  amountLabel: t('fields.oneTimeIncomes.amountLabel'),
                  remove: t('fields.oneTimeIncomes.remove'),
                  edit: t('fields.oneTimeIncomes.edit'),
                  save: t('fields.oneTimeIncomes.save'),
                  cancel: t('fields.oneTimeIncomes.cancel'),
                  summaryLabel: t('fields.oneTimeIncomes.summary'),
                  tableHeaders: {
                    name: t('fields.oneTimeIncomes.table.name'),
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
              title={t('sections.financial.expenses.title')}
              description={t('sections.financial.expenses.description', {
                value: formatCurrency(combinedExpenses.combinedAnnual),
              })}
              defaultOpen={false}
            >
              <ExpenseList
                expenses={customExpenses}
                strings={{
                  addButton: t('fields.expenses.add'),
                  empty: t('fields.expenses.empty'),
                  nameLabel: t('fields.expenses.nameLabel'),
                  namePlaceholder: t('fields.expenses.namePlaceholder'),
                  amountLabel: t('fields.expenses.amountLabel'),
                  intervalLabel: t('fields.expenses.intervalLabel'),
                  intervalMonthly: t('fields.expenses.intervalMonthly'),
                  intervalAnnual: t('fields.expenses.intervalAnnual'),
                  remove: t('fields.expenses.remove'),
                  edit: t('fields.expenses.edit'),
                  save: t('fields.expenses.save'),
                  cancel: t('fields.expenses.cancel'),
                  summaryLabel: t('fields.expenses.summary'),
                  tableHeaders: {
                    name: t('fields.expenses.table.name'),
                    amount: t('fields.expenses.table.amount'),
                    interval: t('fields.expenses.table.interval'),
                    actions: t('fields.expenses.table.actions'),
                  },
                }}
                onAdd={handleAddExpense}
                onUpdate={handleUpdateExpense}
                onRemove={handleRemoveExpense}
                formatCurrency={(value) => formatCurrency(value)}
              />
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
                <EnhancedSlider
                  value={params.averageROI * 100}
                  onChange={(value) => handleInputChange('averageROI', value / 100)}
                  min={3}
                  max={12}
                  step={0.5}
                  formatValue={(value) => formatPercent(value / 100)}
                />
              </ParameterField>

              <ParameterField
                label={t('fields.roiVolatility.label')}
                tooltip={t('fields.roiVolatility.tooltip')}
              >
                <div className="space-y-2">
                  <EnhancedSlider
                    value={params.roiVolatility * 100}
                    onChange={(value) => handleInputChange('roiVolatility', value / 100)}
                    min={2}
                    max={25}
                    step={0.5}
                    formatValue={(value) => formatPercent(value / 100)}
                    hint={`σ = ${formatPercent(params.roiVolatility)}`}
                  />
                  <div className="text-center text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground border-2 border-neo-black bg-neo-blue/5 px-3 py-2">
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
                <EnhancedSlider
                  value={params.averageInflation * 100}
                  onChange={(value) => handleInputChange('averageInflation', value / 100)}
                  min={1}
                  max={6}
                  step={0.1}
                  formatValue={(value) => formatPercent(value / 100)}
                />
              </ParameterField>

              <ParameterField
                label={t('fields.inflationVolatility.label')}
                tooltip={t('fields.inflationVolatility.tooltip')}
              >
                <EnhancedSlider
                  value={params.inflationVolatility * 100}
                  onChange={(value) => handleInputChange('inflationVolatility', value / 100)}
                  min={0.1}
                  max={3}
                  step={0.1}
                  formatValue={(value) => formatPercent(value / 100)}
                />
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
                <div className="space-y-2">
                  <EnhancedSlider
                    value={params.simulationRuns}
                    onChange={(value) => handleInputChange('simulationRuns', value)}
                    min={100}
                    max={10000}
                    step={100}
                    formatValue={(value) => formatNumber(value)}
                  />
                  <div className="text-center border-2 border-neo-black px-3 py-2">
                    <span
                      className={`text-[0.68rem] font-extrabold uppercase tracking-[0.12em] ${
                        params.simulationRuns >= 1000
                          ? 'text-green-600'
                          : params.simulationRuns >= 500
                            ? 'text-yellow-600'
                            : 'text-red-600'
                      }`}
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
              {lastLoadedSetup && (
                <div className="rounded-md border-2 border-neo-black bg-neo-blue/10 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {t('currentlyLoaded')}
                      </span>
                      <span className="text-[0.72rem] font-bold uppercase tracking-[0.12em] text-neo-black">
                        {lastLoadedSetup.name}
                      </span>
                    </div>
                    <span className="text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {format.dateTime(new Date(lastLoadedSetup.timestamp), {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              )}
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
                <div className="flex-1">
                  <Select
                    value={selectedSetupId}
                    onValueChange={(value) => {
                      if (value === '__placeholder') return
                      setSelectedSetupId(value)
                      handleLoadSetup(value)
                    }}
                    disabled={savedSetups.length === 0}
                  >
                    <SelectTrigger size="sm" className="flex-1 h-10 w-full">
                      <SelectValue
                        placeholder={
                          savedSetups.length === 0 ? (
                            t('noSavedSetups')
                          ) : (
                            t('saved.actions.loadPlaceholder')
                          )
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {savedSetups.length === 0 ? (
                        <SelectItem value="__placeholder" disabled>
                          <div className="py-2 text-center">
                            <div className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                              {t('noSetupsYet')}
                            </div>
                            <div className="mt-1 text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                              {t('saveAsHint')}
                            </div>
                          </div>
                        </SelectItem>
                      ) : (
                        savedSetups.map((setup) => (
                          <SelectItem
                            key={setup.id}
                            value={setup.id}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div
                                className="flex items-center gap-2 flex-1"
                                onClick={() => handleLoadSetup(setup.id)}
                              >
                                <div className="rounded border-2 border-neo-black bg-neo-blue/10 p-1">
                                  <svg
                                    className="h-3 w-3 text-neo-blue"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2.5}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                                    />
                                  </svg>
                                </div>
                                <div className="flex flex-col text-left">
                                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em]">
                                    {setup.name}
                                  </span>
                                  <div className="flex items-center gap-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                    <svg
                                      className="h-2.5 w-2.5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={2.5}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                    {new Date(setup.timestamp).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-neo-white text-muted-foreground shadow-neo-sm hover:bg-neo-red hover:text-neo-white transition-colors"
                                onMouseDown={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  handleDeleteSetup(setup.id)
                                }}
                                aria-label={t('saved.actions.delete', { name: setup.name })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
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
