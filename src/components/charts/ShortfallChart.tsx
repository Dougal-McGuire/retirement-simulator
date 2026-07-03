'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useFormatter, useTranslations } from 'next-intl'
import type { SimulationResults } from '@/types'

interface ShortfallChartProps {
  results: SimulationResults
}

export function ShortfallChart({ results }: ShortfallChartProps) {
  const t = useTranslations('shortfallChart')
  const format = useFormatter()
  const depletionByAge = results.depletionByAge

  const data = useMemo(() => {
    if (!depletionByAge) return []
    return results.ages
      .map((age, index) => ({ age, depleted: depletionByAge[index] ?? 0 }))
      .filter((point) => point.age >= results.params.retirementAge)
  }, [depletionByAge, results.ages, results.params.retirementAge])

  // Results persisted before depletionByAge existed lack the field: hide the chart
  // until the next simulation run repopulates it.
  if (!depletionByAge || data.length === 0) return null

  const formatPercent = (value: number) =>
    format.number(value, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })

  return (
    <div
      role="img"
      aria-label={t('ariaLabel')}
      className="w-full min-w-0 space-y-4 border-3 border-neo-black bg-neo-white p-4 shadow-neo sm:p-6"
    >
      <div>
        <h4 className="text-base font-extrabold uppercase tracking-[0.2em] text-neo-black sm:text-lg">
          {t('title')}
        </h4>
        <p className="mt-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--neo-black)" strokeOpacity={0.15} />
            <XAxis dataKey="age" tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis
              domain={[0, (dataMax: number) => Math.max(0.05, Math.ceil(dataMax * 20) / 20)]}
              tickFormatter={formatPercent}
              tick={{ fontSize: 11 }}
              tickLine={false}
              width={52}
            />
            <Tooltip
              formatter={(value: number | undefined) => [formatPercent(value ?? 0), t('yAxisLabel')]}
              labelFormatter={(age) => `${t('ageLabel')} ${age}`}
              contentStyle={{
                border: '3px solid var(--neo-black)',
                background: 'var(--neo-white)',
                fontSize: '12px',
              }}
            />
            <Area
              type="stepAfter"
              dataKey="depleted"
              stroke="var(--neo-red)"
              strokeWidth={2.5}
              fill="var(--neo-red)"
              fillOpacity={0.15}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
