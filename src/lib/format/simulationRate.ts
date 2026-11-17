import { numberFormat } from './money'

/** Percent on a 0–100 scale. Reserve 0% and 100% for actual sample endpoints. */
export function formatSimulationRate(rate: number, locale: string): string {
  const percent = numberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })
  if (rate > 0 && rate < 0.1) return '<' + percent.format(0.001)
  if (rate < 100 && rate > 99.9) return '>' + percent.format(0.999)
  return percent.format(rate / 100)
}

type ChangeMessage = 'points' | 'smallGain' | 'smallLoss'

/** A nonzero difference must retain its direction even when it rounds to zero. */
export function formatSimulationRateDelta(
  delta: number,
  locale: string,
  translate: (key: ChangeMessage, args: { value: string }) => string
): string {
  if (delta === 0) return '±0'
  const number = numberFormat(locale, { maximumFractionDigits: 1 })
  const magnitude = Math.abs(delta)
  if (Math.round(magnitude * 10) === 0) {
    return translate(delta > 0 ? 'smallGain' : 'smallLoss', { value: number.format(0.1) })
  }
  return translate('points', { value: (delta > 0 ? '+' : '−') + number.format(magnitude) })
}
