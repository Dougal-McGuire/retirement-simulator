'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { RotateCcw, HelpCircle, Trash2, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSimulationParams, useUpdateParams, useSaveSetup, useLoadSetup, useDeleteSetup, useSavedSetups } from '@/lib/stores/simulationStore'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { DEFAULT_PARAMS, SimulationParams } from '@/types'

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
            <TooltipContent side="right" className="max-w-xs bg-gray-900 text-white border border-gray-700">
              <p className="text-xs">{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {children}
    </div>
  )
}

export function ParameterControls() {
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false)
  const [setupName, setSetupName] = React.useState('')
  const [selectedSetupId, setSelectedSetupId] = React.useState<string>('')
  
  const params = useSimulationParams()
  const updateParams = useUpdateParams()
  const saveSetup = useSaveSetup()
  const loadSetup = useLoadSetup()
  const deleteSetup = useDeleteSetup()
  const savedSetups = useSavedSetups()

  const handleInputChange = (field: keyof SimulationParams, value: number) => {
    updateParams({ [field]: value })
  }

  const handleExpenseChange = (category: keyof SimulationParams['monthlyExpenses'], value: number) => {
    updateParams({
      monthlyExpenses: {
        ...params.monthlyExpenses,
        [category]: value
      }
    })
  }

  const handleAnnualExpenseChange = (category: keyof SimulationParams['annualExpenses'], value: number) => {
    updateParams({
      annualExpenses: {
        ...params.annualExpenses,
        [category]: value
      }
    })
  }

  const handleReset = () => {
    updateParams(DEFAULT_PARAMS)
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

  const handleDeleteSetup = (setupId: string, e: React.MouseEvent) => {
    e.stopPropagation()
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
        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
            <TabsTrigger value="financial" className="text-xs">Financial</TabsTrigger>
            <TabsTrigger value="simulation" className="text-xs">Simulation</TabsTrigger>
          </TabsList>

          {/* Personal Information Tab */}
          <TabsContent value="personal" className="space-y-4">
            <div className="space-y-3">
              <ParameterField 
                label="Current Age" 
                tooltip="Your current age for planning purposes"
              >
                <Input
                  type="number"
                  value={params.currentAge}
                  onChange={(e) => handleInputChange('currentAge', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </ParameterField>

              <ParameterField 
                label="Desired Retirement Age" 
                tooltip="When you want to stop working and live off investments"
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
                    <span className="font-semibold">{params.retirementAge}</span>
                    <span>70</span>
                  </div>
                </div>
              </ParameterField>

              <ParameterField 
                label="Legal Retirement Age" 
                tooltip="Official retirement age when pension benefits begin (e.g., 67 in Germany)"
              >
                <Input
                  type="number"
                  value={params.legalRetirementAge}
                  onChange={(e) => handleInputChange('legalRetirementAge', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </ParameterField>

              <ParameterField 
                label="Planning Until Age" 
                tooltip="Age until which to run the simulation (life expectancy + buffer)"
              >
                <Input
                  type="number"
                  value={params.endAge}
                  onChange={(e) => handleInputChange('endAge', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </ParameterField>
            </div>
          </TabsContent>

          {/* Financial Parameters Tab */}
          <TabsContent value="financial" className="space-y-4">
            <div className="space-y-3">
              <ParameterField 
                label="Current Assets (€)" 
                tooltip="Total value of your current investments and savings"
              >
                <Input
                  type="number"
                  value={params.currentAssets}
                  onChange={(e) => handleInputChange('currentAssets', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </ParameterField>

              <ParameterField 
                label="Annual Savings (€)" 
                tooltip="How much you save/invest per year until retirement"
              >
                <Input
                  type="number"
                  value={params.annualSavings}
                  onChange={(e) => handleInputChange('annualSavings', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </ParameterField>

              <ParameterField 
                label="Monthly Pension (€)" 
                tooltip="Expected monthly pension from legal retirement age onwards"
              >
                <Input
                  type="number"
                  value={params.monthlyPension}
                  onChange={(e) => handleInputChange('monthlyPension', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </ParameterField>

              <ParameterField 
                label="Capital Gains Tax" 
                tooltip="Tax rate on investment gains when selling to cover expenses (26.25% = German rate)"
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
                    <span className="font-semibold">{params.capitalGainsTax.toFixed(2)}%</span>
                    <span>50%</span>
                  </div>
                </div>
              </ParameterField>
            </div>

            {/* Monthly Expenses */}
            <div className="mt-6">
              <h4 className="text-sm font-semibold mb-3">Monthly Expenses (€)</h4>
              <div className="space-y-2">
                {Object.entries(params.monthlyExpenses).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-xs capitalize">{key}</Label>
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) => handleExpenseChange(key as keyof typeof params.monthlyExpenses, parseInt(e.target.value))}
                      className="h-7 w-20 text-xs"
                    />
                  </div>
                ))}
                <div className="pt-2 border-t space-y-1">
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Monthly Only:</span>
                    <span>€{Object.values(params.monthlyExpenses).reduce((sum, expense) => sum + expense, 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-blue-600">
                    <div className="flex items-center gap-1">
                      <span>Total Monthly:</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs bg-gray-900 text-white border border-gray-700">
                            <p className="text-xs">Includes monthly expenses + 1/12th of annual expenses</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <span>€{calculateCombinedExpenses(params.monthlyExpenses, params.annualExpenses).combinedMonthly.toFixed(0)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Annual Expenses */}
            <div className="mt-6">
              <h4 className="text-sm font-semibold mb-3">Annual Expenses (€)</h4>
              <div className="space-y-2">
                {Object.entries(params.annualExpenses).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-xs capitalize">{key.replace('Maintenance', 'Maint.')}</Label>
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) => handleAnnualExpenseChange(key as keyof typeof params.annualExpenses, parseInt(e.target.value))}
                      className="h-7 w-20 text-xs"
                    />
                  </div>
                ))}
                <div className="pt-2 border-t space-y-1">
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Annual Only:</span>
                    <span>€{Object.values(params.annualExpenses).reduce((sum, expense) => sum + expense, 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-blue-600">
                    <div className="flex items-center gap-1">
                      <span>Total Annual:</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs bg-gray-900 text-white border border-gray-700">
                            <p className="text-xs">Includes (monthly expenses × 12) + annual expenses</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <span>€{calculateCombinedExpenses(params.monthlyExpenses, params.annualExpenses).combinedAnnual.toFixed(0)}</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Simulation Parameters Tab */}
          <TabsContent value="simulation" className="space-y-4">
            <div className="space-y-3">
              <ParameterField 
                label="Average ROI" 
                tooltip="Expected annual return on investments (7% = diversified stock portfolio)"
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
                    <span className="font-semibold">{(params.averageROI * 100).toFixed(1)}%</span>
                    <span>12%</span>
                  </div>
                </div>
              </ParameterField>

              <ParameterField 
                label="ROI Volatility" 
                tooltip="Absolute standard deviation of returns (percentage points). 15% volatility with 7% average ROI means 68% of returns fall between -8% to +22%. Conservative: 5-10%, Aggressive: 15-20%"
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
                    <span className="font-semibold">{(params.roiVolatility * 100).toFixed(1)}%</span>
                    <span>25%</span>
                  </div>
                </div>
              </ParameterField>

              <ParameterField 
                label="Average Inflation" 
                tooltip="Expected annual inflation rate (affects expense growth over time)"
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
                    <span className="font-semibold">{(params.averageInflation * 100).toFixed(1)}%</span>
                    <span>6%</span>
                  </div>
                </div>
              </ParameterField>

              <ParameterField 
                label="Inflation Volatility" 
                tooltip="Absolute standard deviation of inflation (percentage points). 1% volatility with 3% average inflation means 68% of inflation rates fall between 2% to 4%. Historical average: ~1%"
              >
                <div className="px-2 py-1">
                  <Slider
                    value={[params.inflationVolatility * 100]}
                    onValueChange={([value]) => handleInputChange('inflationVolatility', value / 100)}
                    min={0.1}
                    max={3}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0.1%</span>
                    <span className="font-semibold">{(params.inflationVolatility * 100).toFixed(1)}%</span>
                    <span>3%</span>
                  </div>
                </div>
              </ParameterField>

              <ParameterField 
                label="Number of Runs" 
                tooltip="How many simulation scenarios to run. More runs = more accurate but slower"
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
                    <span className="font-semibold">{params.simulationRuns}</span>
                    <span>10K</span>
                  </div>
                </div>
              </ParameterField>
            </div>
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
                    <Button size="sm" variant="outline" className="flex-1">
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

                <Select value={selectedSetupId} onValueChange={handleLoadSetup}>
                  <SelectTrigger className="flex-1 h-9">
                    <SelectValue placeholder="Load setup..." />
                  </SelectTrigger>
                  <SelectContent>
                    {savedSetups.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No saved setups
                      </SelectItem>
                    ) : (
                      savedSetups.map((setup) => (
                        <SelectItem key={setup.id} value={setup.id}>
                          <div className="flex items-center justify-between w-full">
                            <div className="flex flex-col">
                              <span className="font-medium">{setup.name}</span>
                              <span className="text-xs text-gray-500">
                                {new Date(setup.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 ml-2 hover:bg-red-50 hover:text-red-600"
                              onClick={(e) => handleDeleteSetup(setup.id, e)}
                            >
                              <Trash2 className="h-3 w-3" />
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