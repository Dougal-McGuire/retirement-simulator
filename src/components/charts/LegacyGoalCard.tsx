'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { Target } from 'lucide-react'
import type { SimulationParams, SimulationResults } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { InfoTip } from '@/components/ui/info-tip'
import { LabeledNumberInput } from '@/components/forms/fields/LabeledNumberInput'
import { useUpdateParams } from '@/lib/stores/simulationStore'
import { useCompactCurrency } from '@/lib/hooks/useCompactCurrency'
import { cn } from '@/lib/utils'

interface LegacyGoalCardProps {
  params: SimulationParams
  results: SimulationResults | null
}

/**
 * The bequest goal, stated and scored.
 *
 * "Will the money last?" and "will anything be left?" are different questions,
 * and a plan that answers the first at 96% can answer the second at 40%. The
 * card shows both rates side by side so raising the target never looks like the
 * plan quietly got worse — it shows exactly which bar moved.
 */
export function LegacyGoalCard({ params, results }: LegacyGoalCardProps) {
  const t = useTranslations('planEditor.goals')
  const tSetup = useTranslations('setup')
  const format = useFormatter()
  const updateParams = useUpdateParams()

  const target = Math.max(0, params.legacyTargetReal ?? 0)
  const active = target > 0

  // Compact where the locale abbreviates, whole euros where it does not —
  // German would otherwise render "856.841,3 €".
  const formatCurrency = useCompactCurrency()
  const formatPercent = (value: number) =>
    format.number(value / 100, {
      style: 'percent',
      minimumFractionDigits: value % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    })

  // Real terminal assets: the same today's-euro series the charts draw, so the
  // surplus quoted here is the one the goal was actually scored against.
  const realTerminal =
    (results?.assetPercentilesReal ?? results?.assetPercentiles)?.p50.at(-1) ?? null
  const gap = realTerminal === null ? null : realTerminal - target
  const depletionRate = results?.depletionSuccessRate ?? results?.successRate ?? null

  const gapTone =
    gap === null || !active
      ? 'text-muted-foreground'
      : gap > 0
        ? 'text-ok'
        : gap < 0
          ? 'text-danger'
          : 'text-ink'

  const gapText =
    gap === null
      ? t('notAvailable')
      : !active
        ? ''
        : Math.round(gap) === 0
          ? t('onTarget')
          : gap > 0
            ? t('surplus', { amount: formatCurrency(gap) })
            : t('shortfall', { amount: formatCurrency(-gap) })

  const stats: { key: string; label: string; value: string; hint: string; tone?: string }[] = [
    {
      key: 'funded',
      label: t('funded'),
      value: results ? formatPercent(results.successRate) : t('notAvailable'),
      hint: active ? t('fundedHint') : t('fundedHintNoGoal'),
      tone: results && results.successRate >= 90 ? 'text-ok' : undefined,
    },
    {
      key: 'survives',
      label: t('survives'),
      value: depletionRate === null ? t('notAvailable') : formatPercent(depletionRate),
      hint: t('survivesHint'),
    },
    {
      key: 'terminal',
      label: t('medianTerminal', { age: params.endAge }),
      value: realTerminal === null ? t('notAvailable') : formatCurrency(realTerminal),
      hint: gapText,
      tone: gapTone,
    },
  ]

  return (
    <Card className="rounded-sm overflow-hidden border border-border" data-testid="legacy-goal-card">
      <CardContent className="bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          <div className="min-w-0 lg:max-w-[20rem] lg:shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="flex items-center gap-2 text-[0.82rem] font-black   text-ink">
                <Target className="h-4 w-4" aria-hidden="true" />
                {t('title')}
              </h3>
              <InfoTip content={t('description')} label={t('title')} side="bottom" />
            </div>
            <div className="mt-3">
              <LabeledNumberInput
                id="editor-legacyTargetReal"
                label={t('targetLabel')}
                value={target}
                onChange={(value) => updateParams({ legacyTargetReal: value })}
                helpText={t('targetHelp')}
                className="w-full"
                unit={tSetup('units.currency')}
                groupThousands
                min={0}
                rangeMessage={tSetup('validation.nonNegative')}
                invalidMessage={tSetup('validation.notANumber')}
              />
            </div>
          </div>

          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.key}
                data-testid={`legacy-goal-${stat.key}`}
                className="rounded-sm border-2 border-border bg-background p-3 shadow-sm"
              >
                <span className="text-[0.6rem] font-bold   text-muted-foreground">
                  {stat.label}
                </span>
                <div
                  data-testid={`legacy-goal-${stat.key}-value`}
                  className={cn('mt-1.5 text-xl font-black tabular-nums text-ink', stat.tone)}
                >
                  {stat.value}
                </div>
                {stat.hint && (
                  <p className={cn('mt-1 text-[0.62rem] font-semibold', stat.tone)}>{stat.hint}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {!active && (
          <p
            className="rounded-sm mt-4 border-2 border-dashed border-ink/40 px-3 py-2 text-[0.64rem] font-semibold text-muted-foreground"
            data-testid="legacy-goal-disabled-hint"
          >
            {t('disabled')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
