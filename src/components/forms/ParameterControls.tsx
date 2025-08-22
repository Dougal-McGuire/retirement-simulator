'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Save, Upload, RotateCcw } from 'lucide-react'
import { useSimulationParams, useUpdateParams, useSaveToStorage, useLoadFromStorage } from '@/lib/stores/simulationStore'
import { DEFAULT_PARAMS, SimulationParams } from '@/types'

export function ParameterControls() {
  const params = useSimulationParams()
  const updateParams = useUpdateParams()
  const saveToStorage = useSaveToStorage()
  const loadFromStorage = useLoadFromStorage()

  const [importJson, setImportJson] = useState('')

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

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importJson) as Partial<SimulationParams>
      updateParams(parsed)
      setImportJson('')
    } catch (error) {
      alert('Invalid JSON format')
    }
  }

  const handleExport = () => {
    const jsonString = JSON.stringify(params, null, 2)
    navigator.clipboard.writeText(jsonString)
    alert('Parameters copied to clipboard!')
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Simulation Parameters</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={saveToStorage}>
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={loadFromStorage}>
            <Upload className="h-4 w-4 mr-1" />
            Load
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="personal" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="personal" className="text-xs">Personal</TabsTrigger>
            <TabsTrigger value="financial" className="text-xs">Financial</TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold">Current Age</Label>
                <Input
                  type="number"
                  value={params.currentAge}
                  onChange={(e) => handleInputChange('currentAge', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Retirement Age</Label>
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
              </div>

              <div>
                <Label className="text-xs font-semibold">Legal Retirement Age</Label>
                <Input
                  type="number"
                  value={params.legalRetirementAge}
                  onChange={(e) => handleInputChange('legalRetirementAge', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="financial" className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold">Current Assets (€)</Label>
                <Input
                  type="number"
                  value={params.currentAssets}
                  onChange={(e) => handleInputChange('currentAssets', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Annual Savings (€)</Label>
                <Input
                  type="number"
                  value={params.annualSavings}
                  onChange={(e) => handleInputChange('annualSavings', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Monthly Pension (€)</Label>
                <Input
                  type="number"
                  value={params.monthlyPension}
                  onChange={(e) => handleInputChange('monthlyPension', parseInt(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Average ROI</Label>
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
              </div>

              <div>
                <Label className="text-xs font-semibold">Average Inflation</Label>
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
              </div>
            </div>
          </TabsContent>
        </Tabs>

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
            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm font-semibold">
                <span>Total Monthly:</span>
                <span>€{Object.values(params.monthlyExpenses).reduce((sum, expense) => sum + expense, 0)}</span>
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
            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm font-semibold">
                <span>Total Annual:</span>
                <span>€{Object.values(params.annualExpenses).reduce((sum, expense) => sum + expense, 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Simulation Settings */}
        <div className="mt-6">
          <h4 className="text-sm font-semibold mb-3">Simulation</h4>
          <div>
            <Label className="text-xs font-semibold">Number of Runs</Label>
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
          </div>
        </div>

        {/* Export/Import */}
        <div className="mt-6">
          <h4 className="text-sm font-semibold mb-3">Export/Import</h4>
          <div className="space-y-2">
            <Button size="sm" variant="outline" onClick={handleExport} className="w-full">
              Copy Parameters to Clipboard
            </Button>
            <textarea
              placeholder="Paste parameters JSON here..."
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              className="w-full h-20 text-xs p-2 border rounded resize-none"
            />
            <Button size="sm" onClick={handleImport} disabled={!importJson.trim()} className="w-full">
              Import Parameters
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}