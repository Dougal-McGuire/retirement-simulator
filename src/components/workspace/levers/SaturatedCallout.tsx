'use client'

import { useFormatter, useTranslations } from 'next-intl'

interface SaturatedCalloutProps {
  /** The base success rate, in percent. */
  rate: number
  testId: string
}

/**
 * Said once above a measured list whose plan already succeeds (nearly) always:
 * its figures then compare the worst decile's end assets in euros, not points
 * of success rate. Shared by the stress levers and "Unsichere Posten".
 */
export function SaturatedCallout({ rate, testId }: SaturatedCalloutProps) {
  const t = useTranslations('planDashboard.scenarios')
  const format = useFormatter()
  return (
    <p className="ws-levers-callout" data-testid={testId}>
      {t('saturated', {
        rate: format.number(rate / 100, {
          style: 'percent',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      })}
    </p>
  )
}

/**
 * A worst-decile euro figure, labelled as such beside the number, so a row
 * read on its own never passes it off as a success rate.
 */
export function WorstDecileUnit() {
  const t = useTranslations('workspace.levers')
  // The space stays outside the unit: it is where a tight row breaks.
  return (
    <>
      {' '}
      <span className="ws-levers-effect-unit" data-testid="worst-decile-unit">
        {t('worstDecileUnit')}
      </span>
    </>
  )
}
