'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Landmark } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { MAX_PLANS, type SimulationParams, type SimulationResults } from '@/types'
import {
  areSimulationParamsEqual,
  buildScenarioBaselineParams,
  buildScenarioParams,
  getPlanHealth,
  type PlanHealth,
} from '@/lib/simulation/planInsights'
import { diffParams } from '@/lib/simulation/planDiff'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from '@/components/ui/toast'
import { ScenarioPlanDialog } from '@/components/plans/ScenarioPlanDialog'
import { planDisplayName } from '@/lib/plans/planName'
import {
  useActivePlanId,
  useCreatePlan,
  usePlans,
  useSetActivePlan,
  useSimulationStore,
} from '@/lib/stores/simulationStore'
import { useSetComparisonSelection } from '@/lib/stores/comparisonStore'
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
  strained: 'border-neo-red bg-red-50 text-neo-red',
}

/**
 * Above this success rate every lever reads "+0.4 pts → 100%", which tells the
 * user nothing. Past it the list switches to a constraint that still moves.
 */
const SATURATION_THRESHOLD = 99

const terminalP10 = (results: SimulationResults) =>
  results.assetPercentiles.p10[Math.max(0, results.ages.length - 1)] ?? 0

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

  const isSaturated = (results?.successRate ?? 0) >= SATURATION_THRESHOLD

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

  // Rounded first: locales that do not abbreviate thousands (German keeps
  // "949.171 €") would otherwise render a stray decimal.
  const formatSignedCurrency = (value: number) =>
    `${value >= 0 ? '+' : '−'}${format.number(Math.round(Math.abs(value)), {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
    })}`

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
    toast.custom(
      (instance) => (
        <div
          className={cn(
            'flex max-w-[22rem] flex-col gap-2 border-2 border-neo-black bg-neo-white px-4 py-3 shadow-neo',
            instance.visible ? 'animate-in fade-in' : 'opacity-0'
          )}
          data-testid="plan-created-toast"
        >
          <p className="text-[0.72rem] font-semibold text-neo-black">
            {tToast('planCreatedFrom', { name: createdName, source: sourceName })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8 px-3 text-[0.6rem]"
              onClick={() => {
                setActivePlan(newPlanId)
                toast.dismiss(instance.id)
              }}
              data-testid="plan-created-toast-switch"
            >
              {tToast('switchToPlan')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-[0.6rem]"
              onClick={() => toast.dismiss(instance.id)}
            >
              {tToast('dismiss')}
            </Button>
          </div>
        </div>
      ),
      { duration: 8000 }
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
      // Levers run at a reduced count for responsiveness, so the reference has
      // to be the unchanged plan measured the same way. Comparing against the
      // dashboard's full-count headline would fold sampling error into every
      // delta and can flip the sign of a lever that only ever helps.
      const baseline = await runSimulationInClient(buildScenarioBaselineParams(params))
      const baseWorstDecile = terminalP10(baseline)
      const nextScenarios = await Promise.all(
        scenarioParams.map(async (scenario) => {
          const scenarioResults = await runSimulationInClient(scenario.params)
          const worstDecileEnd = terminalP10(scenarioResults)
          return {
            id: scenario.id,
            successRate: scenarioResults.successRate,
            delta: scenarioResults.successRate - baseline.successRate,
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

    void loadScenarios().catch(() => {
      if (!cancelled) {
        setScenarios([])
        setScenarioStatus('idle')
      }
    })

    return () => {
      cancelled = true
    }
  }, [isLoading, params, results])

  return (
    <Card className="overflow-hidden">
      <CardContent className="bg-neo-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Landmark className="h-5 w-5 text-neo-blue" aria-hidden="true" />
            <h4 className="text-sm font-extrabold uppercase tracking-[0.16em]">
              {t('scenarios.title')}
            </h4>
          </div>
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {scenarioStatus === 'loading'
              ? t('scenarios.loading')
              : isSaturated && scenarioStatus === 'ready'
                ? t('scenarios.worstDecile')
                : t('scenarios.preview')}
          </span>
        </div>

        {isSaturated && scenarioStatus === 'ready' && results && (
          <p
            className="mt-3 border-2 border-success-600 bg-success-50 px-3 py-2 text-[0.66rem] font-semibold text-success-700"
            data-testid="stress-lever-saturated"
          >
            {t('scenarios.saturated', { rate: formatPercent(results.successRate) })}
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
                  className="flex flex-col gap-3 border-2 border-neo-black bg-neo-white px-4 py-3 sm:grid sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-neo-black">
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
                            'border-2 px-2 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em]',
                            isSaturated
                              ? 'border-neo-black bg-neo-white text-neo-black'
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
                      <span className="h-7 w-24 animate-pulse border-2 border-neo-black bg-muted" />
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
