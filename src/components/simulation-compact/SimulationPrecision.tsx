'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { InfoTip } from '@/components/ui/info-tip'
import { buildSimulationContext, formatSamplingInterval95 } from '@/lib/simulation/context'
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
  const interval = formatSamplingInterval95(successCount, effectiveRuns, format.number)
  return (
    <span data-testid="simulation-precision">
      {t('monteCarlo', counts)} · {t('interval', interval)}{' '}
      <InfoTip label={t('intervalLabel')} content={t('intervalDetail')} />
    </span>
  )
}
