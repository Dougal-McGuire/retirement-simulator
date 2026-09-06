'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { CompactKpis } from './metrics'
import { formatEuro, formatMillionsEuro, formatMillionsShort } from './format'

interface KpiStripProps {
  kpis: CompactKpis
  endAge: number
  resultsComputedAt: number | null
}

/** One stable result summary. No traces mixing different plans or euro units. */
export function KpiStrip({ kpis, endAge }: KpiStripProps) {
  const t = useTranslations('simulationCompact.kpi')
  const format = useFormatter()
  const locale = useLocale()
  const cards = [
    {
      label: t('success'),
      value: format.number(kpis.successRate / 100, { style: 'percent', maximumFractionDigits: 1 }),
      sub: t('successHint'),
    },
    {
      label: t('lastsTo'),
      value:
        kpis.lastsToMedian == null
          ? `${format.number(endAge)}+`
          : format.number(kpis.lastsToMedian),
      sub: t('p10Age', {
        age: kpis.lastsToP10 == null ? `${format.number(endAge)}+` : format.number(kpis.lastsToP10),
      }),
    },
    {
      label: t('firstYearDraw'),
      value: formatEuro(kpis.firstYearWithdrawal, locale),
      sub: t('grossMean', { amount: formatEuro(kpis.firstYearWithdrawalMonthly, locale) }),
    },
    {
      label: t('medianEnd'),
      value: formatMillionsEuro(kpis.medianEndWealth, locale),
      sub: t('p10End', { value: formatMillionsShort(kpis.p10EndWealth, locale) }),
    },
  ]
  return (
    <dl
      data-testid="kpi-strip"
      className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4"
    >
      {cards.map((card) => (
        <div key={card.label} className="min-w-0 bg-white px-4 py-4">
          <dt className="text-xs font-semibold text-muted-foreground">{card.label}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{card.value}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">{card.sub}</dd>
        </div>
      ))}
    </dl>
  )
}
