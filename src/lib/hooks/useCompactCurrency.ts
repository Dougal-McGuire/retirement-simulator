import { useLocale } from 'next-intl'
import { compactCurrencyOptions } from '@/lib/utils/numberFormat'

/**
 * Money formatter for headline figures: abbreviated where the locale has a
 * short form ("€856.8K"), whole euros where it does not ("856.841 €" in
 * German rather than "856.841,3 €").
 *
 * See {@link compactCurrencyOptions} for why the fallback is needed.
 */
export function useCompactCurrency(currency = 'EUR') {
  const locale = useLocale()
  return (value: number) =>
    new Intl.NumberFormat(locale, compactCurrencyOptions(value, locale, currency)).format(value)
}
