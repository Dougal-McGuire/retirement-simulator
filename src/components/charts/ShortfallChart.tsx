'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { useFormatter, useTranslations } from 'next-intl'
import type { SimulationResults } from '@/types'
import { axisTick, chartInk, ChartTooltipCard, fanHue } from '@/components/charts/chartTheme'
import { useIsMobile } from '@/lib/hooks/useMediaQuery'
import { InfoTip } from '@/components/ui/info-tip'

interface ShortfallChartProps {
  results: SimulationResults
}

export function ShortfallChart({ results }: ShortfallChartProps) {
  const t = useTranslations('shortfallChart')
  const format = useFormatter()
  const isMobile = useIsMobile()
  const depletionByAge = results.depletionByAge
  const frameRef = useRef<HTMLDivElement>(null)
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 })

  // Measure the frame ourselves instead of using `ResponsiveContainer`, which
  // renders once with width(-1)/height(-1) — a console warning on every load,
  // and a real mis-render whenever the chart mounts inside a hidden tab panel.
  // A zero measurement simply skips the chart until the frame has a size.
  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return

    const measure = () => {
      setChartSize({
        width: Math.floor(frame.clientWidth),
        height: Math.floor(frame.clientHeight),
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

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

  const hue = fanHue.risk

  const renderTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean
    payload?: ReadonlyArray<{ value?: number | string }>
    label?: string | number
  }) => {
    if (!active || !payload?.length) return null
    const raw = payload[0]?.value
    const numeric = typeof raw === 'number' ? raw : Number(raw ?? 0)
    return (
      <ChartTooltipCard
        title={`${t('ageLabel')} ${label ?? ''}`}
        rows={[
          {
            key: 'depleted',
            label: t('yAxisLabel'),
            value: formatPercent(numeric),
            kind: 'band',
            color: hue.solid,
            emphasis: true,
          },
        ]}
      />
    )
  }

  return (
    <div className="w-full min-w-0 space-y-4 border-3 border-neo-black bg-neo-white p-4 shadow-neo sm:p-6">
      <div className="flex items-center gap-2">
        <h4 className="text-base font-extrabold uppercase tracking-[0.16em] text-neo-black sm:text-lg">
          {t('title')}
        </h4>
        <InfoTip content={t('subtitle')} label={t('title')} side="bottom" />
      </div>
      <div ref={frameRef} role="img" aria-label={t('ariaLabel')} className="h-56 w-full min-w-0">
        {chartSize.width > 0 && chartSize.height > 0 && (
          <AreaChart
            data={data}
            width={chartSize.width}
            height={chartSize.height}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="shortfallFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={hue.solid} stopOpacity={0.28} />
                <stop offset="100%" stopColor={hue.solid} stopOpacity={0.04} />
              </linearGradient>
            </defs>
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
              domain={[0, (dataMax: number) => Math.max(0.05, Math.ceil(dataMax * 20) / 20)]}
              tickFormatter={formatPercent}
              tick={axisTick(isMobile)}
              tickLine={false}
              tickMargin={6}
              axisLine={false}
              width={isMobile ? 42 : 50}
            />
            <Tooltip
              content={renderTooltip}
              cursor={{ stroke: chartInk.cursor, strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Area
              type="stepAfter"
              dataKey="depleted"
              stroke={hue.solid}
              strokeWidth={2}
              fill="url(#shortfallFill)"
              isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--neo-white)', fill: hue.solid }}
            />
          </AreaChart>
        )}
      </div>
    </div>
  )
}
