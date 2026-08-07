'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { GitCompareArrows } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { MAX_COMPARISON_PLANS, type Plan, type SimulationResults } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  axisTick,
  chartInk,
  ChartLegend,
  ChartTooltipCard,
  LegendSwatch,
  type TooltipRow,
} from '@/components/charts/chartTheme'
import { useChartFormatters } from '@/components/charts/useChartData'
import { deriveDepletionAges } from '@/lib/insights/depletion'
import { planDisplayName } from '@/lib/plans/planName'
import { areSimulationParamsEqual, getPlanHealth } from '@/lib/simulation/planInsights'
import { useActivePlanId, usePlans } from '@/lib/stores/simulationStore'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

/** Comparison runs are on demand, so they can be cheaper than the live plan. */
const COMPARISON_RUNS = 1200
const MIN_COMPARISON_PLANS = 2

/** One hue per compared plan, all drawn from the active theme's tokens. */
const planHues = [
  { solid: 'var(--neo-blue)', rgb: '--neo-blue-rgb' },
  { solid: 'var(--neo-purple)', rgb: '--neo-purple-rgb' },
  { solid: 'var(--neo-green)', rgb: '--neo-green-rgb' },
] as const

interface ComparisonRow {
  planId: string
  name: string
  results: SimulationResults
  successRate: number
  medianEndAssets: number
  depletionRisk: number
  shortfallAge: number | null
}

const healthClasses = {
  strong: 'border-success-600 bg-success-50 text-success-700',
  watch: 'border-warning-600 bg-warning-50 text-warning-700',
  strained: 'border-neo-red bg-red-50 text-neo-red',
} as const

const buildRow = (plan: Plan, name: string, results: SimulationResults): ComparisonRow => {
  const lastIndex = Math.max(0, results.ages.length - 1)
  const depletionShare = results.depletionByAge?.[lastIndex]

  return {
    planId: plan.id,
    name,
    results,
    successRate: results.successRate,
    medianEndAssets: results.assetPercentiles.p50[lastIndex] ?? 0,
    depletionRisk:
      typeof depletionShare === 'number' ? depletionShare * 100 : 100 - results.successRate,
    shortfallAge: deriveDepletionAges(results).p10DepletionAge,
  }
}

export function PlanComparison() {
  const t = useTranslations('plans')
  const tc = useTranslations('plans.comparison')
  const format = useFormatter()
  const isMobile = useIsMobile()
  const plans = usePlans()
  const activePlanId = useActivePlanId()
  const { formatCurrency, formatCurrencyShort } = useChartFormatters()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [rows, setRows] = useState<ComparisonRow[]>([])
  const [status, setStatus] = useState<'idle' | 'running' | 'ready' | 'error'>('idle')
  const runIdRef = useRef(0)

  const chartFrameRef = useRef<HTMLDivElement>(null)
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const frame = chartFrameRef.current
    if (!frame) return

    const measure = () =>
      setChartSize({
        width: Math.max(320, Math.floor(frame.clientWidth)),
        height: Math.max(220, Math.floor(frame.clientHeight)),
      })

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [rows.length])

  // Default selection: the active plan plus the next one, kept valid as plans
  // are created or deleted. Never triggers a run on its own.
  useEffect(() => {
    setSelectedIds((current) => {
      const stillValid = current.filter((id) => plans.some((plan) => plan.id === id))
      if (stillValid.length >= MIN_COMPARISON_PLANS) return stillValid

      const seeded = [activePlanId, ...plans.map((plan) => plan.id)]
        .filter((id, index, list) => id && list.indexOf(id) === index)
        .filter((id) => plans.some((plan) => plan.id === id))
        .slice(0, MIN_COMPARISON_PLANS)

      return seeded
    })
  }, [plans, activePlanId])

  const selectedPlans = useMemo(
    () =>
      selectedIds
        .map((id) => plans.find((plan) => plan.id === id))
        .filter((plan): plan is Plan => Boolean(plan)),
    [selectedIds, plans]
  )

  const canRun = selectedPlans.length >= MIN_COMPARISON_PLANS && status !== 'running'
  const hasEnoughPlans = plans.length >= MIN_COMPARISON_PLANS

  const togglePlan = (id: string) => {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        return current.length <= 1 ? current : current.filter((entry) => entry !== id)
      }
      if (current.length >= MAX_COMPARISON_PLANS) return current
      return [...current, id]
    })
  }

  const runComparison = async () => {
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setStatus('running')

    try {
      const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
      const nextRows: ComparisonRow[] = []

      for (const plan of selectedPlans) {
        const results = await runSimulationInClient({
          ...plan.params,
          simulationRuns: Math.min(plan.params.simulationRuns, COMPARISON_RUNS),
        })
        nextRows.push(buildRow(plan, planDisplayName(plan, t), results))
      }

      if (runIdRef.current !== runId) return
      setRows(nextRows)
      setStatus('ready')
    } catch (error) {
      console.error('Plan comparison failed:', error)
      if (runIdRef.current !== runId) return
      setRows([])
      setStatus('error')
    }
  }

  // A row is stale once its plan's parameters moved on since the run.
  const staleRows = useMemo(
    () =>
      rows.filter((row) => {
        const plan = plans.find((entry) => entry.id === row.planId)
        if (!plan) return true
        return !areSimulationParamsEqual(
          { ...plan.params, simulationRuns: row.results.params.simulationRuns },
          row.results.params
        )
      }),
    [rows, plans]
  )

  const chartData = useMemo(() => {
    if (rows.length === 0) return []

    const ages = Array.from(new Set(rows.flatMap((row) => row.results.ages))).sort((a, b) => a - b)

    return ages.map((age) => {
      const point: Record<string, number | null> = { age }
      rows.forEach((row, index) => {
        const ageIndex = row.results.ages.indexOf(age)
        point[`plan${index}`] = ageIndex === -1 ? null : row.results.assetPercentiles.p50[ageIndex]
      })
      return point
    })
  }, [rows])

  const bestSuccess = rows.length > 0 ? Math.max(...rows.map((row) => row.successRate)) : null
  const retirementAges = Array.from(
    new Set(rows.map((row) => row.results.params.retirementAge))
  ).sort((a, b) => a - b)

  const formatPercentValue = (value: number) =>
    format.number(value / 100, {
      style: 'percent',
      minimumFractionDigits: value % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    })

  const renderTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean
    payload?: ReadonlyArray<{ dataKey?: string | number; value?: number | null }>
    label?: string | number
  }) => {
    if (!active || !payload?.length) return null

    const tooltipRows = rows
      .map((row, index): TooltipRow | null => {
        const entry = payload.find((item) => item.dataKey === `plan${index}`)
        if (!entry || entry.value == null) return null
        return {
          key: row.planId,
          label: row.name,
          value: formatCurrency(entry.value),
          kind: 'line',
          color: planHues[index % planHues.length].solid,
        }
      })
      .filter((row): row is TooltipRow => row !== null)

    if (tooltipRows.length === 0) return null

    return <ChartTooltipCard title={tc('chart.tooltip', { age: label ?? '' })} rows={tooltipRows} />
  }

  return (
    <Card className="overflow-hidden" data-testid="plan-comparison">
      <CardContent className="bg-neo-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <GitCompareArrows className="mt-0.5 h-5 w-5 shrink-0 text-neo-blue" aria-hidden="true" />
            <div>
              <h4 className="text-sm font-extrabold uppercase tracking-[0.16em]">{tc('title')}</h4>
              <p className="mt-1 max-w-xl text-xs font-medium text-muted-foreground">
                {tc('subtitle')}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => void runComparison()}
            disabled={!canRun}
            data-testid="plan-comparison-run"
          >
            {status === 'running' ? tc('running') : status === 'ready' ? tc('rerun') : tc('run')}
          </Button>
        </div>

        <fieldset className="mt-5 border-0 p-0">
          <legend className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
            {tc('select')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {plans.map((plan) => {
              const index = selectedIds.indexOf(plan.id)
              const isSelected = index !== -1
              const hue = isSelected ? planHues[index % planHues.length] : null

              return (
                <button
                  key={plan.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => togglePlan(plan.id)}
                  disabled={!isSelected && selectedIds.length >= MAX_COMPARISON_PLANS}
                  data-testid="plan-comparison-option"
                  className={cn(
                    'flex items-center gap-2 border-2 px-3 py-2 text-[0.66rem] font-extrabold uppercase tracking-[0.12em] transition-neo',
                    isSelected
                      ? 'border-neo-black bg-neo-white text-neo-black shadow-neo-xs'
                      : 'border-neo-black/30 bg-muted text-muted-foreground hover:border-neo-black',
                    !isSelected && selectedIds.length >= MAX_COMPARISON_PLANS && 'opacity-40'
                  )}
                >
                  {hue ? (
                    <LegendSwatch kind="line" color={hue.solid} />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="inline-block h-[3px] w-4 shrink-0 rounded-full bg-neo-black/20"
                    />
                  )}
                  <span className="max-w-[12rem] truncate">{planDisplayName(plan, t)}</span>
                  {plan.id === activePlanId && (
                    <span className="text-[0.56rem] font-semibold tracking-[0.1em] text-neo-blue">
                      {tc('active')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[0.62rem] font-medium text-muted-foreground">
            {hasEnoughPlans
              ? tc('hint', { min: MIN_COMPARISON_PLANS, max: MAX_COMPARISON_PLANS })
              : tc('needMorePlans')}
          </p>
        </fieldset>

        {status === 'error' && (
          <p className="mt-4 border-2 border-neo-red bg-red-50 px-3 py-2 text-xs font-semibold text-neo-red">
            {tc('error')}
          </p>
        )}

        {rows.length === 0 ? (
          <p className="mt-5 border-2 border-dashed border-neo-black/30 px-4 py-6 text-center text-xs font-medium text-muted-foreground">
            {status === 'running' ? tc('running') : tc('empty')}
          </p>
        ) : (
          <>
            {staleRows.length > 0 && (
              <p className="mt-4 border-2 border-warning-600 bg-warning-50 px-3 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-warning-700">
                {tc('stale')}
              </p>
            )}

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-neo-black text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                    <th scope="col" className="py-2 pr-3">
                      {tc('columns.plan')}
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      {tc('columns.successRate')}
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      {tc('columns.medianEnd')}
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right">
                      {tc('columns.depletionRisk')}
                    </th>
                    <th scope="col" className="py-2 text-right">
                      {tc('columns.shortfallAge')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const hue = planHues[index % planHues.length]
                    const health = getPlanHealth(row.successRate)

                    return (
                      <tr
                        key={row.planId}
                        className="border-b border-neo-black/15 text-[0.72rem] font-semibold text-neo-black"
                        data-testid="plan-comparison-row"
                      >
                        <th scope="row" className="py-3 pr-3 font-extrabold">
                          <span className="flex items-center gap-2">
                            <LegendSwatch kind="line" color={hue.solid} />
                            <span className="max-w-[12rem] truncate">{row.name}</span>
                          </span>
                        </th>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 border-2 px-2 py-1 text-[0.66rem] font-extrabold',
                              healthClasses[health]
                            )}
                          >
                            {formatPercentValue(row.successRate)}
                            {bestSuccess !== null && row.successRate === bestSuccess && (
                              <span className="text-[0.54rem] tracking-[0.1em]">{tc('best')}</span>
                            )}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          {formatCurrency(row.medianEndAssets)}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          {formatPercentValue(row.depletionRisk)}
                        </td>
                        <td className="py-3 text-right tabular-nums">
                          {row.shortfallAge ?? tc('never')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-6 border-3 border-neo-black bg-neo-white p-4 shadow-neo-sm">
              <h5 className="text-[0.72rem] font-extrabold uppercase tracking-[0.16em] text-neo-black">
                {tc('chart.title')}
              </h5>
              <p className="mt-1 text-[0.66rem] font-medium text-muted-foreground">
                {tc('chart.description')}
              </p>

              <ChartLegend
                className="mt-3"
                items={rows.map((row, index) => ({
                  key: row.planId,
                  label: row.name,
                  kind: 'line',
                  color: planHues[index % planHues.length].solid,
                }))}
              />

              <div
                ref={chartFrameRef}
                className="mt-3 h-[16rem] w-full min-w-0 sm:h-[19rem]"
                role="img"
                aria-label={tc('chart.aria')}
              >
                {chartSize.width > 0 && (
                  <LineChart
                    width={chartSize.width}
                    height={chartSize.height}
                    data={chartData}
                    margin={
                      isMobile
                        ? { top: 12, right: 8, left: 0, bottom: 4 }
                        : { top: 16, right: 16, left: 4, bottom: 4 }
                    }
                  >
                    <CartesianGrid vertical={false} stroke={chartInk.grid} strokeWidth={1} />
                    <XAxis
                      dataKey="age"
                      tick={axisTick(isMobile)}
                      tickLine={false}
                      tickMargin={8}
                      minTickGap={isMobile ? 24 : 32}
                      axisLine={{ stroke: chartInk.axisLine }}
                    />
                    <YAxis
                      // Wide enough for compact currency labels in every
                      // locale (German renders e.g. "4 Mio. €").
                      width={isMobile ? 56 : 74}
                      tick={axisTick(isMobile)}
                      tickLine={false}
                      tickMargin={6}
                      axisLine={false}
                      tickFormatter={formatCurrencyShort}
                    />
                    <Tooltip content={renderTooltip} cursor={{ stroke: chartInk.cursor }} />
                    <ReferenceLine y={0} stroke={chartInk.axisLine} strokeWidth={1} />
                    {retirementAges.map((age) => (
                      <ReferenceLine
                        key={`retirement-${age}`}
                        x={age}
                        stroke={chartInk.marker}
                        strokeDasharray="4 4"
                      />
                    ))}
                    {rows.map((row, index) => (
                      <Line
                        key={row.planId}
                        type="monotone"
                        dataKey={`plan${index}`}
                        name={row.name}
                        stroke={planHues[index % planHues.length].solid}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 3 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                )}
              </div>
            </div>

            <p className="mt-3 text-[0.6rem] font-medium text-muted-foreground">
              {tc('runsNote', { runs: COMPARISON_RUNS })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
