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
import {
  RotateCcw,
  HelpCircle,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  Zap,
  Shield,
  TrendingUp,
  Activity,
  ThermometerSun,
  Wind,
} from 'lucide-react'
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
import { DEFAULT_PARAMS, SimulationParams } from '@/types'

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
    icon: Shield,
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    values: {
      averageROI: 0.055,
      roiVolatility: 0.1,
      simulationRuns: 5000,
    },
  },
  {
    key: 'historical',
    icon: TrendingUp,
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    values: {
      averageROI: 0.075,
      roiVolatility: 0.15,
      simulationRuns: 6000,
    },
  },
  {
    key: 'growth',
    icon: Zap,
    color: 'bg-orange-100 text-orange-800 border-orange-200',
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
    icon: ThermometerSun,
    color: 'bg-sky-100 text-sky-800 border-sky-200',
    values: {
      averageInflation: 0.018,
      inflationVolatility: 0.005,
    },
  },
  {
    key: 'target',
    icon: Activity,
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    values: {
      averageInflation: 0.025,
      inflationVolatility: 0.008,
    },
  },
  {
    key: 'elevated',
    icon: Wind,
    color: 'bg-rose-100 text-rose-800 border-rose-200',
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

// Helper component for parameters with tooltips
interface ParameterFieldProps {
  label: string
  tooltip: string
  children: React.ReactNode
}

function ParameterField({ label, tooltip, children }: ParameterFieldProps) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-1">
        <Label className="text-xs font-semibold">{label}</Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3 w-3 text-gray-400 cursor-help" />
            </TooltipTrigger>
            <TooltipContent
              side="right"
              className="max-w-xs bg-gray-900 text-white border border-gray-700"
            >
              <p className="text-xs">{tooltip}</p>
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
          variant="ghost"
          className="w-full justify-between p-0 h-auto font-medium text-sm hover:bg-transparent"
        >
          <div className="flex flex-col items-start">
            <span className="text-gray-900">{title}</span>
            {description && (
              <span className="text-xs text-gray-500 font-normal">{description}</span>
            )}
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="space-y-3 border-l-2 border-gray-100 pl-4 ml-2">{children}</div>
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
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Scenario Presets */}
        <div className="mb-6 space-y-5">
          <div>
            <h4 className="text-sm font-semibold mb-1">{t('presets.investment.title')}</h4>
            <p className="text-xs text-gray-500 mb-3">{t('presets.investment.description')}</p>
            <div className="grid grid-cols-1 gap-2">
              {INVESTMENT_PRESETS.map((preset) => {
                const IconComponent = preset.icon
                return (
                  <Button
                    key={preset.key}
                    variant="outline"
                    onClick={() => applyInvestmentPreset(preset.key)}
                    className="h-auto p-2 justify-start hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2 w-full min-w-0">
                      <div className={`p-1.5 rounded-full shrink-0 ${preset.color}`}>
                        <IconComponent className="h-3 w-3" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {t(`presets.investment.items.${preset.key}.name`)}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {t(`presets.investment.items.${preset.key}.description`)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 text-xs text-gray-600">
                        <span className="font-semibold text-gray-800">
                          {formatPercent(preset.values.averageROI)}
                        </span>
                        <span>σ {formatPercent(preset.values.roiVolatility)}</span>
                      </div>
                    </div>
                  </Button>
                )
              })}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-1">{t('presets.inflation.title')}</h4>
            <p className="text-xs text-gray-500 mb-3">{t('presets.inflation.description')}</p>
            <div className="grid grid-cols-1 gap-2">
              {INFLATION_PRESETS.map((preset) => {
                const IconComponent = preset.icon
                return (
                  <Button
                    key={preset.key}
                    variant="outline"
                    onClick={() => applyInflationPreset(preset.key)}
                    className="h-auto p-2 justify-start hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2 w-full min-w-0">
                      <div className={`p-1.5 rounded-full shrink-0 ${preset.color}`}>
                        <IconComponent className="h-3 w-3" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {t(`presets.inflation.items.${preset.key}.name`)}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {t(`presets.inflation.items.${preset.key}.description`)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 text-xs text-gray-600">
                        <span className="font-semibold text-gray-800">
                          {formatPercent(preset.values.averageInflation)}
                        </span>
                        <span>σ {formatPercent(preset.values.inflationVolatility)}</span>
                      </div>
                    </div>
                  </Button>
                )
              })}
            </div>
          </div>
        </div>

        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="personal" className="text-xs">
              {t('tabs.personal')}
            </TabsTrigger>
            <TabsTrigger value="financial" className="text-xs">
              {t('tabs.financial')}
            </TabsTrigger>
            <TabsTrigger value="simulation" className="text-xs">
              {t('tabs.simulation')}
            </TabsTrigger>
          </TabsList>

          {/* Personal Information Tab */}
          <TabsContent value="personal" className="space-y-4">
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
                  className="h-8 text-sm"
                  min={18}
                  max={80}
                />
              </ParameterField>

              <ParameterField
                label={t('fields.retirementAge.label')}
                tooltip={t('fields.retirementAge.tooltip')}
              >
                <div className="px-2 py-1">
                  <Slider
                    value={[params.retirementAge]}
                    onValueChange={([value]) => handleInputChange('retirementAge', value)}
                    min={55}
                    max={70}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{formatNumber(55)}</span>
                    <span className="font-semibold text-blue-600">
                      {t('fields.retirementAge.valueLabel', {
                        value: formatNumber(params.retirementAge),
                      })}
                    </span>
                    <span>{formatNumber(70)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 text-center">
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
                  className="h-8 text-sm"
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
                  className="h-8 text-sm"
                  min={70}
                  max={100}
                />
              </ParameterField>
            </CollapsibleSection>
          </TabsContent>

          {/* Financial Parameters Tab */}
          <TabsContent value="financial" className="space-y-4">
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
                  className="h-8 text-sm"
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
                  className="h-8 text-sm"
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
                  className="h-8 text-sm"
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
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{formatPercent(0, { maximumFractionDigits: 0 })}</span>
                    <span className="font-semibold text-blue-600">
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
              title={t('sections.financial.monthly.title')}
              description={t('sections.financial.monthly.description', {
                value: formatCurrency(totalMonthlyExpenses),
              })}
              defaultOpen={false}
            >
              <div className="space-y-2">
                {Object.entries(params.monthlyExpenses).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-xs capitalize">
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
                      className="h-7 w-20 text-xs"
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
                            className="max-w-xs bg-gray-900 text-white border border-gray-700"
                          >
                            <p className="text-xs">{t('sections.financial.monthly.tooltip')}</p>
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
                    <Label className="text-xs capitalize">
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
                      className="h-7 w-20 text-xs"
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
                            className="max-w-xs bg-gray-900 text-white border border-gray-700"
                          >
                            <p className="text-xs">{t('sections.financial.annual.tooltip')}</p>
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
          <TabsContent value="simulation" className="space-y-4">
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
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{formatPercent(0.03, { maximumFractionDigits: 0 })}</span>
                    <span className="font-semibold text-blue-600">
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
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{formatPercent(0.02, { maximumFractionDigits: 0 })}</span>
                    <span className="font-semibold text-blue-600">
                      {formatPercent(params.roiVolatility)}
                    </span>
                    <span>{formatPercent(0.25, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 text-center">
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
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{formatPercent(0.01, { maximumFractionDigits: 0 })}</span>
                    <span className="font-semibold text-blue-600">
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
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{formatPercent(0.001, { maximumFractionDigits: 1 })}</span>
                    <span className="font-semibold text-blue-600">
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
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>{formatNumber(100)}</span>
                    <span className="font-semibold text-blue-600">
                      {formatNumber(params.simulationRuns)}
                    </span>
                    <span>{formatNumber(10000)}</span>
                  </div>
                  <div className="text-xs text-center mt-1">
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
        </Tabs>

        {/* Save/Load/Reset Controls */}
        <div className="mt-8 pt-4 border-t">
          <div className="space-y-4">
            {/* Named Setups */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t('saved.title')}</h4>
              <div className="flex gap-2 items-center">
                <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
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
                        className="mt-2"
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
                  <SelectTrigger className="flex-1 h-9">
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
                              <span className="font-medium">{setup.name}</span>
                              <span className="text-xs text-gray-500">
                                {new Date(setup.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50"
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
            <Button size="sm" variant="outline" onClick={handleReset} className="w-full">
              <RotateCcw className="h-4 w-4 mr-2" />
              {t('saved.actions.reset')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
