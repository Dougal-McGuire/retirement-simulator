'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import { useTranslations, useFormatter } from 'next-intl'
import { Link, useRouter } from '@/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LabeledNumberInput } from '@/components/forms/fields/LabeledNumberInput'
import { WizardSliderField } from '@/components/forms/fields/WizardSliderField'
import { OneTimeIncomeList } from '@/components/forms/fields/OneTimeIncomeList'
import { CashFlowList } from '@/components/forms/fields/CashFlowList'
import { buildCashFlowTemplates } from '@/components/forms/fields/cashFlowTemplates'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { PlanNameDialog } from '@/components/plans/PlanNameDialog'
import { planDisplayName } from '@/lib/plans/planName'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { OneTimeIncome } from '@/types'
import { AuthMenu } from '@/components/auth/AuthMenu'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { ThemeSwitcher } from '@/components/navigation/ThemeSwitcher'
import { cn } from '@/lib/utils'
import { parseSetupProgressStep } from './setupProgress'

const STEP_KEYS = ['personal', 'assets', 'expenses', 'market'] as const

const STORAGE_KEY = 'retirement-setup-progress'

export default function SetupPage() {
  const router = useRouter()
  /**
   * Finishing the wizard compiles and renders the dashboard route, which in
   * development is seconds of a frozen button and no feedback at all. The
   * transition keeps the click acknowledged (spinner on the button it was
   * aimed at, progress bar across the top) until the new route paints.
   */
  const [isNavigating, startNavigation] = useTransition()
  const t = useTranslations('setup')
  const tStatus = useTranslations('stepStatus')
  const tUi = useTranslations('ui')
  const tPlans = useTranslations('plans')
  const format = useFormatter()

  const params = useSimulationStore((state) => state.params)
  const updateParams = useSimulationStore((state) => state.updateParams)
  const setAutoRunSuspended = useSimulationStore((state) => state.setAutoRunSuspended)
  const createPlan = useSimulationStore((state) => state.createPlan)
  const renamePlan = useSimulationStore((state) => state.renamePlan)
  const savePlanDraft = useSimulationStore((state) => state.savePlanDraft)
  const revertPlanDraft = useSimulationStore((state) => state.revertPlanDraft)
  const plans = useSimulationStore((state) => state.plans)
  const activePlanId = useSimulationStore((state) => state.activePlanId)
  const isDirty = useSimulationStore((state) => state.isDirty)
  const [savePlanOpen, setSavePlanOpen] = useState(false)
  const [newPlanOpen, setNewPlanOpen] = useState(false)
  const [planNameDraft, setPlanNameDraft] = useState('')

  const activePlan = plans.find((plan) => plan.id === activePlanId) ?? plans[0]
  const activePlanName = activePlan ? planDisplayName(activePlan, tPlans) : ''
  // First run: the untouched built-in plan is the only one, so the wizard just
  // needs a name for it instead of a save/update/discard decision.
  const isFirstRun = plans.length === 1 && Boolean(activePlan?.nameKey)

  const [currentStep, setCurrentStep] = useState(0)
  const [progressLoaded, setProgressLoaded] = useState(false)

  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const lastFocusedStepRef = useRef<number | null>(null)

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

  // Load saved currentStep on mount (formData is already from params)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      setProgressLoaded(true)
      return
    }

    const savedStep = parseSetupProgressStep(saved, STEP_KEYS.length)
    if (savedStep !== null) {
      setCurrentStep(savedStep)
    }

    setProgressLoaded(true)
  }, [])

  // Auto-save currentStep to localStorage (for continuing where user left off)
  useEffect(() => {
    if (!progressLoaded) return

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currentStep,
        timestamp: Date.now(),
      })
    )
  }, [currentStep, progressLoaded])

  useEffect(() => {
    setAutoRunSuspended(true)
    return () => {
      setAutoRunSuspended(false)
    }
  }, [setAutoRunSuspended])

  // Move focus to the step heading when the user changes steps so keyboard and
  // screen-reader users land at the start of the new content. The first value
  // seen after progress restore is the baseline, not a user action.
  useEffect(() => {
    if (!progressLoaded) return
    if (lastFocusedStepRef.current === null) {
      lastFocusedStepRef.current = currentStep
      return
    }
    if (lastFocusedStepRef.current === currentStep) return
    lastFocusedStepRef.current = currentStep
    stepHeadingRef.current?.focus({ preventScroll: true })
    stepHeadingRef.current?.scrollIntoView({ block: 'nearest' })
  }, [currentStep, progressLoaded])

  const finishSetup = () => {
    // Data is already in simulation store, just clear progress and navigate
    localStorage.removeItem(STORAGE_KEY)
    startNavigation(() => {
      router.push('/simulation')
    })
  }

  /** First run: name the built-in plan and keep everything just configured. */
  const handleFirstRunFinish = () => {
    const trimmed = planNameDraft.trim()
    if (trimmed && activePlan) renamePlan(activePlan.id, trimmed)
    savePlanDraft()
    setSavePlanOpen(false)
    finishSetup()
  }

  const handleNext = () => {
    if (currentStep < STEP_KEYS.length - 1) {
      setCurrentStep(currentStep + 1)
      return
    }

    // Last step: offer to keep this configuration as its own named plan.
    setSavePlanOpen(true)
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleStepClick = (stepIndex: number) => {
    setCurrentStep(stepIndex)
  }

  const glassCardClass = 'border-3 border-neo-black bg-neo-white shadow-neo'

  const clampIncomeAge = (value: number) => {
    const rounded = Math.round(value)
    return Math.max(params.currentAge, Math.min(params.endAge, rounded))
  }

  const handleAddOneTimeIncome = (income: OneTimeIncome) => {
    const nextAge = clampIncomeAge(income.age)
    const nextAmount = Math.max(0, Math.round(income.amount))
    updateParams({
      oneTimeIncomes: [
        ...params.oneTimeIncomes,
        {
          age: nextAge,
          amount: nextAmount,
          name: income.name || '',
        },
      ],
    })
  }

  const handleUpdateOneTimeIncome = (index: number, income: OneTimeIncome) => {
    const nextIncomes = params.oneTimeIncomes.map((existing, existingIndex) =>
      existingIndex === index
        ? {
            age: clampIncomeAge(income.age),
            amount: Math.max(0, Math.round(income.amount)),
            name: income.name || '',
          }
        : existing
    )
    updateParams({ oneTimeIncomes: nextIncomes })
  }

  const handleRemoveOneTimeIncome = (index: number) => {
    updateParams({
      oneTimeIncomes: params.oneTimeIncomes.filter((_, incomeIndex) => incomeIndex !== index),
    })
  }

  const workingYears = Math.max(0, params.retirementAge - params.currentAge)
  const retirementYears = Math.max(0, params.endAge - params.retirementAge)
  const realReturn = (1 + params.averageROI) / (1 + params.averageInflation) - 1

  const timelineIssues: string[] = []
  if (params.retirementAge <= params.currentAge) {
    timelineIssues.push(t('validation.retirementAfterCurrent'))
  }
  if (params.endAge <= params.retirementAge) {
    timelineIssues.push(t('validation.horizonAfterRetirement'))
  }

  const retirementSliderMin = Math.max(50, Math.min(params.currentAge + 1, 69))

  const renderStepContent = () => {
    switch (activeStepKey) {
      case 'personal':
        return (
          <div className="space-y-7">
            <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2">
              <LabeledNumberInput
                id="currentAge"
                label={t('personal.fields.currentAge.label')}
                value={params.currentAge}
                onChange={(value) => updateParams({ currentAge: value })}
                helpText={t('personal.fields.currentAge.help')}
                className="w-full"
                min={16}
                max={100}
                validation={{
                  min: 16,
                  max: 100,
                  typicalMin: 20,
                  typicalMax: 70,
                  errorMessage: t('validation.ageRange', { min: 16, max: 100 }),
                  warningMessage: t('validation.typicalBetween', { min: 20, max: 70 }),
                }}
              />

              <LabeledNumberInput
                id="legalRetirementAge"
                label={t('personal.fields.legalRetirementAge.label')}
                value={params.legalRetirementAge}
                onChange={(value) => updateParams({ legalRetirementAge: value })}
                helpText={t('personal.fields.legalRetirementAge.help')}
                tooltip={t('personal.fields.legalRetirementAge.tooltip')}
                className="w-full"
                min={60}
                max={75}
                validation={{
                  min: 60,
                  max: 75,
                  typicalMin: 65,
                  typicalMax: 70,
                  errorMessage: t('validation.ageRange', { min: 60, max: 75 }),
                  warningMessage: t('validation.typicalBetween', { min: 65, max: 70 }),
                }}
              />
            </div>

            <WizardSliderField
              id="retirementAge"
              label={t('personal.fields.retirementAge.label')}
              value={params.retirementAge}
              onValueChange={(value) => updateParams({ retirementAge: value })}
              min={retirementSliderMin}
              max={70}
              step={1}
              valueLabel={t('personal.fields.retirementAge.valueLabel', {
                value: formatInteger(params.retirementAge),
              })}
              minLabel={formatInteger(retirementSliderMin)}
              maxLabel={formatInteger(70)}
              helpText={t('personal.fields.retirementAge.help')}
              meta={
                <p className="border-2 border-dashed border-neo-black/30 bg-neo-blue/5 px-3 py-2 text-xs font-medium leading-relaxed text-neo-black">
                  {t('personal.timeline', { workingYears, retirementYears })}
                </p>
              }
            />

            {timelineIssues.length > 0 && (
              <div
                role="alert"
                className="flex items-start gap-3 border-2 border-neo-orange bg-neo-orange/10 px-4 py-3"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-neo-orange" />
                <div className="space-y-1 text-xs font-medium leading-relaxed text-neo-black">
                  {timelineIssues.map((issue) => (
                    <p key={issue}>{issue}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2">
              <LabeledNumberInput
                id="endAge"
                label={t('personal.fields.endAge.label')}
                value={params.endAge}
                onChange={(value) => updateParams({ endAge: value })}
                helpText={t('personal.fields.endAge.help')}
                tooltip={t('personal.fields.endAge.tooltip')}
                className="w-full"
                min={65}
                max={110}
                validation={{
                  min: 65,
                  max: 110,
                  typicalMin: 85,
                  typicalMax: 100,
                  errorMessage: t('validation.ageRange', { min: 65, max: 110 }),
                  warningMessage: t('validation.typicalBetween', { min: 85, max: 100 }),
                }}
              />
            </div>

          </div>
        )

      case 'assets':
        return (
          <div className="space-y-7">
            <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2">
              <LabeledNumberInput
                id="currentAssets"
                label={t('assets.fields.currentAssets.label')}
                value={params.currentAssets}
                onChange={(value) => updateParams({ currentAssets: value })}
                helpText={t('assets.fields.currentAssets.help')}
                className="w-full"
                unit={t('units.currency')}
                groupThousands
                min={0}
                validation={{
                  min: 0,
                  typicalMax: 10_000_000,
                  errorMessage: t('validation.nonNegative'),
                  warningMessage: t('validation.typicalBetween', {
                    min: formatCurrency(0),
                    max: formatCurrency(10_000_000),
                  }),
                }}
              />

              <LabeledNumberInput
                id="annualSavings"
                label={t('assets.fields.annualSavings.label')}
                value={params.annualSavings}
                onChange={(value) => updateParams({ annualSavings: value })}
                helpText={t('assets.fields.annualSavings.help')}
                className="w-full"
                unit={t('units.currency')}
                groupThousands
                min={0}
                validation={{
                  min: 0,
                  typicalMax: 200_000,
                  errorMessage: t('validation.nonNegative'),
                  warningMessage: t('validation.typicalBetween', {
                    min: formatCurrency(0),
                    max: formatCurrency(200_000),
                  }),
                }}
              />

              <LabeledNumberInput
                id="annualSavingsGrowthRate"
                label={t('assets.fields.annualSavingsGrowthRate.label')}
                value={params.annualSavingsGrowthRate * 100}
                onChange={(value) => updateParams({ annualSavingsGrowthRate: value / 100 })}
                helpText={t('assets.fields.annualSavingsGrowthRate.help')}
                className="w-full"
                unit={t('units.percentPerYear')}
                min={-10}
                max={20}
                validation={{
                  min: -10,
                  max: 20,
                  typicalMin: 0,
                  typicalMax: 5,
                  errorMessage: t('validation.typicalBetween', {
                    min: formatPercent(-0.1, 0),
                    max: formatPercent(0.2, 0),
                  }),
                  warningMessage: t('validation.typicalBetween', {
                    min: formatPercent(0, 0),
                    max: formatPercent(0.05, 0),
                  }),
                }}
              />

              <LabeledNumberInput
                id="monthlyPension"
                label={t('assets.fields.monthlyPension.label')}
                value={params.monthlyPension}
                onChange={(value) => updateParams({ monthlyPension: value })}
                helpText={t('assets.fields.monthlyPension.help')}
                className="w-full"
                unit={t('units.currency')}
                groupThousands
                min={0}
                validation={{
                  min: 0,
                  typicalMax: 10_000,
                  errorMessage: t('validation.nonNegative'),
                  warningMessage: t('validation.typicalBetween', {
                    min: formatCurrency(0),
                    max: formatCurrency(10_000),
                  }),
                }}
              />
            </div>

            <div className="space-y-4 border-2 border-neo-black bg-neo-white px-4 py-5 shadow-neo-xs sm:px-5">
              <div>
                <h5 className="text-[0.72rem] font-extrabold uppercase tracking-[0.16em] text-neo-black">
                  {t('assets.oneTimeIncomes.title')}
                </h5>
                <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
                  {t('assets.oneTimeIncomes.help')}
                </p>
              </div>
              <OneTimeIncomeList
                incomes={params.oneTimeIncomes}
                minAge={params.currentAge}
                maxAge={params.endAge}
                defaultAge={Math.max(params.retirementAge, params.currentAge + 1)}
                strings={{
                  addButton: t('assets.oneTimeIncomes.add'),
                  empty: t('assets.oneTimeIncomes.empty'),
                  emptyHint: t('assets.oneTimeIncomes.emptyHint'),
                  nameLabel: t('assets.oneTimeIncomes.nameLabel'),
                  namePlaceholder: t('assets.oneTimeIncomes.namePlaceholder'),
                  ageLabel: t('assets.oneTimeIncomes.ageLabel'),
                  agePrefix: tUi('age'),
                  amountLabel: t('assets.oneTimeIncomes.amountLabel'),
                  addHint: t('assets.oneTimeIncomes.addHint'),
                  remove: t('assets.oneTimeIncomes.remove'),
                  edit: t('assets.oneTimeIncomes.edit'),
                  save: t('assets.oneTimeIncomes.save'),
                  cancel: t('assets.oneTimeIncomes.cancel'),
                  tableHeaders: {
                    name: t('assets.oneTimeIncomes.table.name'),
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

      case 'expenses': {
        const templates = buildCashFlowTemplates((key) => t(`cashFlows.templates.items.${key}`), {
          currentAge: params.currentAge,
          retirementAge: params.retirementAge,
          legalRetirementAge: params.legalRetirementAge,
          endAge: params.endAge,
        })

        return (
          <div className="space-y-5">
            <CashFlowList
              flows={params.cashFlows ?? []}
              currentAge={params.currentAge}
              retirementAge={params.retirementAge}
              endAge={params.endAge}
              templates={templates}
              onChange={(cashFlows) => updateParams({ cashFlows })}
            />
          </div>
        )
      }

      case 'market':
        return (
          <div className="space-y-7">
            <WizardSliderField
              id="averageROI"
              label={t('market.averageROI.label')}
              value={params.averageROI * 100}
              onValueChange={(value) => updateParams({ averageROI: value / 100 })}
              min={3}
              max={12}
              step={0.5}
              valueLabel={formatPercent(params.averageROI, 1)}
              minLabel={formatPercent(0.03, 0)}
              maxLabel={formatPercent(0.12, 0)}
              helpText={t('market.averageROI.help')}
            />

            <WizardSliderField
              id="averageInflation"
              label={t('market.averageInflation.label')}
              value={params.averageInflation * 100}
              onValueChange={(value) => updateParams({ averageInflation: value / 100 })}
              min={1}
              max={6}
              step={0.1}
              valueLabel={formatPercent(params.averageInflation, 1)}
              minLabel={formatPercent(0.01, 0)}
              maxLabel={formatPercent(0.06, 0)}
              helpText={t('market.averageInflation.help')}
            />

            <div className="flex items-center justify-between gap-3 border-2 border-dashed border-neo-black/30 bg-neo-blue/5 px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground">
                {t('market.realReturn')}
              </span>
              <span className="text-sm font-bold tabular-nums text-neo-black">
                {formatPercent(realReturn, 1)}
              </span>
            </div>

            <WizardSliderField
              id="simulationRuns"
              label={t('market.simulationRuns.label')}
              value={params.simulationRuns}
              onValueChange={(value) => updateParams({ simulationRuns: value })}
              min={100}
              max={5000}
              step={100}
              valueLabel={formatInteger(params.simulationRuns)}
              minLabel={formatInteger(100)}
              maxLabel={formatInteger(5000)}
              helpText={t('market.simulationRuns.help')}
            />
          </div>
        )

      default:
        return null
    }
  }

  const progressPercent = Math.round(((currentStep + 1) / steps.length) * 100)
  const progressLabel = t('progress.step', { current: currentStep + 1, total: steps.length })
  const percentLabel = t('progress.percentComplete', { percent: progressPercent })
  const minutesLeft = Math.max(1, Math.ceil((steps.length - currentStep - 1) * 1.25))

  return (
    <div className="app-page app-page-setup relative min-h-screen pb-16">
      {/* Route-transition indicator: the dashboard route can take a moment to
          compile and render, and without this the wizard simply appears to
          have swallowed the click. */}
      {isNavigating && (
        <div
          role="status"
          aria-live="polite"
          data-testid="route-transition"
          className="fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-neo-black/10"
        >
          <span className="block h-full w-1/3 animate-route-progress bg-neo-blue" />
          <span className="sr-only">{t('finish.opening')}</span>
        </div>
      )}
      <header id="navigation" className="theme-page-header relative z-10 pt-12 pb-10">
        <div className="theme-container mx-auto max-w-[90rem] px-2 sm:px-3 lg:px-4">
          <div
            className={cn(glassCardClass, 'theme-hero relative overflow-hidden px-5 py-7 sm:px-8 sm:py-10')}
          >
            <div className="theme-hero-accent absolute right-8 top-8 hidden h-12 w-12 rotate-6 border-3 border-neo-black bg-neo-yellow/40 md:block" />
            <div className="theme-hero-mark pointer-events-none absolute -left-8 -bottom-6 hidden h-16 w-16 -rotate-3 border-3 border-neo-black bg-neo-blue/20 md:block" />

            <div className="theme-hero-layout relative flex flex-col gap-8">
              <div className="theme-hero-top flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-col gap-5 text-neo-black">
                  <div className="theme-badge-row flex flex-wrap items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em]">
                    <span className="inline-flex items-center gap-2 border-3 border-neo-black bg-secondary px-4 py-1.5 text-secondary-foreground shadow-neo-sm">
                      {t('header.badges.guide')}
                    </span>
                    <span className="inline-flex items-center gap-2 border-3 border-neo-black bg-neo-white px-4 py-1.5 text-muted-foreground shadow-neo-sm">
                      {t('header.badges.time')}
                    </span>
                    {/* Which plan this session is editing — the wizard writes to
                        a working copy, never straight into the stored plan. */}
                    <span
                      data-testid="wizard-plan-context"
                      className="inline-flex items-center gap-2 border-3 border-neo-black bg-neo-blue/10 px-4 py-1.5 text-neo-black shadow-neo-sm"
                    >
                      {t('planContext.editing', { name: activePlanName })}
                    </span>
                    {isDirty && (
                      <span className="inline-flex items-center gap-2 border-3 border-neo-black bg-neo-yellow px-4 py-1.5 text-neo-black shadow-neo-sm">
                        {t('planContext.unsaved')}
                      </span>
                    )}
                  </div>
                  <div>
                    <h1 className="text-3xl font-black sm:text-4xl">{t('header.title')}</h1>
                    <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-foreground/80">
                      {t('header.subtitle')}
                    </p>
                    <p className="mt-2 max-w-2xl text-xs font-medium leading-relaxed text-muted-foreground">
                      {t('planContext.hint')}
                    </p>
                  </div>
                </div>

                <div className="theme-action-strip flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <AuthMenu className="w-full sm:w-56" />
                  <ThemeSwitcher className="w-full sm:w-56" />
                  <LocaleSwitcher className="w-full sm:w-40" />
                  <Button variant="secondary" size="sm" asChild className="min-w-[11rem]">
                    <Link href="/simulation">{t('header.simulationLink')}</Link>
                  </Button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="theme-container relative z-10 mx-auto mt-2 max-w-[90rem] px-2 pb-16 sm:px-3 lg:px-4"
      >
        <div className="theme-page-grid theme-setup-grid grid grid-cols-1 gap-8 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside
            className={cn(
              glassCardClass,
              'theme-sidebar theme-stepper space-y-6 p-6 lg:sticky lg:top-6 lg:self-start'
            )}
          >
            {/* Single canonical progress statement for the whole page: the
                step counter, the bar and the time estimate live here only. */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[0.78rem] font-extrabold uppercase tracking-[0.16em] text-neo-black">
                  {progressLabel}
                </p>
                <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span className="tabular-nums">{percentLabel}</span>
                  {progressPercent === 100 && (
                    <Check className="h-3.5 w-3.5 text-neo-green" aria-hidden="true" />
                  )}
                </p>
              </div>
              <div
                className="theme-progress-bar relative h-3 w-full overflow-hidden border-2 border-neo-black bg-neo-white shadow-neo-xs"
                role="progressbar"
                aria-label={`${progressLabel}, ${percentLabel}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
              >
                <div
                  className="h-full bg-neo-blue transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                <span>
                  {t('progress.timeRemaining')}:{' '}
                  <span className="tabular-nums text-neo-black">
                    {t('progress.minutesRemaining', { minutes: minutesLeft })}
                  </span>
                </span>
                <span className="normal-case tracking-normal">{t('progress.autosave')}</span>
              </div>
            </div>


            <div className="hidden lg:block">
              <ol
                aria-label={t('progress.stepsLabel')}
                className="theme-step-list m-0 list-none space-y-6 p-0"
              >
                {steps.map((step, index) => {
                  const isCompleted = index < currentStep
                  const isActive = index === currentStep
                  const statusLabel = isCompleted
                    ? tStatus('completed')
                    : isActive
                      ? tStatus('current')
                      : tStatus('notStarted')

                  return (
                    <li key={step.id} className="theme-step-item relative pl-12">
                      {index < steps.length - 1 && (
                        <span
                          className={cn(
                            'theme-step-connector absolute left-5 top-11 h-[calc(100%-2.75rem)] w-px bg-neo-black/20',
                            isCompleted && 'bg-neo-black'
                          )}
                        />
                      )}

                      <span
                        aria-hidden="true"
                        className={cn(
                          'theme-step-button absolute left-0 top-0 flex h-10 w-10 items-center justify-center border-3 border-neo-black bg-neo-white font-extrabold text-neo-black shadow-neo-xs transition-neo',
                          isCompleted && 'bg-secondary',
                          isActive && !isCompleted && 'bg-neo-white ring-3 ring-neo-blue ring-offset-2',
                          !isCompleted && !isActive && 'bg-muted text-muted-foreground'
                        )}
                      >
                        {isCompleted ? (
                          <Check className="h-5 w-5 text-secondary-foreground" />
                        ) : (
                          <span className="text-sm">{index + 1}</span>
                        )}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleStepClick(index)}
                        aria-label={`${step.title} - ${statusLabel}`}
                        aria-current={isActive ? 'step' : undefined}
                        className="theme-step-copy group relative block w-full cursor-pointer text-left before:absolute before:-left-12 before:inset-y-0 before:right-0 before:content-['']"
                      >
                        <p
                          className={cn(
                            'text-[0.78rem] font-bold uppercase tracking-[0.16em] transition-colors',
                            isCompleted || isActive ? 'text-neo-black' : 'text-muted-foreground',
                            'group-hover:text-neo-blue'
                          )}
                        >
                          {step.title}
                        </p>
                        <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
                          {step.description}
                        </p>
                        <p
                          className={cn(
                            'mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em]',
                            isActive ? 'text-neo-blue' : 'text-muted-foreground/70'
                          )}
                        >
                          {statusLabel}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          </aside>

          <section className="theme-content theme-setup-content space-y-5">
            <Card className={cn(glassCardClass, 'theme-active-step-card')}>
              <CardHeader className="border-b-3 border-neo-black bg-neo-white">
                <CardTitle
                  ref={stepHeadingRef}
                  tabIndex={-1}
                  className="text-xl font-extrabold uppercase tracking-[0.12em] text-neo-black"
                >
                  {steps[currentStep].title}
                </CardTitle>
                <CardDescription className="mt-1 text-xs font-medium normal-case leading-relaxed tracking-normal text-muted-foreground">
                  {steps[currentStep].description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div key={activeStepKey} className="animate-step-in">
                  {renderStepContent()}
                </div>
              </CardContent>
            </Card>

            {/* Spacer so the fixed mobile action bar never covers the last
                rows of the step card. Desktop keeps the bar in flow. */}
            <div className="h-[5.5rem] sm:hidden" aria-hidden="true" />

            <div className="theme-wizard-actions fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t-3 border-neo-black bg-background px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 shadow-[0_-4px_0_0_rgba(0,0,0,0.06)] sm:static sm:z-auto sm:mx-0 sm:flex-row sm:items-start sm:justify-between sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:shadow-none">
              <div className="flex items-center gap-3 sm:contents">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBack}
                  disabled={currentStep === 0}
                  className="flex-1 disabled:border-neo-black/40 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none sm:flex-none sm:min-w-[10rem]"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('buttons.back')}
                </Button>

                <div className="flex flex-1 flex-col items-stretch gap-1.5 sm:flex-none sm:items-end sm:gap-2">
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
                  {currentStep < steps.length - 1 && (
                    <p className="hidden text-[0.65rem] font-medium text-muted-foreground sm:block sm:text-right">
                      {t('buttons.upNext', { step: steps[currentStep + 1].title })}
                    </p>
                  )}
                </div>
              </div>
              {currentStep < steps.length - 1 && (
                <p className="text-center text-[0.62rem] font-medium text-muted-foreground sm:hidden">
                  {t('buttons.upNext', { step: steps[currentStep + 1].title })}
                </p>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* The wizard edits the same working copy as the dashboard, so finishing
          is an explicit decision: update the plan, branch off a new one, or
          throw the session away. Nothing is written until one is picked. */}
      <Dialog open={savePlanOpen} onOpenChange={setSavePlanOpen}>
        <DialogContent className="bg-neo-white sm:max-w-[32rem]" data-testid="wizard-finish-dialog">
          <DialogHeader>
            <DialogTitle>
              {isFirstRun ? t('finish.firstRunTitle') : t('finish.title')}
            </DialogTitle>
            <DialogDescription>
              {isFirstRun
                ? t('finish.firstRunDescription')
                : isDirty
                  ? t('finish.descriptionNamed', { name: activePlanName })
                  : t('finish.descriptionClean')}
            </DialogDescription>
          </DialogHeader>

          {isFirstRun && (
            <div className="py-2">
              <Label htmlFor="wizard-plan-name" className="text-sm font-medium">
                {tPlans('dialogs.wizard.label')}
              </Label>
              <Input
                id="wizard-plan-name"
                autoFocus
                maxLength={60}
                value={planNameDraft}
                placeholder={activePlanName}
                onChange={(event) => setPlanNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleFirstRunFinish()
                }}
                className="mt-2 h-11 border-2 border-neo-black bg-neo-white px-3 py-2 text-[0.78rem] font-semibold"
              />
            </div>
          )}

          <DialogFooter className="sm:flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setSavePlanOpen(false)}>
              {t('finish.back')}
            </Button>

            {isFirstRun ? (
              <Button
                size="sm"
                data-testid="wizard-finish-continue"
                onClick={handleFirstRunFinish}
                disabled={isNavigating}
                aria-busy={isNavigating}
              >
                {isNavigating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isNavigating ? t('finish.opening') : t('finish.continue')}
              </Button>
            ) : (
              <>
                {isDirty && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-neo-red"
                    data-testid="wizard-finish-discard"
                    disabled={isNavigating}
                    onClick={() => {
                      revertPlanDraft()
                      setSavePlanOpen(false)
                      finishSetup()
                    }}
                  >
                    {t('finish.discard')}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="wizard-finish-new"
                  onClick={() => setNewPlanOpen(true)}
                >
                  {t('finish.saveAsNew')}
                </Button>
                <Button
                  size="sm"
                  data-testid="wizard-finish-update"
                  disabled={isNavigating}
                  aria-busy={isNavigating}
                  onClick={() => {
                    savePlanDraft()
                    setSavePlanOpen(false)
                    finishSetup()
                  }}
                >
                  {isNavigating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isNavigating
                    ? t('finish.opening')
                    : t('finish.update', { name: activePlanName })}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PlanNameDialog
        open={newPlanOpen}
        onOpenChange={setNewPlanOpen}
        inputId="wizard-new-plan-name"
        title={tPlans('dialogs.wizard.title')}
        description={tPlans('dialogs.wizard.description')}
        label={tPlans('dialogs.wizard.label')}
        placeholder={tPlans('dialogs.wizard.placeholder')}
        confirmLabel={tPlans('dialogs.wizard.save')}
        onConfirm={(name) => {
          createPlan(name)
          setSavePlanOpen(false)
          finishSetup()
        }}
      />
    </div>
  )
}
