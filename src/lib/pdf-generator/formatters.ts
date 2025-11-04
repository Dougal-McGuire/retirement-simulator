const numberFormatters = new Map<string, Intl.NumberFormat>()
const dateFormatters = new Map<string, Intl.DateTimeFormat>()

export const nbsp = '\u00a0'
export const nnbsp = '\u202f'

type FormatterOptions = Intl.NumberFormatOptions | Intl.DateTimeFormatOptions

function formatterKey(locale: string, options: FormatterOptions): string {
  const pairs = Object.entries(options as Record<string, unknown>)
  return `${locale}:${pairs
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('|')}`
}

function getNumberFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = formatterKey(locale, options)
  const cached = numberFormatters.get(key)
  if (cached) return cached
  const instance = new Intl.NumberFormat(locale, options)
  numberFormatters.set(key, instance)
  return instance
}

function getDateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = formatterKey(locale, options)
  const cached = dateFormatters.get(key)
  if (cached) return cached
  const instance = new Intl.DateTimeFormat(locale, options)
  dateFormatters.set(key, instance)
  return instance
}

export function fmtCurrency(value: number, locale: string = 'de-DE'): string {
  const formatted = getNumberFormatter(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value)

  if (locale.startsWith('de')) {
    return formatted.replace(`${nbsp}€`, `${nnbsp}€`)
  }
  return formatted
}

export function fmtNumber(
  value: number,
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number; locale?: string }
): string {
  const locale = options?.locale ?? 'de-DE'
  return getNumberFormatter(locale, {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
  }).format(value)
}

export function fmtPercent(value: number, maximumFractionDigits = 1, locale: string = 'de-DE'): string {
  const normalized = Math.abs(value) > 1 ? value / 100 : value
  const formatted = getNumberFormatter(locale, {
    style: 'percent',
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  }).format(normalized)

  if (locale.startsWith('de')) {
    return formatted.replace(`${nbsp}%`, `${nnbsp}%`)
  }
  return formatted
}

export function fmtSuccessMetric(
  count: number,
  trials: number,
  rate: number,
  locale: string = 'de-DE'
): string {
  const normalizedRate = Math.abs(rate) > 1 ? rate / 100 : rate
  const percent = fmtPercent(normalizedRate, 1, locale)
  return `${fmtNumber(count, { locale })}/${fmtNumber(trials, { locale })} (${percent})`
}

export function fmtDate(value: string | Date, locale: string = 'de-DE'): string {
  const date = value instanceof Date ? value : new Date(value)
  return getDateFormatter(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}
