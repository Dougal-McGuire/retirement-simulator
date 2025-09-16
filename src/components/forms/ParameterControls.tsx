'use client'

import React from 'react'
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
import { Badge } from '@/components/ui/badge'
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
import { formatNumber } from '@/lib/utils'

// Preset configurations
const INVESTMENT_PRESETS = [
  {
    key: 'defensive',
    name: 'Defensive 60/40',
    description: 'Global 60/40 portfolio, 1994-2024 avg ~5.5% nominal',
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
    name: 'Historical Average',
    description: 'MSCI World rolling 30-year average ~7.5%',
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
    name: 'High Growth',
    description: 'US equities bull phase average ~9.5%',
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
    name: 'Low Inflation',
    description: 'Developed markets 1990s avg ~1.8%',
    icon: ThermometerSun,
    color: 'bg-sky-100 text-sky-800 border-sky-200',
    values: {
      averageInflation: 0.018,
      inflationVolatility: 0.005,
    },
  },
  {
    key: 'target',
    name: 'Central Bank Target',
    description: '2-3% target range with mild swings',
    icon: Activity,
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    values: {
      averageInflation: 0.025,
      inflationVolatility: 0.008,
    },
  },
  {
    key: 'elevated',
    name: 'Elevated Prices',
    description: 'Post-2020 spikes ~3.5% average',
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
        <CardTitle className="text-lg">Simulation Parameters</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Scenario Presets */}
        <div className="mb-6 space-y-5">
          <div>
            <h4 className="text-sm font-semibold mb-1">Investment Performance</h4>
            <p className="text-xs text-gray-500 mb-3">Based on rolling 30-year averages for diversified developed-market portfolios.</p>
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
                        <div className="font-medium text-sm truncate">{preset.name}</div>
                        <div className="text-xs text-gray-500 truncate">{preset.description}</div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 text-xs text-gray-600">
                        <span className="font-semibold text-gray-800">
                          {(preset.values.averageROI * 100).toFixed(1)}%
                        </span>
                        <span>σ {(preset.values.roiVolatility * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </Button>
                )
              })}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-1">Inflation Expectations</h4>
            <p className="text-xs text-gray-500 mb-3">Anchored to recent developed-market CPI trends.</p>
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
                        <div className="font-medium text-sm truncate">{preset.name}</div>
                        <div className="text-xs text-gray-500 truncate">{preset.description}</div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 text-xs text-gray-600">
                        <span className="font-semibold text-gray-800">
                          {(preset.values.averageInflation * 100).toFixed(1)}%
                        </span>
                        <span>σ {(preset.values.inflationVolatility * 100).toFixed(1)}%</span>
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
              Personal
            </TabsTrigger>
            <TabsTrigger value="financial" className="text-xs">
              Financial
            </TabsTrigger>
            <TabsTrigger value="simulation" className="text-xs">
              Simulation
            </TabsTrigger>
          </TabsList>

          {/* Personal Information Tab */}
          <TabsContent value="personal" className="space-y-4">
            <CollapsibleSection
              title="Age & Timeline"
              description="Set age and retirement timeline"
              defaultOpen={true}
            >
              <ParameterField
                label="Current Age"
                tooltip="Your current age for planning purposes. This determines how many working years remain until retirement."
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
                label="Desired Retirement Age"
                tooltip="When you want to stop working and live off investments. Earlier retirement requires more aggressive savings."
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
                    <span>55</span>
                    <span className="font-semibold text-blue-600">
                      {params.retirementAge} years
                    </span>
                    <span>70</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 text-center">
                    {params.retirementAge - params.currentAge} working years remaining
                  </div>
                </div>
              </ParameterField>

              <ParameterField
                label="Legal Retirement Age"
                tooltip="Official retirement age when pension benefits begin. In Germany this is typically 67 years old."
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
                label="Planning Until Age"
                tooltip="Age until which to run the simulation. Typically life expectancy (85) plus buffer. Longer planning periods require more conservative withdrawals."
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
              title="Assets & Savings"
              description="Current wealth and future savings capacity"
              defaultOpen={true}
            >
              <ParameterField
                label="Current Assets (€)"
                tooltip="Total value of your current investments, savings, and retirement accounts. This is your starting point for wealth accumulation."
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
                label="Annual Savings (€)"
                tooltip="How much you can save and invest each year until retirement. Higher savings rates lead to earlier retirement possibilities."
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
              title="Pension & Taxes"
              description="Government pension and tax considerations"
              defaultOpen={true}
            >
              <ParameterField
                label="Monthly Pension (€)"
                tooltip="Expected monthly pension from the government system, starting at legal retirement age. This reduces your required private savings."
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
                label="Capital Gains Tax"
                tooltip="Tax rate on investment gains when selling to cover expenses. German rate: 26.375%. This affects your net withdrawal rates."
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
                    <span>0%</span>
                    <span className="font-semibold text-blue-600">
                      {params.capitalGainsTax.toFixed(2)}%
                    </span>
                    <span>50%</span>
                  </div>
                </div>
              </ParameterField>
            </CollapsibleSection>

            <CollapsibleSection
              title="Monthly Expenses"
              description={`€${Object.values(params.monthlyExpenses).reduce((sum, expense) => sum + expense, 0)} total monthly`}
              defaultOpen={false}
            >
              <div className="space-y-2">
                {Object.entries(params.monthlyExpenses).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-xs capitalize">{key}</Label>
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
                      <span>Combined Monthly:</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-xs bg-gray-900 text-white border border-gray-700"
                          >
                            <p className="text-xs">
                              Includes monthly expenses + 1/12th of annual expenses
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <span>
                      €
                      {calculateCombinedExpenses(
                        params.monthlyExpenses,
                        params.annualExpenses
                      ).combinedMonthly.toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="Annual Expenses"
              description={`€${Object.values(params.annualExpenses).reduce((sum, expense) => sum + expense, 0)} total annual`}
              defaultOpen={false}
            >
              <div className="space-y-2">
                {Object.entries(params.annualExpenses).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-xs capitalize">
                      {key.replace('Maintenance', 'Maint.')}
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
                      <span>Combined Annual:</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-xs bg-gray-900 text-white border border-gray-700"
                          >
                            <p className="text-xs">
                              Includes (monthly expenses × 12) + annual expenses
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <span>
                      €
                      {calculateCombinedExpenses(
                        params.monthlyExpenses,
                        params.annualExpenses
                      ).combinedAnnual.toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          </TabsContent>

          {/* Simulation Parameters Tab */}
          <TabsContent value="simulation" className="space-y-4">
            <CollapsibleSection
              title="Market Returns"
              description="Investment performance assumptions"
              defaultOpen={true}
            >
              <ParameterField
                label="Average ROI"
                tooltip="Expected annual return on investments. Historical stock market: ~7-10%. Bond portfolio: ~3-5%. Diversified portfolio: ~6-8%."
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
                    <span>3%</span>
                    <span className="font-semibold text-blue-600">
                      {(params.averageROI * 100).toFixed(1)}%
                    </span>
                    <span>12%</span>
                  </div>
                </div>
              </ParameterField>

              <ParameterField
                label="ROI Volatility"
                tooltip="Standard deviation of returns. Higher volatility = more uncertainty. Conservative: 5-10%, Moderate: 10-15%, Aggressive: 15-25%."
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
                    <span>2%</span>
                    <span className="font-semibold text-blue-600">
                      {(params.roiVolatility * 100).toFixed(1)}%
                    </span>
                    <span>25%</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1 text-center">
                    68% of returns: {((params.averageROI - params.roiVolatility) * 100).toFixed(1)}%
                    to {((params.averageROI + params.roiVolatility) * 100).toFixed(1)}%
                  </div>
                </div>
              </ParameterField>
            </CollapsibleSection>

            <CollapsibleSection
              title="Inflation Assumptions"
              description="How costs increase over time"
              defaultOpen={true}
            >
              <ParameterField
                label="Average Inflation"
                tooltip="Expected annual inflation rate. ECB target: 2%. Historical average in developed countries: 2-3%."
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
                    <span>1%</span>
                    <span className="font-semibold text-blue-600">
                      {(params.averageInflation * 100).toFixed(1)}%
                    </span>
                    <span>6%</span>
                  </div>
                </div>
              </ParameterField>

              <ParameterField
                label="Inflation Volatility"
                tooltip="How much inflation varies year-to-year. Historical range: 0.5-1.5%. Higher volatility creates more uncertainty in retirement costs."
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
                    <span>0.1%</span>
                    <span className="font-semibold text-blue-600">
                      {(params.inflationVolatility * 100).toFixed(1)}%
                    </span>
                    <span>3%</span>
                  </div>
                </div>
              </ParameterField>
            </CollapsibleSection>

            <CollapsibleSection
              title="Simulation Quality"
              description="Accuracy vs performance trade-off"
              defaultOpen={false}
            >
              <ParameterField
                label="Number of Runs"
                tooltip="Monte Carlo simulations to run. More runs = higher accuracy but slower computation. 1000+ recommended for reliable results."
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
                    <span>100</span>
                    <span className="font-semibold text-blue-600">
                      {formatNumber(params.simulationRuns)}
                    </span>
                    <span>10K</span>
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
                        ? 'High accuracy'
                        : params.simulationRuns >= 500
                          ? 'Medium accuracy'
                          : 'Low accuracy'}
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
              <h4 className="text-sm font-semibold">Saved Setups</h4>
              <div className="flex gap-2 items-center">
                <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Save As...
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px] bg-white">
                    <DialogHeader>
                      <DialogTitle>Save Setup</DialogTitle>
                      <DialogDescription>
                        Give your current parameters a name for easy access later.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <Label htmlFor="setup-name" className="text-sm font-medium">
                        Setup Name
                      </Label>
                      <Input
                        id="setup-name"
                        value={setupName}
                        onChange={(e) => setSetupName(e.target.value)}
                        placeholder="e.g., Conservative Plan, Aggressive Growth"
                        className="mt-2"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveSetup()
                        }}
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveSetup} disabled={!setupName.trim()}>
                        Save Setup
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
                    <SelectValue placeholder={savedSetups.length === 0 ? 'No saved setups' : 'Load setup...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {savedSetups.length === 0 ? (
                      <SelectItem value="__placeholder" disabled>
                        No saved setups yet
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
                              aria-label={`Delete ${setup.name}`}
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
              Reset to Defaults
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
