import { createMoney, numberFormat, type MoneyUnits } from '@/lib/format/money'

/**
 * Locale-string wrappers around the shared money scheme (`@/lib/format/money`)
 * for callers that cannot use the `useMoney()` hook — today only
 * `CompareView`, which another lane owns. Components use `useMoney()`.
 *
 * The units mirror `ui.money` in the catalogs; `money.test.ts` fails if the
 * two drift apart.
 */
export const MONEY_UNITS: Record<'de' | 'en', MoneyUnits> = {
  de: {
    million: '{value} Mio €',
    thousand: '{value} T€',
    unit: '{value} €',
    points: '{value} Pkt.',
  },
  en: { million: '€{value}M', thousand: '€{value}k', unit: '€{value}', points: '{value} pts' },
}

const moneyFor = (locale: string) =>
  createMoney(locale, MONEY_UNITS[locale.startsWith('de') ? 'de' : 'en'])

/** Millions with one decimal: "1,9 Mio €" / "€1.9M". */
export function formatMillionsEuro(value: number, locale: string): string {
  return moneyFor(locale).millions(value)
}

/** Thousands with one decimal: "55,0 T€" / "€55.0k". */
export function formatThousandsEuro(value: number, locale: string): string {
  return moneyFor(locale).thousands(value)
}

/** Grid/axis label: "1 Mio €", "500 T€". */
export function formatAxisEuro(value: number, locale: string): string {
  return moneyFor(locale).axis(value)
}

/** Result-bar amount: "1,99 Mio €", "265 T€", "850 €". */
export function formatBarEuro(value: number, locale: string): string {
  return moneyFor(locale).compact(value)
}

/**
 * Percentage-point delta with sign, as the compare view has always shown it:
 * "+3,1 pp" / "−13 pp". (The rest of the UI says "Pkt." / "pts" through
 * `useMoney().points`; switching the compare view is its owner's call.)
 */
export function formatPpDelta(delta: number, locale: string): string {
  const digits = Math.abs(delta) >= 10 ? 0 : 1
  const magnitude = numberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(delta))
  return `${delta < 0 ? '−' : '+'}${magnitude} pp`
}

/** Signed compact euro delta for the compare badges: "−10,2 T€" / "−1,0 Mio €". */
export function formatEuroDelta(delta: number, locale: string): string {
  return moneyFor(locale).delta(delta)
}
