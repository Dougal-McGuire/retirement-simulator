'use client'

import { useCallback } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import type { AssumptionKind } from '@/lib/simulation/planDiff'

/**
 * Renders a raw assumption value in the active locale.
 *
 * The diff layer keeps values numeric and unit-tagged; this hook is the single
 * place that decides how a unit reads (currency, rate, years, strategy label),
 * so the comparison table and the stress-lever dialog never disagree.
 */
export function useAssumptionValueFormatter() {
  const format = useFormatter()
  const tStrategy = useTranslations('parameterControls.fields.withdrawalStrategy.options')

  return useCallback(
    (value: number | string, kind: AssumptionKind): string => {
      if (typeof value === 'string') {
        return kind === 'strategy' ? tStrategy(`${value}.label`) : value
      }

      switch (kind) {
        case 'currency':
          return format.number(value, {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0,
          })
        case 'rate':
          return format.number(value, {
            style: 'percent',
            minimumFractionDigits: 1,
            maximumFractionDigits: 2,
          })
        case 'percentPoints':
          return format.number(value / 100, {
            style: 'percent',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          })
        case 'years':
          return format.number(value, { style: 'unit', unit: 'year', unitDisplay: 'short' })
        default:
          return format.number(value)
      }
    },
    [format, tStrategy]
  )
}
