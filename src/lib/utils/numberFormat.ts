/**
 * Locale-aware helpers for text inputs that show thousands grouping while the
 * user types (e.g. `630.000` in de-DE, `630,000` in en-US) while the surrounding
 * form keeps working with plain numbers.
 *
 * All functions are pure so they can be unit tested without a DOM.
 */

export interface NumberSeparators {
  group: string
  decimal: string
}

const FALLBACK_SEPARATORS: NumberSeparators = { group: ',', decimal: '.' }

/** Resolve the group/decimal separators a locale uses for plain numbers. */
export function getNumberSeparators(locale: string): NumberSeparators {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
    const group = parts.find((part) => part.type === 'group')?.value
    const decimal = parts.find((part) => part.type === 'decimal')?.value
    return {
      group: group ?? FALLBACK_SEPARATORS.group,
      decimal: decimal ?? FALLBACK_SEPARATORS.decimal,
    }
  } catch {
    return FALLBACK_SEPARATORS
  }
}

/**
 * Reduce a user-typed string to the characters that carry meaning: an optional
 * leading minus, digits and at most one decimal separator (normalised to `.`).
 * Group separators — and anything else — are dropped.
 */
export function stripGrouping(raw: string, separators: NumberSeparators): string {
  const negative = raw.trim().startsWith('-')
  let digits = ''
  let decimal = ''
  let seenDecimal = false

  for (const char of raw) {
    if (char >= '0' && char <= '9') {
      if (seenDecimal) decimal += char
      else digits += char
      continue
    }
    // Accept both the locale separator and the ASCII dot/comma so pasted values
    // and numeric keypads both work.
    const isDecimal =
      char === separators.decimal || ((char === '.' || char === ',') && char !== separators.group)
    if (isDecimal && !seenDecimal) {
      seenDecimal = true
    }
  }

  const sign = negative ? '-' : ''
  if (!seenDecimal) return `${sign}${digits}`
  return `${sign}${digits}.${decimal}`
}

/** Parse a user-typed, possibly grouped string into a number (NaN when empty). */
export function parseGroupedNumber(raw: string, separators: NumberSeparators): number {
  const normalised = stripGrouping(raw, separators)
  if (!normalised || normalised === '-' || normalised === '.' || normalised === '-.') return NaN
  return Number(normalised)
}

/**
 * Format a normalised numeric string for display, adding thousands grouping to
 * the integer part while preserving what the user is mid-way through typing
 * (a trailing decimal separator and trailing zeros are kept).
 */
export function formatGroupedDraft(
  normalised: string,
  locale: string,
  separators: NumberSeparators,
  maximumFractionDigits = 2
): string {
  if (!normalised || normalised === '-') return normalised

  const negative = normalised.startsWith('-')
  const unsigned = negative ? normalised.slice(1) : normalised
  const [intPart = '', fractionPartRaw] = unsigned.split('.')
  const hasDecimal = unsigned.includes('.')
  const fractionPart = (fractionPartRaw ?? '').slice(0, maximumFractionDigits)

  let grouped: string
  if (intPart === '') {
    grouped = ''
  } else {
    try {
      grouped = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
        useGrouping: true,
      }).format(Number(intPart))
    } catch {
      grouped = intPart
    }
  }

  const sign = negative ? '-' : ''
  if (!hasDecimal) return `${sign}${grouped}`
  return `${sign}${grouped}${separators.decimal}${fractionPart}`
}

/** Convenience: format a number for display in a grouped text input. */
export function formatGroupedValue(
  value: number,
  locale: string,
  separators: NumberSeparators,
  maximumFractionDigits = 2
): string {
  if (!Number.isFinite(value)) return ''
  const normalised = String(value)
  return formatGroupedDraft(normalised, locale, separators, maximumFractionDigits)
}

/** Count the characters that survive `stripGrouping` — used for caret mapping. */
export function countSignificantChars(raw: string, separators: NumberSeparators): number {
  return stripGrouping(raw, separators).replace('-', '').length
}

/**
 * Map a caret position expressed in "significant characters" back to an index
 * in the formatted string, so reformatting while typing does not send the caret
 * to the end of the field.
 */
export function caretIndexForSignificant(
  formatted: string,
  significant: number,
  separators: NumberSeparators
): number {
  if (significant <= 0) {
    // Keep the caret after a leading minus sign.
    return formatted.startsWith('-') ? 1 : 0
  }
  let seen = 0
  for (let index = 0; index < formatted.length; index += 1) {
    const char = formatted[index]
    const isSignificant = (char >= '0' && char <= '9') || char === separators.decimal
    if (isSignificant) {
      seen += 1
      if (seen === significant) return index + 1
    }
  }
  return formatted.length
}
