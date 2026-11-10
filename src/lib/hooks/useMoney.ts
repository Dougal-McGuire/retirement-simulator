'use client'

import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { createMoney, type Money } from '@/lib/format/money'

/**
 * The UI's one money formatter: full amounts, compact headline amounts, chart
 * axis labels, signed deltas and percentage points, with the unit words from
 * the catalog (`ui.money`) and cached `Intl.NumberFormat` instances. Stable
 * per locale, so memoized charts that take its functions do not redraw.
 */
export function useMoney(): Money {
  const locale = useLocale()
  const t = useTranslations('ui.money')
  return useMemo(
    () =>
      createMoney(locale, {
        million: t.raw('million') as string,
        thousand: t.raw('thousand') as string,
        unit: t.raw('unit') as string,
        points: t.raw('points') as string,
      }),
    [locale, t]
  )
}
