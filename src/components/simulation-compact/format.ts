/**
 * Compact number formats from the design handoff: "1,9 Mio €", "55,0 T€",
 * "+3,1 pp". German gets the abbreviations the mockups show
 * (Mio €/T€); English gets the equivalent €1.9M/€55.0k so the strings stay
 * honest in both locales.
 */

const isGerman = (locale: string) => locale.startsWith('de')

const number = (value: number, locale: string, digits: number) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)

/** Millions with one decimal: "1,9 Mio €" / "€1.9M". */
export function formatMillionsEuro(value: number, locale: string): string {
  const millions = value / 1_000_000
  return isGerman(locale)
    ? `${number(millions, locale, 1)} Mio €`
    : `€${number(millions, locale, 1)}M`
}

/** Thousands with one decimal: "55,0 T€" / "€55.0k". */
export function formatThousandsEuro(value: number, locale: string): string {
  const thousands = value / 1_000
  return isGerman(locale)
    ? `${number(thousands, locale, 1)} T€`
    : `€${number(thousands, locale, 1)}k`
}

/**
 * Grid/axis label: whole millions as "1 Mio €", sub-million steps as "500 T€"
 * (the 1-2-5 grid ladder never needs decimals below a million).
 */
export function formatAxisEuro(value: number, locale: string): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000
    const digits = Number.isInteger(millions) ? 0 : 1
    return isGerman(locale)
      ? `${number(millions, locale, digits)} Mio €`
      : `€${number(millions, locale, digits)}M`
  }
  const thousands = value / 1_000
  const digits = Number.isInteger(thousands) ? 0 : 1
  return isGerman(locale)
    ? `${number(thousands, locale, digits)} T€`
    : `€${number(thousands, locale, digits)}k`
}

/**
 * Result-bar amount, short enough for a 20px KPI: millions with two decimals
 * ("1,99 Mio €" / "€1.99M"), thousands without ("265 T€" / "€265k"), smaller
 * amounts in full ("850 €" / "€850"). Rounding never produces "1.000 T€": it
 * moves up to millions instead.
 */
export function formatBarEuro(value: number, locale: string): string {
  const sign = value < 0 ? '−' : ''
  const abs = Math.abs(value)
  const german = isGerman(locale)
  if (Math.round(abs / 1_000) >= 1_000) {
    const millions = number(abs / 1_000_000, locale, 2)
    return german ? `${sign}${millions} Mio €` : `${sign}€${millions}M`
  }
  if (Math.round(abs) >= 1_000) {
    const thousands = number(Math.round(abs / 1_000), locale, 0)
    return german ? `${sign}${thousands} T€` : `${sign}€${thousands}k`
  }
  const units = number(Math.round(abs), locale, 0)
  return german ? `${sign}${units} €` : `${sign}€${units}`
}

/** Percentage-point delta with sign: "+3,1 pp" / "−13 pp". */
export function formatPpDelta(delta: number, locale: string): string {
  const digits = Math.abs(delta) >= 10 ? 0 : 1
  const magnitude = number(Math.abs(delta), locale, digits)
  return `${delta < 0 ? '−' : '+'}${magnitude} pp`
}

/** Signed compact euro delta for the compare badges: "−10,2 T€" / "−1,0 Mio €". */
export function formatEuroDelta(delta: number, locale: string): string {
  const sign = delta < 0 ? '−' : '+'
  const abs = Math.abs(delta)
  if (abs >= 1_000_000) return `${sign}${formatMillionsEuro(abs, locale)}`
  return `${sign}${formatThousandsEuro(abs, locale)}`
}
