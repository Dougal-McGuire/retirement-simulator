'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Landmark } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { MAX_PLANS, type SimulationParams, type SimulationResults } from '@/types'
import {
  areSimulationParamsEqual,
  buildScenarioParams,
  getPlanHealth,
  type PlanHealth,
} from '@/lib/simulation/planInsights'
import { diffParams } from '@/lib/simulation/planDiff'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast, TOAST_DURATION } from '@/components/ui/toast'
import { ActionToast } from '@/components/ui/action-toast'
import { ScenarioPlanDialog } from '@/components/plans/ScenarioPlanDialog'
import { planDisplayName } from '@/lib/plans/planName'
import {
  useActivePlanId,
  useCreatePlan,
  usePlans,
  useSetActivePlan,
  useSimulationStore,
} from '@/lib/stores/simulationStore'
import { useSimulationContext } from '@/lib/stores/useSimulationContext'
import { useSetComparisonSelection } from '@/lib/stores/comparisonStore'
import { useCompactCurrency } from '@/lib/hooks/useCompactCurrency'
import { cn } from '@/lib/utils'

interface ScenarioListProps {
  params: SimulationParams
  results: SimulationResults | null
  isLoading: boolean
}

type ScenarioResult = {
  id: string
  successRate: number
  delta: number
  /** P10 terminal assets — the constraint that still moves once success saturates. */
  worstDecileEnd: number
  worstDecileDelta: number
}

const healthClasses: Record<PlanHealth, string> = {
  strong: 'border-success-600 bg-success-50 text-success-700',
  watch: 'border-warning-600 bg-warning-50 text-warning-700',
  strained: 'border-danger bg-red-50 text-danger',
}

/**
 * Above this success rate every lever reads "+0.4 pts → 100%", which tells the
 * user nothing. Past it the list switches to a constraint that still moves.
 */
const SATURATION_THRESHOLD = 99

const terminalP10 = (results: SimulationResults) =>
  results.assetPercentiles.p10[Math.max(0, results.ages.length - 1)] ?? 0

/**
 * Levers now run at the plan's full count, so a slider drag would queue three
 * full simulations per keystroke. Waiting for the parameters to settle costs
 * nothing the user can perceive and keeps the honest run count affordable.
 */
const LEVER_DEBOUNCE_MS = 300

export function ScenarioList({ params, results, isLoading }: ScenarioListProps) {
  const t = useTranslations('planDashboard')
  const tPlans = useTranslations('plans')
  const tToast = useTranslations('plans.toasts')
  const format = useFormatter()
  const [scenarios, setScenarios] = useState<ScenarioResult[]>([])
  const [scenarioStatus, setScenarioStatus] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [pendingScenarioId, setPendingScenarioId] = useState<string | null>(null)
  const createPlan = useCreatePlan()
  const setActivePlan = useSetActivePlan()
  const setComparisonSelection = useSetComparisonSelection()
  const plans = usePlans()
  const activePlanId = useActivePlanId()
  const atPlanLimit = plans.length >= MAX_PLANS

  const activePlan = plans.find((plan) => plan.id === activePlanId)
  const sourceName = activePlan ? planDisplayName(activePlan, tPlans) : tPlans('label')

  // The one simulation context: the levers quote the hero's success rate as
  // their baseline instead of re-measuring one of their own.
  const context = useSimulationContext()
  const isSaturated = context.successRate >= SATURATION_THRESHOLD

  const formatPercent = (value: number) =>
    format.number(value / 100, {
      style: 'percent',
      minimumFractionDigits: value % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    })

  const formatSignedPoints = (value: number) =>
    t('scenarios.deltaPoints', {
      value: `${value >= 0 ? '+' : '−'}${format.number(Math.abs(value), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`,
    })

  // Locales that do not abbreviate thousands (German keeps "949.171 €") drop
  // the decimal entirely — see `compactCurrencyOptions`.
  const compactCurrency = useCompactCurrency()
  const formatSignedCurrency = (value: number) =>
    `${value >= 0 ? '+' : '−'}${compactCurrency(Math.round(Math.abs(value)))}`

  const formatCurrency = (value: number) =>
    format.number(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

  const pendingScenario = pendingScenarioId
    ? buildScenarioParams(params).find((entry) => entry.id === pendingScenarioId)
    : undefined

  /**
   * Turns a stress lever into a real plan: the same tweak, at the plan's full
   * run count. The new plan is created in the background — switching to it is
   * offered, never imposed — and lined up in the comparison against its source.
   */
  const saveScenarioAsPlan = (name: string) => {
    if (!pendingScenario) return

    const newPlanId = createPlan(
      name,
      { ...pendingScenario.params, simulationRuns: params.simulationRuns },
      { activate: false }
    )
    if (!newPlanId) return

    setComparisonSelection([activePlanId, newPlanId].filter(Boolean))

    // Read the stored name back: duplicates get a suffix on the way in.
    const createdName =
      useSimulationStore.getState().plans.find((plan) => plan.id === newPlanId)?.name ?? name
    toast(
      (instance) => (
        <ActionToast
          testId="plan-created-toast"
          message={tToast('planCreatedFrom', { name: createdName, source: sourceName })}
          actions={[
            {
              label: tToast('switchToPlan'),
              tone: 'primary',
              testId: 'plan-created-toast-switch',
              onClick: () => {
                setActivePlan(newPlanId)
                toast.dismiss(instance.id)
              },
            },
            { label: tToast('dismiss'), onClick: () => toast.dismiss(instance.id) },
          ]}
        />
      ),
      { duration: TOAST_DURATION }
    )
  }

  useEffect(() => {
    if (!results || isLoading || !areSimulationParamsEqual(params, results.params)) {
      setScenarios([])
      setScenarioStatus('idle')
      return
    }

    let cancelled = false
    const scenarioParams = buildScenarioParams(params)

    setScenarioStatus('loading')

    const loadScenarios = async () => {
      const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
      // The baseline IS the dashboard result — same parameters, same run count,
      // same fixed scenario set, therefore bit-identical had we re-run it. Any
      // separately measured reference could only ever contradict the hero.
      const baselineSuccessRate = results.successRate
      const baseWorstDecile = terminalP10(results)
      const nextScenarios = await Promise.all(
        scenarioParams.map(async (scenario) => {
          const scenarioResults = await runSimulationInClient(scenario.params)
          const worstDecileEnd = terminalP10(scenarioResults)
          return {
            id: scenario.id,
            successRate: scenarioResults.successRate,
            delta: scenarioResults.successRate - baselineSuccessRate,
            worstDecileEnd,
            worstDecileDelta: worstDecileEnd - baseWorstDecile,
          }
        })
      )

      if (cancelled) return
      setScenarios(
        nextScenarios.sort((a, b) =>
          results.successRate >= SATURATION_THRESHOLD
            ? b.worstDecileDelta - a.worstDecileDelta
            : b.delta - a.delta
        )
      )
      setScenarioStatus('ready')
    }

    // Full-count levers are expensive; let a slider drag settle first.
    const timer = setTimeout(() => {
      void loadScenarios().catch(() => {
        if (!cancelled) {
          setScenarios([])
          setScenarioStatus('idle')
        }
      })
    }, LEVER_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isLoading, params, results])

  return (
    <Card className="overflow-hidden">
      <CardContent className="bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Landmark className="h-5 w-5 text-accent" aria-hidden="true" />
            <h4 className="text-sm font-extrabold  ">
              {t('scenarios.title')}
            </h4>
          </div>
          <span className="text-[0.68rem] font-semibold   text-muted-foreground">
            {scenarioStatus === 'loading'
              ? t('scenarios.loading')
              : isSaturated && scenarioStatus === 'ready'
                ? t('scenarios.worstDecile')
                : t('scenarios.preview')}
          </span>
        </div>

        {/* The reference every delta below is measured against, stated in full.
            It is the hero's number verbatim, at the hero's run count. */}
        {context.hasResults && (
          <p
            className="rounded-sm mt-3 border-2 border-border bg-white px-3 py-2 text-[0.66rem] font-semibold text-ink"
            data-testid="stress-lever-baseline"
            data-baseline={context.successRate}
            data-runs={context.effectiveRuns}
          >
            {context.marketModel === 'historical'
              ? t('scenarios.baselineHistorical', {
                  rate: formatPercent(context.successRate),
                  runs: format.number(context.effectiveRuns),
                })
              : t('scenarios.baseline', {
                  rate: formatPercent(context.successRate),
                  runs: format.number(context.effectiveRuns),
                })}
          </p>
        )}

        {isSaturated && scenarioStatus === 'ready' && results && (
          <p
            className="rounded-sm mt-3 border-2 border-success-600 bg-success-50 px-3 py-2 text-[0.66rem] font-semibold text-success-700"
            data-testid="stress-lever-saturated"
          >
            {t('scenarios.saturated', { rate: formatPercent(context.successRate) })}
          </p>
        )}

        <div className="mt-5 space-y-3">
          {(scenarioStatus === 'loading' ? buildScenarioParams(params) : scenarios).map(
            (scenario) => {
              const isResolved = 'delta' in scenario
              const health = isResolved ? getPlanHealth(scenario.successRate) : 'watch'

              return (
                <div
                  key={scenario.id}
                  data-testid="stress-lever"
                  className="rounded-sm flex flex-col gap-3 border-2 border-border bg-white px-4 py-3 sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold   text-ink">
                      {t(`scenarios.items.${scenario.id}.name`)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {t(`scenarios.items.${scenario.id}.description`)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:text-right">
                    {isResolved ? (
                      <>
                        <span
                          className={cn(
                            'rounded-sm border-2 px-2 py-1 text-[0.68rem] font-extrabold  ',
                            isSaturated
                              ? 'border-border bg-white text-ink'
                              : healthClasses[health]
                          )}
                          data-testid="stress-lever-delta"
                        >
                          {isSaturated
                            ? formatSignedCurrency(scenario.worstDecileDelta)
                            : formatSignedPoints(scenario.delta)}
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span
                          className={cn(
                            'text-[0.72rem] font-black tabular-nums',
                            isSaturated ? 'min-w-[4.5rem]' : 'w-14'
                          )}
                        >
                          {isSaturated
                            ? formatCurrency(scenario.worstDecileEnd)
                            : formatPercent(scenario.successRate)}
                        </span>
                      </>
                    ) : (
                      <span className="rounded-sm h-7 w-24 animate-pulse border-2 border-border bg-muted" />
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-[0.6rem]"
                      disabled={atPlanLimit}
                      title={t('scenarios.savedHint')}
                      onClick={() => setPendingScenarioId(scenario.id)}
                      data-testid="stress-lever-save"
                    >
                      {t('scenarios.saveAsPlan')}
                    </Button>
                  </div>
                </div>
              )
            }
          )}
        </div>

        <ScenarioPlanDialog
          open={pendingScenarioId !== null}
          onOpenChange={(open) => {
            if (!open) setPendingScenarioId(null)
          }}
          sourceName={sourceName}
          suggestedName={pendingScenarioId ? t(`scenarios.items.${pendingScenarioId}.name`) : ''}
          changes={pendingScenario ? diffParams(params, pendingScenario.params) : []}
          onConfirm={saveScenarioAsPlan}
        />
      </CardContent>
    </Card>
  )
}
