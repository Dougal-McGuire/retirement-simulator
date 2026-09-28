'use client'

import { useCallback } from 'react'
import { useFormatter } from 'next-intl'
import { useCompactCurrency } from '@/lib/hooks/useCompactCurrency'

/** Currency, compact-currency and percent formatters shared by the charts. */
export function useChartFormatters() {
  const format = useFormatter()

  const formatCurrency = useCallback(
    (value: number) =>
      format.number(value, {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    [format]
  )

  const compactCurrency = useCompactCurrency()
  const formatCurrencyShort = useCallback(
    (value: number) => compactCurrency(value),
    [compactCurrency]
  )

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
