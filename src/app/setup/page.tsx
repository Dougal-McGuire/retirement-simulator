'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { PersonalInfoStep, AssetsIncomeStep, MonthlyExpensesStep, AnnualExpensesStep, MarketAssumptionsStep } from '@/types'

const STEPS = [
  { id: 'personal', title: 'Personal Information', description: 'Your age and retirement timeline' },
  { id: 'assets', title: 'Assets & Income', description: 'Current assets and savings plan' },
  { id: 'monthly', title: 'Monthly Expenses', description: 'Regular monthly costs' },
  { id: 'annual', title: 'Annual Expenses', description: 'Yearly expenses like vacations' },
  { id: 'market', title: 'Market Assumptions', description: 'Investment returns and inflation' },
]

export default function SetupPage() {
  const router = useRouter()
  const params = useSimulationStore((state) => state.params)
  const updateParams = useSimulationStore((state) => state.updateParams)
  
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState({
    personal: {
      currentAge: params.currentAge,
      retirementAge: params.retirementAge,
      legalRetirementAge: params.legalRetirementAge,
      endAge: params.endAge,
    } as PersonalInfoStep,
    assets: {
      currentAssets: params.currentAssets,
      annualSavings: params.annualSavings,
      monthlyPension: params.monthlyPension,
    } as AssetsIncomeStep,
    monthly: { ...params.monthlyExpenses } as MonthlyExpensesStep,
    annual: { ...params.annualExpenses } as AnnualExpensesStep,
    market: {
      averageROI: params.averageROI,
      roiVolatility: params.roiVolatility,
      averageInflation: params.averageInflation,
      inflationVolatility: params.inflationVolatility,
      capitalGainsTax: params.capitalGainsTax,
      simulationRuns: params.simulationRuns,
    } as MarketAssumptionsStep,
  })

  // Auto-save to localStorage when form data changes
  useEffect(() => {
    localStorage.setItem('retirement-setup-progress', JSON.stringify({
      currentStep,
      formData,
      timestamp: Date.now()
    }))
  }, [currentStep, formData])

  // Load saved progress on mount
  useEffect(() => {
    const savedProgress = localStorage.getItem('retirement-setup-progress')
    if (savedProgress) {
      try {
        const { currentStep: savedStep, formData: savedFormData } = JSON.parse(savedProgress)
        if (savedStep && savedFormData) {
          setCurrentStep(savedStep)
          setFormData(savedFormData)
        }
      } catch (e) {
        // Ignore invalid saved data
      }
    }
  }, [])

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      // Final step - save and redirect
      updateParams({
        ...formData.personal,
        ...formData.assets,
        monthlyExpenses: formData.monthly,
        annualExpenses: formData.annual,
        ...formData.market,
      })
      // Clear saved progress
      localStorage.removeItem('retirement-setup-progress')
      router.push('/simulation')
    }
  }

  const handleStepClick = (stepIndex: number) => {
    // Only allow clicking on completed or current step
    if (stepIndex <= currentStep) {
      setCurrentStep(stepIndex)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const updateFormData = (step: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [step]: {
        ...prev[step as keyof typeof prev],
        [field]: value,
      }
    }))
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Personal Information
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="currentAge">Current Age</Label>
              <Input
                id="currentAge"
                type="number"
                value={formData.personal.currentAge}
                onChange={(e) => updateFormData('personal', 'currentAge', parseInt(e.target.value))}
                className="mt-2"
              />
              <p className="text-sm text-gray-500 mt-1">How old are you now?</p>
            </div>
            
            <div>
              <Label htmlFor="retirementAge">Intended Retirement Age</Label>
              <div className="mt-2 px-2">
                <Slider
                  value={[formData.personal.retirementAge]}
                  onValueChange={([value]) => updateFormData('personal', 'retirementAge', value)}
                  min={50}
                  max={70}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-2">
                  <span>50</span>
                  <span className="font-semibold text-blue-600">{formData.personal.retirementAge}</span>
                  <span>70</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">When do you want to stop working?</p>
            </div>

            <div>
              <Label htmlFor="legalRetirementAge">Legal Retirement Age</Label>
              <Input
                id="legalRetirementAge"
                type="number"
                value={formData.personal.legalRetirementAge}
                onChange={(e) => updateFormData('personal', 'legalRetirementAge', parseInt(e.target.value))}
                className="mt-2"
              />
              <p className="text-sm text-gray-500 mt-1">When can you start receiving your pension?</p>
            </div>

            <div>
              <Label htmlFor="endAge">Planning Horizon (End Age)</Label>
              <Input
                id="endAge"
                type="number"
                value={formData.personal.endAge}
                onChange={(e) => updateFormData('personal', 'endAge', parseInt(e.target.value))}
                className="mt-2"
              />
              <p className="text-sm text-gray-500 mt-1">Plan until what age? (typically 85-95)</p>
            </div>
          </div>
        )

      case 1: // Assets & Income
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="currentAssets">Current Assets (€)</Label>
              <Input
                id="currentAssets"
                type="number"
                value={formData.assets.currentAssets}
                onChange={(e) => updateFormData('assets', 'currentAssets', parseInt(e.target.value))}
                className="mt-2"
              />
              <p className="text-sm text-gray-500 mt-1">Total value of your current investments and savings</p>
            </div>

            <div>
              <Label htmlFor="annualSavings">Annual Savings (€)</Label>
              <Input
                id="annualSavings"
                type="number"
                value={formData.assets.annualSavings}
                onChange={(e) => updateFormData('assets', 'annualSavings', parseInt(e.target.value))}
                className="mt-2"
              />
              <p className="text-sm text-gray-500 mt-1">How much do you save per year until retirement?</p>
            </div>

            <div>
              <Label htmlFor="monthlyPension">Monthly Pension (€)</Label>
              <Input
                id="monthlyPension"
                type="number"
                value={formData.assets.monthlyPension}
                onChange={(e) => updateFormData('assets', 'monthlyPension', parseInt(e.target.value))}
                className="mt-2"
              />
              <p className="text-sm text-gray-500 mt-1">Expected monthly pension from legal retirement age</p>
            </div>
          </div>
        )

      case 2: // Monthly Expenses
        return (
          <div className="space-y-4">
            <p className="text-gray-600">Enter your expected monthly expenses during retirement:</p>
            {Object.entries(formData.monthly).map(([key, value]) => (
              <div key={key}>
                <Label htmlFor={key} className="capitalize">{key}</Label>
                <Input
                  id={key}
                  type="number"
                  value={value}
                  onChange={(e) => updateFormData('monthly', key, parseInt(e.target.value))}
                  className="mt-2"
                />
              </div>
            ))}
            <div className="pt-4 border-t">
              <div className="flex justify-between text-lg font-semibold">
                <span>Total Monthly:</span>
                <span className="text-blue-600">
                  €{Object.values(formData.monthly).reduce((sum, expense) => sum + expense, 0).toLocaleString()}
                </span>
              </div>
              <div className="text-sm text-gray-500 mt-1">
                Annual: €{(Object.values(formData.monthly).reduce((sum, expense) => sum + expense, 0) * 12).toLocaleString()}
              </div>
            </div>
          </div>
        )

      case 3: // Annual Expenses
        return (
          <div className="space-y-4">
            <p className="text-gray-600">Enter your expected annual expenses during retirement:</p>
            {Object.entries(formData.annual).map(([key, value]) => (
              <div key={key}>
                <Label htmlFor={key} className="capitalize">{key.replace('Maintenance', 'Maintenance')}</Label>
                <Input
                  id={key}
                  type="number"
                  value={value}
                  onChange={(e) => updateFormData('annual', key, parseInt(e.target.value))}
                  className="mt-2"
                />
              </div>
            ))}
            <div className="pt-4 border-t">
              <div className="flex justify-between text-lg font-semibold">
                <span>Total Annual:</span>
                <span className="text-blue-600">
                  €{Object.values(formData.annual).reduce((sum, expense) => sum + expense, 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )

      case 4: // Market Assumptions
        return (
          <div className="space-y-6">
            <div>
              <Label>Average ROI (Return on Investment)</Label>
              <div className="mt-2 px-2">
                <Slider
                  value={[formData.market.averageROI * 100]}
                  onValueChange={([value]) => updateFormData('market', 'averageROI', value / 100)}
                  min={3}
                  max={12}
                  step={0.5}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-2">
                  <span>3%</span>
                  <span className="font-semibold text-blue-600">{(formData.market.averageROI * 100).toFixed(1)}%</span>
                  <span>12%</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">Expected average annual return on your investments</p>
            </div>

            <div>
              <Label>Average Inflation</Label>
              <div className="mt-2 px-2">
                <Slider
                  value={[formData.market.averageInflation * 100]}
                  onValueChange={([value]) => updateFormData('market', 'averageInflation', value / 100)}
                  min={1}
                  max={6}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-2">
                  <span>1%</span>
                  <span className="font-semibold text-blue-600">{(formData.market.averageInflation * 100).toFixed(1)}%</span>
                  <span>6%</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">Expected average annual inflation rate</p>
            </div>

            <div>
              <Label htmlFor="simulationRuns">Simulation Runs</Label>
              <div className="mt-2 px-2">
                <Slider
                  value={[formData.market.simulationRuns]}
                  onValueChange={([value]) => updateFormData('market', 'simulationRuns', value)}
                  min={100}
                  max={5000}
                  step={100}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-2">
                  <span>100</span>
                  <span className="font-semibold text-blue-600">{formData.market.simulationRuns.toLocaleString()}</span>
                  <span>5,000</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">More runs = more accurate results but slower computation</p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <h1 className="text-2xl font-bold text-gray-900">Setup</h1>
            <Button variant="outline" size="sm" asChild>
              <Link href="/simulation">Go to Simulation</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-500">
              Step {currentStep + 1} of {STEPS.length}
            </span>
            <span className="text-sm text-gray-500">
              {Math.round(((currentStep + 1) / STEPS.length) * 100)}% Complete
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Step Navigation */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <button
                    onClick={() => handleStepClick(index)}
                    disabled={index > currentStep}
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-200 ${
                      index < currentStep 
                        ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 cursor-pointer' 
                        : index === currentStep
                        ? 'border-blue-600 text-blue-600 bg-blue-50'
                        : 'border-gray-300 text-gray-300 cursor-not-allowed'
                    } ${index <= currentStep ? 'hover:scale-105' : ''}`}
                  >
                    {index < currentStep ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </button>
                  <div className="mt-2 text-center">
                    <div className={`text-xs font-medium ${
                      index <= currentStep ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      {step.title.split(' ')[0]}
                    </div>
                    
                  </div>
                </div>
                {index < STEPS.length - 1 && (
                  <div 
                    className={`w-16 h-0.5 ml-2 transition-colors duration-300 ${
                      index < currentStep ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <CardTitle>{STEPS[currentStep].title}</CardTitle>
            <CardDescription>{STEPS[currentStep].description}</CardDescription>
          </CardHeader>
          <CardContent>
            {renderStepContent()}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between mt-8">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Button>

          <Button
            onClick={handleNext}
            className="flex items-center space-x-2"
          >
            <span>{currentStep === STEPS.length - 1 ? 'Complete Setup' : 'Next'}</span>
            {currentStep === STEPS.length - 1 ? (
              <Check className="h-4 w-4" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
