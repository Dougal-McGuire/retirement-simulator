'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Landmark } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { SimulationParams, SimulationResults } from '@/types'
import {
  areSimulationParamsEqual,
  buildScenarioParams,
  getPlanHealth,
  type PlanHealth,
} from '@/lib/simulation/planInsights'
import { Card, CardContent } from '@/components/ui/card'
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
}

const healthClasses: Record<PlanHealth, string> = {
  strong: 'border-success-600 bg-success-50 text-success-700',
  watch: 'border-warning-600 bg-warning-50 text-warning-700',
  strained: 'border-neo-red bg-red-50 text-neo-red',
}

export function ScenarioList({ params, results, isLoading }: ScenarioListProps) {
  const t = useTranslations('planDashboard')
  const [scenarios, setScenarios] = useState<ScenarioResult[]>([])
  const [scenarioStatus, setScenarioStatus] = useState<'idle' | 'loading' | 'ready'>('idle')

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
      const nextScenarios = await Promise.all(
        scenarioParams.map(async (scenario) => {
          const scenarioResults = await runSimulationInClient(scenario.params)
          return {
            id: scenario.id,
            successRate: scenarioResults.successRate,
            delta: scenarioResults.successRate - results.successRate,
          }
        })
      )

      if (cancelled) return
      setScenarios(nextScenarios.sort((a, b) => b.delta - a.delta))
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
            {scenarioStatus === 'loading' ? t('scenarios.loading') : t('scenarios.preview')}
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {(scenarioStatus === 'loading' ? buildScenarioParams(params) : scenarios).map(
            (scenario) => {
              const isResolved = 'delta' in scenario
              const health = isResolved ? getPlanHealth(scenario.successRate) : 'watch'

              return (
                <div
                  key={scenario.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 border-2 border-neo-black bg-neo-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-neo-black">
                      {t(`scenarios.items.${scenario.id}.name`)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {t(`scenarios.items.${scenario.id}.description`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    {isResolved ? (
                      <>
                        <span
                          className={cn(
                            'border-2 px-2 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em]',
                            healthClasses[health]
                          )}
                        >
                          {scenario.delta >= 0 ? '+' : ''}
                          {scenario.delta.toFixed(1)} pts
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span className="w-14 text-[0.72rem] font-black">
                          {scenario.successRate.toFixed(1)}%
                        </span>
                      </>
                    ) : (
                      <span className="h-7 w-24 animate-pulse border-2 border-neo-black bg-muted" />
                    )}
                  </div>
                </div>
              )
            }
          )}
        </div>
      </CardContent>
    </Card>
  )
}
