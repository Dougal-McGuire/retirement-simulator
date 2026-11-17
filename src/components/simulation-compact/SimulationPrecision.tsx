'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { InfoTip } from '@/components/ui/info-tip'
import { buildSimulationContext, samplingInterval95 } from '@/lib/simulation/context'
import type { SimulationResults } from '@/types'

/** Counts and sampling precision from the result actually on screen. */
export function SimulationPrecision({ results }: { results: SimulationResults }) {
  const t = useTranslations('simulation.precision')
  const format = useFormatter()
  const { effectiveRuns, successCount, marketModel, historical } = buildSimulationContext(
    results.params,
    results
  )
  const counts = { successes: format.number(successCount), runs: format.number(effectiveRuns) }
  if (marketModel === 'historical') {
    return (
      <span data-testid="simulation-precision">
        {t('historical', counts)}{' '}
        <InfoTip
          label={t('historicalLabel')}
          content={t('historicalDetail', {
            first: historical.firstYear,
            last: historical.lastYear,
          })}
        />
      </span>
    )
  }
  const interval = samplingInterval95(successCount, effectiveRuns)
  // Round outwards so an observed 0% or 100% never appears perfectly certain.
  const percent = (tenths: number) =>
    format.number(tenths / 1000, { style: 'percent', maximumFractionDigits: 1 })
  return (
    <span data-testid="simulation-precision">
      {t('monteCarlo', counts)} ·{' '}
      {t('interval', {
        lower: percent(Math.floor(interval.lower * 10)),
        upper: percent(Math.ceil(interval.upper * 10)),
      })}{' '}
      <InfoTip label={t('intervalLabel')} content={t('intervalDetail')} />
    </span>
  )
}
