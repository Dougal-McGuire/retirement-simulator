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
import { OneTimeIncomeList } from '@/components/forms/fields/OneTimeIncomeList'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import {
  PersonalInfoStep,
  AssetsIncomeStep,
  MonthlyExpensesStep,
  AnnualExpensesStep,
  MarketAssumptionsStep,
  OneTimeIncome,
} from '@/types'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { cn } from '@/lib/utils'

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
      oneTimeIncomes: params.oneTimeIncomes ?? [],
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
        setFormData((prev) => ({
          personal: parsed.formData.personal ?? prev.personal,
          assets: {
            currentAssets:
              parsed.formData.assets?.currentAssets ?? prev.assets.currentAssets,
            annualSavings:
              parsed.formData.assets?.annualSavings ?? prev.assets.annualSavings,
            monthlyPension:
              parsed.formData.assets?.monthlyPension ?? prev.assets.monthlyPension,
            oneTimeIncomes:
              parsed.formData.assets?.oneTimeIncomes ??
              prev.assets.oneTimeIncomes ??
              [],
          },
          monthly: parsed.formData.monthly ?? prev.monthly,
          annual: parsed.formData.annual ?? prev.annual,
          market: parsed.formData.market ?? prev.market,
        }))
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

  const glassCardClass = 'border-3 border-neo-black bg-neo-white shadow-neo'
  const inputClassName = 'w-full'
  const oneTimeIncomes = formData.assets.oneTimeIncomes ?? []

  const clampIncomeAge = (value: number, state: FormState) => {
    const rounded = Math.round(value)
    return Math.max(state.personal.currentAge, Math.min(state.personal.endAge, rounded))
  }

  const handleAddOneTimeIncome = (income: OneTimeIncome) => {
    setFormData((prev) => {
      const nextAge = clampIncomeAge(income.age, prev)
      const nextAmount = Math.max(0, Math.round(income.amount))
      return {
        ...prev,
        assets: {
          ...prev.assets,
          oneTimeIncomes: [
            ...(prev.assets.oneTimeIncomes ?? []),
            {
              age: nextAge,
              amount: nextAmount,
            },
          ],
        },
      }
    })
  }

  const handleUpdateOneTimeIncome = (index: number, income: OneTimeIncome) => {
    setFormData((prev) => {
      const nextIncomes = (prev.assets.oneTimeIncomes ?? []).map((existing, existingIndex) =>
        existingIndex === index
          ? {
              age: clampIncomeAge(income.age, prev),
              amount: Math.max(0, Math.round(income.amount)),
            }
          : existing
      )
      return {
        ...prev,
        assets: {
          ...prev.assets,
          oneTimeIncomes: nextIncomes,
        },
      }
    })
  }

  const handleRemoveOneTimeIncome = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      assets: {
        ...prev.assets,
        oneTimeIncomes: (prev.assets.oneTimeIncomes ?? []).filter((_, incomeIndex) => incomeIndex !== index),
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
              className={inputClassName}
            />

            <div>
              <Label
                htmlFor="retirementAge"
                className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-neo-black"
              >
                {t('personal.fields.retirementAge.label')}
              </Label>
              <div className="mt-3 border-3 border-neo-black bg-neo-white px-4 py-3 shadow-neo-sm">
                <Slider
                  id="retirementAge"
                  value={[formData.personal.retirementAge]}
                  onValueChange={([value]) => updateFormData('personal', 'retirementAge', value)}
                  min={50}
                  max={70}
                  step={1}
                  className="w-full"
                />
                <div className="mt-3 flex items-center justify-between text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>{formatInteger(50)}</span>
                  <span className="border-3 border-neo-black bg-neo-yellow px-3 py-1 text-neo-black">
                    {formatInteger(formData.personal.retirementAge)}
                  </span>
                  <span>{formatInteger(70)}</span>
                </div>
              </div>
              <p className="mt-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t('personal.fields.retirementAge.help')}
              </p>
            </div>

            <LabeledNumberInput
              id="legalRetirementAge"
              label={t('personal.fields.legalRetirementAge.label')}
              value={formData.personal.legalRetirementAge}
              onChange={(value) => updateFormData('personal', 'legalRetirementAge', value)}
              helpText={t('personal.fields.legalRetirementAge.help')}
              className={inputClassName}
            />

            <LabeledNumberInput
              id="endAge"
              label={t('personal.fields.endAge.label')}
              value={formData.personal.endAge}
              onChange={(value) => updateFormData('personal', 'endAge', value)}
              helpText={t('personal.fields.endAge.help')}
              className={inputClassName}
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
              className={inputClassName}
            />

            <LabeledNumberInput
              id="annualSavings"
              label={t('assets.fields.annualSavings.label')}
              value={formData.assets.annualSavings}
              onChange={(value) => updateFormData('assets', 'annualSavings', value)}
              helpText={t('assets.fields.annualSavings.help')}
              className={inputClassName}
            />

            <LabeledNumberInput
              id="monthlyPension"
              label={t('assets.fields.monthlyPension.label')}
              value={formData.assets.monthlyPension}
              onChange={(value) => updateFormData('assets', 'monthlyPension', value)}
              helpText={t('assets.fields.monthlyPension.help')}
              className={inputClassName}
            />

            <div className="space-y-4 border-3 border-neo-black bg-neo-white px-4 py-5 shadow-neo-sm">
              <div>
                <h5 className="text-[0.72rem] font-extrabold uppercase tracking-[0.16em] text-neo-black">
                  {t('assets.oneTimeIncomes.title')}
                </h5>
                <p className="mt-1 text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t('assets.oneTimeIncomes.help')}
                </p>
              </div>
              <OneTimeIncomeList
                incomes={oneTimeIncomes}
                minAge={formData.personal.currentAge}
                maxAge={formData.personal.endAge}
                defaultAge={Math.max(formData.personal.retirementAge, formData.personal.currentAge + 1)}
                strings={{
                  addButton: t('assets.oneTimeIncomes.add'),
                  empty: t('assets.oneTimeIncomes.empty'),
                  ageLabel: t('assets.oneTimeIncomes.ageLabel'),
                  amountLabel: t('assets.oneTimeIncomes.amountLabel'),
                  remove: t('assets.oneTimeIncomes.remove'),
                  tableHeaders: {
                    age: t('assets.oneTimeIncomes.table.age'),
                    amount: t('assets.oneTimeIncomes.table.amount'),
                    actions: t('assets.oneTimeIncomes.table.actions'),
                  },
                  summaryLabel: t('assets.oneTimeIncomes.summary'),
                }}
                onAdd={handleAddOneTimeIncome}
                onUpdate={handleUpdateOneTimeIncome}
                onRemove={handleRemoveOneTimeIncome}
                formatCurrency={(value) =>
                  format.number(value, {
                    style: 'currency',
                    currency: 'EUR',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })
                }
              />
            </div>
          </div>
        )

      case 'monthly': {
        const monthlyKeys = Object.keys(formData.monthly) as (keyof MonthlyExpensesStep)[]
        const totalMonthly = monthlyKeys.reduce((sum, key) => sum + formData.monthly[key], 0)

        return (
          <div className="space-y-5">
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t('monthly.intro')}
            </p>
            {monthlyKeys.map((key) => (
              <LabeledNumberInput
                key={key}
                id={key}
                label={t(`monthly.labels.${key}`)}
                value={formData.monthly[key]}
                onChange={(value) => updateFormData('monthly', key, value)}
                className={inputClassName}
              />
            ))}
            <div className="mt-6 border-3 border-neo-black bg-neo-white px-5 py-4 shadow-neo-sm">
              <div className="flex items-center justify-between text-[0.8rem] font-bold uppercase tracking-[0.16em] text-neo-black">
                <span>{t('monthly.total')}</span>
                <span className="text-neo-blue">{formatCurrency(totalMonthly)}</span>
              </div>
              <div className="mt-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
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
          <div className="space-y-5">
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t('annual.intro')}
            </p>
            {annualKeys.map((key) => (
              <LabeledNumberInput
                key={key}
                id={key}
                label={t(`annual.labels.${key}`)}
                value={formData.annual[key]}
                onChange={(value) => updateFormData('annual', key, value)}
                className={inputClassName}
              />
            ))}
            <div className="mt-6 border-3 border-neo-black bg-neo-white px-5 py-4 shadow-neo-sm">
              <div className="flex items-center justify-between text-[0.8rem] font-bold uppercase tracking-[0.16em] text-neo-black">
                <span>{t('annual.total')}</span>
                <span className="text-neo-blue">{formatCurrency(totalAnnual)}</span>
              </div>
            </div>
          </div>
        )
      }

      case 'market':
        return (
          <div className="space-y-6">
            <div>
              <Label
                htmlFor="averageROI"
                className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-neo-black"
              >
                {t('market.averageROI.label')}
              </Label>
              <div className="mt-3 border-3 border-neo-black bg-neo-white px-4 py-3 shadow-neo-sm">
                <Slider
                  id="averageROI"
                  value={[formData.market.averageROI * 100]}
                  onValueChange={([value]) => updateFormData('market', 'averageROI', value / 100)}
                  min={3}
                  max={12}
                  step={0.5}
                  className="w-full"
                />
                <div className="mt-3 flex items-center justify-between text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>{formatPercent(0.03, 0)}</span>
                  <span className="border-3 border-neo-black bg-neo-yellow px-3 py-1 text-neo-black">
                    {formatPercent(formData.market.averageROI, 1)}
                  </span>
                  <span>{formatPercent(0.12, 0)}</span>
                </div>
              </div>
              <p className="mt-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t('market.averageROI.help')}
              </p>
            </div>

            <div>
              <Label
                htmlFor="averageInflation"
                className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-neo-black"
              >
                {t('market.averageInflation.label')}
              </Label>
              <div className="mt-3 border-3 border-neo-black bg-neo-white px-4 py-3 shadow-neo-sm">
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
                <div className="mt-3 flex items-center justify-between text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>{formatPercent(0.01, 0)}</span>
                  <span className="border-3 border-neo-black bg-neo-yellow px-3 py-1 text-neo-black">
                    {formatPercent(formData.market.averageInflation, 1)}
                  </span>
                  <span>{formatPercent(0.06, 0)}</span>
                </div>
              </div>
              <p className="mt-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t('market.averageInflation.help')}
              </p>
            </div>

            <div>
              <Label
                htmlFor="simulationRuns"
                className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-neo-black"
              >
                {t('market.simulationRuns.label')}
              </Label>
              <div className="mt-3 border-3 border-neo-black bg-neo-white px-4 py-3 shadow-neo-sm">
                <Slider
                  id="simulationRuns"
                  value={[formData.market.simulationRuns]}
                  onValueChange={([value]) => updateFormData('market', 'simulationRuns', value)}
                  min={100}
                  max={5000}
                  step={100}
                  className="w-full"
                />
                <div className="mt-3 flex items-center justify-between text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>{formatInteger(100)}</span>
                  <span className="border-3 border-neo-black bg-neo-yellow px-3 py-1 text-neo-black">
                    {formatInteger(formData.market.simulationRuns)}
                  </span>
                  <span>{formatInteger(5000)}</span>
                </div>
              </div>
              <p className="mt-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t('market.simulationRuns.help')}
              </p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const progressPercent = Math.round(((currentStep + 1) / steps.length) * 100)
  const progressLabel = t('progress.step', { current: currentStep + 1, total: steps.length })
  const percentLabel = t('progress.percentComplete', { percent: progressPercent })

  return (
    <div className="relative min-h-screen pb-16">

      <header id="navigation" className="relative z-10 pt-12 pb-10">
        <div className="mx-auto max-w-[80rem] px-2 sm:px-3 lg:px-4">
          <div className={cn(glassCardClass, 'relative overflow-hidden px-8 py-10')}>
            <div className="absolute right-8 top-8 hidden h-12 w-12 rotate-6 border-3 border-neo-black bg-neo-yellow/40 md:block" />
            <div className="absolute -left-6 bottom-10 hidden h-16 w-16 -rotate-3 border-3 border-neo-black bg-neo-blue/20 md:block" />

            <div className="relative flex flex-col gap-10">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-col gap-5 text-neo-black">
                  <div className="flex flex-wrap items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.32em]">
                    <span className="inline-flex items-center gap-2 border-3 border-neo-black bg-neo-yellow px-4 py-1.5 text-neo-black shadow-neo-sm">
                      {t('header.badges.guide')}
                    </span>
                    <span className="inline-flex items-center gap-2 border-3 border-neo-black bg-neo-white px-4 py-1.5 text-muted-foreground shadow-neo-sm">
                      {t('header.badges.time')}
                    </span>
                  </div>
                  <div>
                    <h1 className="text-3xl font-black tracking-[0.14em] sm:text-4xl">
                      {t('header.title')}
                    </h1>
                    <p className="mt-4 max-w-2xl text-[0.85rem] font-medium text-foreground/80">
                      {t('header.subtitle')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <LocaleSwitcher className="w-full sm:w-48" />
                  <Button
                    variant="secondary"
                    size="sm"
                    asChild
                    className="min-w-[11rem]"
                  >
                    <Link href="/simulation">{t('header.simulationLink')}</Link>
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-4 border-t-3 border-neo-black pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-[0.72rem] font-semibold uppercase tracking-[0.16em]">
                  <span className="border-3 border-neo-black bg-neo-white px-4 py-1 shadow-neo-sm">
                    {progressLabel}
                  </span>
                  <span>{percentLabel}</span>
                  <span className="text-[0.6rem] text-muted-foreground">
                    {t('progress.autosave')}
                  </span>
                </div>
                <div className="relative h-5 w-full border-3 border-neo-black bg-neo-white shadow-neo sm:max-w-sm">
                  <div
                    className="h-full bg-neo-blue transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto mt-2 max-w-[80rem] px-2 pb-16 sm:px-3 lg:px-4">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className={cn(glassCardClass, 'space-y-6 p-6')}>
            <div className="flex items-center justify-between text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span>{progressLabel}</span>
              <span className="text-neo-black">{progressPercent}%</span>
            </div>
            <div className="space-y-6">
              {steps.map((step, index) => {
                const isCompleted = index < currentStep
                const isActive = index === currentStep
                const canNavigate = index <= currentStep

                return (
                  <div key={step.id} className="relative pl-12">
                    {index < steps.length - 1 && (
                      <span
                        className={cn(
                          'absolute left-5 top-11 h-[calc(100%-2.75rem)] w-1',
                          isCompleted ? 'bg-neo-black' : 'bg-muted'
                        )}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => handleStepClick(index)}
                      disabled={!canNavigate}
                      className={cn(
                        'absolute left-0 top-0 flex h-10 w-10 items-center justify-center border-3 border-neo-black bg-neo-white font-extrabold text-neo-black shadow-neo-sm transition-neo',
                        isCompleted && 'bg-neo-yellow',
                        isActive && !isCompleted && 'bg-neo-white',
                        !isCompleted && !isActive && 'bg-muted text-muted-foreground',
                        canNavigate
                          ? 'cursor-pointer hover:-translate-y-[1px] hover:-translate-x-[1px]'
                          : 'cursor-default'
                      )}
                    >
                      <span className="text-sm">{index + 1}</span>
                    </button>

                    <div>
                      <p
                        className={cn(
                          'text-[0.78rem] font-bold uppercase tracking-[0.16em]',
                          isCompleted || isActive ? 'text-neo-black' : 'text-muted-foreground'
                        )}
                      >
                        {step.title}
                      </p>
                      <p className="mt-1 text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>

          <section className="space-y-0">
            <Card className={cn(glassCardClass)}>
              <CardHeader className="border-b-3 border-neo-black bg-neo-white">
                <CardTitle className="text-xl font-extrabold uppercase tracking-[0.2em] text-neo-black">
                  {steps[currentStep].title}
                </CardTitle>
                <CardDescription className="mt-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {steps[currentStep].description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">{renderStepContent()}</CardContent>
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                disabled={currentStep === 0}
                className={cn('sm:min-w-[10rem]', currentStep === 0 && 'opacity-40')}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('buttons.back')}
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={handleNext}
                className="sm:min-w-[12rem]"
              >
                {currentStep === steps.length - 1 ? t('buttons.complete') : t('buttons.next')}
                {currentStep === steps.length - 1 ? (
                  <Check className="ml-2 h-4 w-4" />
                ) : (
                  <ArrowRight className="ml-2 h-4 w-4" />
                )}
              </Button>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
