/**
 * Money and delta formatting, one scheme for the whole UI.
 *
 * The words around the numbers ("Mio €" / "€…M", "T€" / "€…k", "Pkt." /
 * "pts") come from the catalog (`ui.money`); `useMoney()` reads them there.
 * The numbers come from cached `Intl.NumberFormat` instances — creating one
 * per call (16 files had their own inline EUR formatter) is the slow part of
 * formatting a 600-cell table.
 */

/** Unit templates; `{value}` is replaced by the formatted (unsigned) number. */
export interface MoneyUnits {
  /** "{value} Mio €" / "€{value}M" */
  million: string
  /** "{value} T€" / "€{value}k" */
  thousand: string
  /** "{value} €" / "€{value}" — a compact amount below a thousand. */
  unit: string
  /** "{value} Pkt." / "{value} pts" — percentage points. */
  points: string
}

const formatters = new Map<string, Intl.NumberFormat>()

/** A cached `Intl.NumberFormat` for these options. */
export function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    formatters.set(key, formatter)
  }
  return formatter
}

const MINUS = '−'

export interface Money {
  /** Whole euros in full: "1.234.567 €" / "€1,234,567" (with `cents`, two decimals). */
  full: (value: number, options?: { cents?: boolean }) => string
  /** Full amount with an explicit sign: "+1.200 €" / "−€300". */
  signed: (value: number) => string
  /**
   * A short headline amount: millions with two decimals ("1,99 Mio €"),
   * thousands without ("265 T€"), smaller amounts in full ("850 €").
   * Rounding never produces "1.000 T€"; it moves up to millions instead.
   */
  compact: (value: number) => string
  /** Chart grid label: "1 Mio €", "1,5 Mio €", "500 T€". */
  axis: (value: number) => string
  /** Millions with one decimal: "1,9 Mio €". */
  millions: (value: number) => string
  /** Thousands with one decimal: "55,0 T€". */
  thousands: (value: number) => string
  /** Signed compact delta: "−10,2 T€" / "+1,0 Mio €". */
  delta: (value: number) => string
  /** Signed percentage points: "+3,1 Pkt." / "−13 pts" (one decimal below 10). */
  points: (delta: number, options?: { digits?: number }) => string
  /** A share (0..1) as a percentage: "95,2 %". */
  percent: (fraction: number, digits?: number) => string
}

export function createMoney(locale: string, units: MoneyUnits): Money {
  const fixed = (value: number, digits: number) =>
    numberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
      value
    )
  const fill = (template: string, value: string) => template.replace('{value}', value)
  const sign = (value: number) => (value < 0 ? MINUS : '')

  const full: Money['full'] = (value, { cents = false } = {}) =>
    numberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    }).format(value)

  const millions = (value: number) =>
    `${sign(value)}${fill(units.million, fixed(Math.abs(value) / 1_000_000, 1))}`
  const thousands = (value: number) =>
    `${sign(value)}${fill(units.thousand, fixed(Math.abs(value) / 1_000, 1))}`

  return {
    full,
    signed: (value) => {
      const rounded = Math.round(value)
      const prefix = rounded > 0 ? '+' : rounded < 0 ? MINUS : '±'
      return `${prefix}${full(Math.abs(rounded))}`
    },
    compact: (value) => {
      const abs = Math.abs(value)
      if (Math.round(abs / 1_000) >= 1_000)
        return `${sign(value)}${fill(units.million, fixed(abs / 1_000_000, 2))}`
      if (Math.round(abs) >= 1_000)
        return `${sign(value)}${fill(units.thousand, fixed(Math.round(abs / 1_000), 0))}`
      return `${sign(value)}${fill(units.unit, fixed(Math.round(abs), 0))}`
    },
    axis: (value) => {
      if (value >= 1_000_000) {
        const m = value / 1_000_000
        return fill(units.million, fixed(m, Number.isInteger(m) ? 0 : 1))
      }
      const k = value / 1_000
      return fill(units.thousand, fixed(k, Number.isInteger(k) ? 0 : 1))
    },
    millions,
    thousands,
    delta: (value) => {
      const prefix = value < 0 ? MINUS : '+'
      const abs = Math.abs(value)
      return `${prefix}${abs >= 1_000_000 ? millions(abs) : thousands(abs)}`
    },
    points: (delta, { digits } = {}) => {
      const places = digits ?? (Math.abs(delta) >= 10 ? 0 : 1)
      return fill(units.points, `${delta < 0 ? MINUS : '+'}${fixed(Math.abs(delta), places)}`)
    },
    percent: (fraction, digits = 1) =>
      numberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(fraction),
  }
}
