'use client'

import { useCallback } from 'react'
import { useFormatter } from 'next-intl'
import { useMoney } from '@/lib/hooks/useMoney'

/** Currency, compact-currency and percent formatters shared by the charts. */
export function useChartFormatters() {
  const format = useFormatter()
  const money = useMoney()
  const formatCurrency = money.full
  const formatCurrencyShort = money.compact

  const formatPercent = useCallback(
    (value: number | null) =>
      value == null
        ? '—'
        : format.number(value, {
            style: 'percent',
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
    [format]
  )

  return { formatCurrency, formatCurrencyShort, formatPercent }
}
