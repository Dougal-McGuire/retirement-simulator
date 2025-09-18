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

  const glassCardClass =
    'overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl ring-1 ring-slate-200/50'
  const inputClassName =
    'mt-2 h-12 rounded-2xl border-white/60 bg-white/80 shadow-inner focus-visible:border-primary/40 focus-visible:ring-primary/30'

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
              <Label htmlFor="retirementAge" className="text-sm font-semibold text-slate-800">
                {t('personal.fields.retirementAge.label')}
              </Label>
              <div className="mt-3 rounded-2xl border border-white/60 bg-white/80 p-4 shadow-inner">
                <Slider
                  id="retirementAge"
                  value={[formData.personal.retirementAge]}
                  onValueChange={([value]) => updateFormData('personal', 'retirementAge', value)}
                  min={50}
                  max={70}
                  step={1}
                  className="w-full"
                />
                <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>{formatInteger(50)}</span>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-primary-600">
                    {formatInteger(formData.personal.retirementAge)}
                  </span>
                  <span>{formatInteger(70)}</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-500">{t('personal.fields.retirementAge.help')}</p>
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
          </div>
        )

      case 'monthly': {
        const monthlyKeys = Object.keys(formData.monthly) as (keyof MonthlyExpensesStep)[]
        const totalMonthly = monthlyKeys.reduce((sum, key) => sum + formData.monthly[key], 0)

        return (
          <div className="space-y-5">
            <p className="text-sm text-slate-600">{t('monthly.intro')}</p>
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
            <div className="mt-6 rounded-2xl border border-white/60 bg-white/75 p-4 shadow-inner">
              <div className="flex items-center justify-between text-base font-semibold text-slate-800">
                <span>{t('monthly.total')}</span>
                <span className="text-primary-600">{formatCurrency(totalMonthly)}</span>
              </div>
              <div className="mt-2 text-sm text-slate-500">
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
            <p className="text-sm text-slate-600">{t('annual.intro')}</p>
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
            <div className="mt-6 rounded-2xl border border-white/60 bg-white/75 p-4 shadow-inner">
              <div className="flex items-center justify-between text-base font-semibold text-slate-800">
                <span>{t('annual.total')}</span>
                <span className="text-primary-600">{formatCurrency(totalAnnual)}</span>
              </div>
            </div>
          </div>
        )
      }

      case 'market':
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="averageROI" className="text-sm font-semibold text-slate-800">
                {t('market.averageROI.label')}
              </Label>
              <div className="mt-3 rounded-2xl border border-white/60 bg-white/80 p-4 shadow-inner">
                <Slider
                  id="averageROI"
                  value={[formData.market.averageROI * 100]}
                  onValueChange={([value]) => updateFormData('market', 'averageROI', value / 100)}
                  min={3}
                  max={12}
                  step={0.5}
                  className="w-full"
                />
                <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>{formatPercent(0.03, 0)}</span>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-primary-600">
                    {formatPercent(formData.market.averageROI, 1)}
                  </span>
                  <span>{formatPercent(0.12, 0)}</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-500">{t('market.averageROI.help')}</p>
            </div>

            <div>
              <Label htmlFor="averageInflation" className="text-sm font-semibold text-slate-800">
                {t('market.averageInflation.label')}
              </Label>
              <div className="mt-3 rounded-2xl border border-white/60 bg-white/80 p-4 shadow-inner">
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
                <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>{formatPercent(0.01, 0)}</span>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-primary-600">
                    {formatPercent(formData.market.averageInflation, 1)}
                  </span>
                  <span>{formatPercent(0.06, 0)}</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-500">{t('market.averageInflation.help')}</p>
            </div>

            <div>
              <Label htmlFor="simulationRuns" className="text-sm font-semibold text-slate-800">
                {t('market.simulationRuns.label')}
              </Label>
              <div className="mt-3 rounded-2xl border border-white/60 bg-white/80 p-4 shadow-inner">
                <Slider
                  id="simulationRuns"
                  value={[formData.market.simulationRuns]}
                  onValueChange={([value]) => updateFormData('market', 'simulationRuns', value)}
                  min={100}
                  max={5000}
                  step={100}
                  className="w-full"
                />
                <div className="mt-3 flex items-center justify-between text-xs font-medium text-slate-500">
                  <span>{formatInteger(100)}</span>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-primary-600">
                    {formatInteger(formData.market.simulationRuns)}
                  </span>
                  <span>{formatInteger(5000)}</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-500">{t('market.simulationRuns.help')}</p>
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
    <div className="relative min-h-screen overflow-hidden pb-16">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[8%] top-[-120px] h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute right-[10%] top-16 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute left-1/2 top-[420px] h-[420px] w-[520px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <header id="navigation" className="relative z-10 pt-12 pb-6">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className={cn(glassCardClass, 'relative overflow-hidden px-6 py-8')}>
            <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
            <div className="pointer-events-none absolute -left-28 bottom-0 h-72 w-72 rounded-full bg-accent/25 blur-3xl" />

            <div className="relative flex flex-col gap-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-4 text-slate-900">
                  <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                    <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-primary-700">
                      {t('header.badges.guide')}
                    </span>
                    <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 text-slate-600 normal-case tracking-[0.08em]">
                      {t('header.badges.time')}
                    </span>
                  </div>
                  <div>
                    <h1 className="text-3xl font-semibold sm:text-4xl">{t('header.title')}</h1>
                    <p className="mt-3 max-w-2xl text-base text-slate-600">{t('header.subtitle')}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <LocaleSwitcher className="h-10 w-full rounded-full border-white/60 bg-white/70 text-slate-700 shadow-inner sm:w-40" />
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="h-10 rounded-full border-white/70 bg-white/80 px-5 text-slate-700 shadow-sm transition hover:border-primary/40 hover:text-primary-700"
                  >
                    <Link href="/simulation">{t('header.simulationLink')}</Link>
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-4 border-t border-white/60 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <span className="rounded-full border border-white/60 bg-white/70 px-3 py-1 font-semibold text-slate-700">
                    {progressLabel}
                  </span>
                  <span className="text-slate-500">{percentLabel}</span>
                  <span className="text-xs text-slate-400">{t('progress.autosave')}</span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200/80 sm:max-w-sm">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-indigo-500 to-sky-500 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto mt-8 max-w-5xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className={cn(glassCardClass, 'p-6')}>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>{progressLabel}</span>
              <span className="font-semibold text-slate-800">{progressPercent}%</span>
            </div>
            <div className="mt-6 space-y-6">
              {steps.map((step, index) => {
                const isCompleted = index < currentStep
                const isActive = index === currentStep
                const canNavigate = index <= currentStep

                return (
                  <div key={step.id} className="relative pl-12">
                    {index < steps.length - 1 && (
                      <span
                        className={cn(
                          'absolute left-5 top-11 h-[calc(100%-2.75rem)] w-px rounded-full',
                          isCompleted ? 'bg-gradient-to-b from-primary via-indigo-500 to-sky-500' : 'bg-slate-200/70'
                        )}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => handleStepClick(index)}
                      disabled={!canNavigate}
                      className={cn(
                        'absolute left-0 top-0 flex size-10 items-center justify-center rounded-full border-2 transition-all duration-200',
                        isCompleted &&
                          'border-transparent bg-gradient-to-br from-primary via-indigo-500 to-sky-500 text-white shadow-lg',
                        isActive && !isCompleted && 'border-primary/50 bg-white text-primary-600 shadow-md',
                        !isCompleted && !isActive && 'border-slate-200 text-slate-300',
                        canNavigate ? 'cursor-pointer hover:scale-105' : 'cursor-default'
                      )}
                    >
                      {isCompleted ? <Check className="h-5 w-5" /> : <span className="text-sm font-semibold">{index + 1}</span>}
                    </button>

                    <div>
                      <p
                        className={cn(
                          'text-sm font-semibold',
                          isCompleted || isActive ? 'text-slate-900' : 'text-slate-400'
                        )}
                      >
                        {step.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{step.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>

          <section className="space-y-8">
            <Card className={cn(glassCardClass)}>
              <CardHeader className="border-b border-white/60 bg-white/40">
                <CardTitle className="text-xl font-semibold text-slate-900">
                  {steps[currentStep].title}
                </CardTitle>
                <CardDescription className="mt-1 text-sm text-slate-600">
                  {steps[currentStep].description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">{renderStepContent()}</CardContent>
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-full border-white/70 bg-white/80 px-5 py-2 text-slate-700 shadow-sm transition hover:border-primary/40 hover:text-primary-700',
                  currentStep === 0 && 'opacity-60'
                )}
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{t('buttons.back')}</span>
              </Button>

              <Button
                onClick={handleNext}
                className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary via-indigo-500 to-sky-500 px-6 py-2 text-white shadow-lg transition hover:from-primary/90 hover:via-indigo-500/90 hover:to-sky-500/90"
              >
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
          </section>
        </div>
      </main>
    </div>
  )
}
