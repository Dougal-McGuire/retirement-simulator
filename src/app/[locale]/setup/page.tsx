'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useTranslations, useFormatter } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { LabeledNumberInput } from '@/components/forms/fields/LabeledNumberInput'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import {
  PersonalInfoStep,
  AssetsIncomeStep,
  MonthlyExpensesStep,
  AnnualExpensesStep,
  MarketAssumptionsStep,
} from '@/types'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'

const STEP_KEYS = ['personal', 'assets', 'monthly', 'annual', 'market'] as const

type StepKey = (typeof STEP_KEYS)[number]

type FormState = {
  personal: PersonalInfoStep
  assets: AssetsIncomeStep
  monthly: MonthlyExpensesStep
  annual: AnnualExpensesStep
  market: MarketAssumptionsStep
}

const STORAGE_KEY = 'retirement-setup-progress'

export default function SetupPage() {
  const router = useRouter()
  const t = useTranslations('setup')
  const format = useFormatter()

  const params = useSimulationStore((state) => state.params)
  const updateParams = useSimulationStore((state) => state.updateParams)

  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<FormState>({
    personal: {
      currentAge: params.currentAge,
      retirementAge: params.retirementAge,
      legalRetirementAge: params.legalRetirementAge,
      endAge: params.endAge,
    },
    assets: {
      currentAssets: params.currentAssets,
      annualSavings: params.annualSavings,
      monthlyPension: params.monthlyPension,
    },
    monthly: { ...params.monthlyExpenses },
    annual: { ...params.annualExpenses },
    market: {
      averageROI: params.averageROI,
      roiVolatility: params.roiVolatility,
      averageInflation: params.averageInflation,
      inflationVolatility: params.inflationVolatility,
      capitalGainsTax: params.capitalGainsTax,
      simulationRuns: params.simulationRuns,
    },
  })

  const steps = useMemo(
    () =>
      STEP_KEYS.map((key) => ({
        id: key,
        title: t(`steps.${key}.title`),
        description: t(`steps.${key}.description`),
      })),
    [t]
  )

  const activeStepKey = STEP_KEYS[currentStep]

  const formatCurrency = (value: number, minimumFractionDigits = 0) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits,
      maximumFractionDigits: Math.max(0, minimumFractionDigits),
    })

  const formatPercent = (value: number, maximumFractionDigits = 1) =>
    format.number(value, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits,
    })

  const formatInteger = (value: number) =>
    format.number(value, { maximumFractionDigits: 0, minimumFractionDigits: 0 })

  // Auto-save to localStorage when form data changes
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currentStep,
        formData,
        timestamp: Date.now(),
      })
    )
  }, [currentStep, formData])

  // Load saved progress on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return

    try {
      const parsed = JSON.parse(saved)
      if (typeof parsed.currentStep === 'number' && parsed.formData) {
        setCurrentStep(Math.min(parsed.currentStep, STEP_KEYS.length - 1))
        setFormData(parsed.formData)
      }
    } catch {
      // ignore invalid cached state
    }
  }, [])

  const handleNext = () => {
    if (currentStep < STEP_KEYS.length - 1) {
      setCurrentStep(currentStep + 1)
      return
    }

    updateParams({
      ...formData.personal,
      ...formData.assets,
      monthlyExpenses: formData.monthly,
      annualExpenses: formData.annual,
      ...formData.market,
    })

    localStorage.removeItem(STORAGE_KEY)
    router.push('/simulation')
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex <= currentStep) {
      setCurrentStep(stepIndex)
    }
  }

  const updateFormData = <K extends StepKey, Field extends keyof FormState[K]>(
    step: K,
    field: Field,
    value: FormState[K][Field],
  ) => {
    setFormData((prev) => ({
      ...prev,
      [step]: {
        ...prev[step],
        [field]: value,
      },
    }))
  }

  const renderStepContent = () => {
    switch (activeStepKey) {
      case 'personal':
        return (
          <div className="space-y-6">
            <LabeledNumberInput
              id="currentAge"
              label={t('personal.fields.currentAge.label')}
              value={formData.personal.currentAge}
              onChange={(value) => updateFormData('personal', 'currentAge', value)}
              helpText={t('personal.fields.currentAge.help')}
            />

            <div>
              <Label htmlFor="retirementAge">{t('personal.fields.retirementAge.label')}</Label>
              <div className="mt-2 px-2">
                <Slider
                  id="retirementAge"
                  value={[formData.personal.retirementAge]}
                  onValueChange={([value]) => updateFormData('personal', 'retirementAge', value)}
                  min={50}
                  max={70}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-2">
                  <span>{formatInteger(50)}</span>
                  <span className="font-semibold text-blue-600">
                    {formatInteger(formData.personal.retirementAge)}
                  </span>
                  <span>{formatInteger(70)}</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {t('personal.fields.retirementAge.help')}
              </p>
            </div>

            <LabeledNumberInput
              id="legalRetirementAge"
              label={t('personal.fields.legalRetirementAge.label')}
              value={formData.personal.legalRetirementAge}
              onChange={(value) => updateFormData('personal', 'legalRetirementAge', value)}
              helpText={t('personal.fields.legalRetirementAge.help')}
            />

            <LabeledNumberInput
              id="endAge"
              label={t('personal.fields.endAge.label')}
              value={formData.personal.endAge}
              onChange={(value) => updateFormData('personal', 'endAge', value)}
              helpText={t('personal.fields.endAge.help')}
            />
          </div>
        )

      case 'assets':
        return (
          <div className="space-y-6">
            <LabeledNumberInput
              id="currentAssets"
              label={t('assets.fields.currentAssets.label')}
              value={formData.assets.currentAssets}
              onChange={(value) => updateFormData('assets', 'currentAssets', value)}
              helpText={t('assets.fields.currentAssets.help')}
            />

            <LabeledNumberInput
              id="annualSavings"
              label={t('assets.fields.annualSavings.label')}
              value={formData.assets.annualSavings}
              onChange={(value) => updateFormData('assets', 'annualSavings', value)}
              helpText={t('assets.fields.annualSavings.help')}
            />

            <LabeledNumberInput
              id="monthlyPension"
              label={t('assets.fields.monthlyPension.label')}
              value={formData.assets.monthlyPension}
              onChange={(value) => updateFormData('assets', 'monthlyPension', value)}
              helpText={t('assets.fields.monthlyPension.help')}
            />
          </div>
        )

      case 'monthly': {
        const monthlyKeys = Object.keys(formData.monthly) as (keyof MonthlyExpensesStep)[]
        const totalMonthly = monthlyKeys.reduce((sum, key) => sum + formData.monthly[key], 0)

        return (
          <div className="space-y-4">
            <p className="text-gray-600">{t('monthly.intro')}</p>
            {monthlyKeys.map((key) => (
              <LabeledNumberInput
                key={key}
                id={key}
                label={t(`monthly.labels.${key}`)}
                value={formData.monthly[key]}
                onChange={(value) => updateFormData('monthly', key, value)}
              />
            ))}
            <div className="pt-4 border-t">
              <div className="flex justify-between text-lg font-semibold">
                <span>{t('monthly.total')}</span>
                <span className="text-blue-600">{formatCurrency(totalMonthly)}</span>
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {t('monthly.annualEquivalent', {
                  value: formatCurrency(totalMonthly * 12),
                })}
              </div>
            </div>
          </div>
        )
      }

      case 'annual': {
        const annualKeys = Object.keys(formData.annual) as (keyof AnnualExpensesStep)[]
        const totalAnnual = annualKeys.reduce((sum, key) => sum + formData.annual[key], 0)

        return (
          <div className="space-y-4">
            <p className="text-gray-600">{t('annual.intro')}</p>
            {annualKeys.map((key) => (
              <LabeledNumberInput
                key={key}
                id={key}
                label={t(`annual.labels.${key}`)}
                value={formData.annual[key]}
                onChange={(value) => updateFormData('annual', key, value)}
              />
            ))}
            <div className="pt-4 border-t">
              <div className="flex justify-between text-lg font-semibold">
                <span>{t('annual.total')}</span>
                <span className="text-blue-600">{formatCurrency(totalAnnual)}</span>
              </div>
            </div>
          </div>
        )
      }

      case 'market':
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="averageROI">{t('market.averageROI.label')}</Label>
              <div className="mt-2 px-2">
                <Slider
                  id="averageROI"
                  value={[formData.market.averageROI * 100]}
                  onValueChange={([value]) => updateFormData('market', 'averageROI', value / 100)}
                  min={3}
                  max={12}
                  step={0.5}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-2">
                  <span>{formatPercent(0.03, 0)}</span>
                  <span className="font-semibold text-blue-600">
                    {formatPercent(formData.market.averageROI, 1)}
                  </span>
                  <span>{formatPercent(0.12, 0)}</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">{t('market.averageROI.help')}</p>
            </div>

            <div>
              <Label htmlFor="averageInflation">{t('market.averageInflation.label')}</Label>
              <div className="mt-2 px-2">
                <Slider
                  id="averageInflation"
                  value={[formData.market.averageInflation * 100]}
                  onValueChange={([value]) =>
                    updateFormData('market', 'averageInflation', value / 100)
                  }
                  min={1}
                  max={6}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-2">
                  <span>{formatPercent(0.01, 0)}</span>
                  <span className="font-semibold text-blue-600">
                    {formatPercent(formData.market.averageInflation, 1)}
                  </span>
                  <span>{formatPercent(0.06, 0)}</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">{t('market.averageInflation.help')}</p>
            </div>

            <div>
              <Label htmlFor="simulationRuns">{t('market.simulationRuns.label')}</Label>
              <div className="mt-2 px-2">
                <Slider
                  id="simulationRuns"
                  value={[formData.market.simulationRuns]}
                  onValueChange={([value]) => updateFormData('market', 'simulationRuns', value)}
                  min={100}
                  max={5000}
                  step={100}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-2">
                  <span>{formatInteger(100)}</span>
                  <span className="font-semibold text-blue-600">
                    {formatInteger(formData.market.simulationRuns)}
                  </span>
                  <span>{formatInteger(5000)}</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">{t('market.simulationRuns.help')}</p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const progressPercent = Math.round(((currentStep + 1) / steps.length) * 100)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold text-gray-900">{t('header.title')}</h1>
            <div className="flex items-center gap-2 sm:justify-end">
              <LocaleSwitcher className="w-36" />
              <Button variant="outline" size="sm" asChild>
                <Link href="/simulation">{t('header.simulationLink')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-500">
              {t('progress.step', { current: currentStep + 1, total: steps.length })}
            </span>
            <span className="text-sm text-gray-500">
              {t('progress.percentComplete', { percent: progressPercent })}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <button
                    type="button"
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
                    <div
                      className={`text-xs font-medium leading-tight ${
                        index <= currentStep ? 'text-gray-900' : 'text-gray-400'
                      } max-w-[96px] mx-auto`}
                    >
                      {step.title}
                    </div>
                  </div>
                </div>
                {index < steps.length - 1 && (
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

        <Card>
          <CardHeader>
            <CardTitle>{steps[currentStep].title}</CardTitle>
            <CardDescription>{steps[currentStep].description}</CardDescription>
          </CardHeader>
          <CardContent>{renderStepContent()}</CardContent>
        </Card>

        <div className="flex items-center justify-between mt-8">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t('buttons.back')}</span>
          </Button>

          <Button onClick={handleNext} className="flex items-center space-x-2">
            <span>
              {currentStep === steps.length - 1 ? t('buttons.complete') : t('buttons.next')}
            </span>
            {currentStep === steps.length - 1 ? (
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
