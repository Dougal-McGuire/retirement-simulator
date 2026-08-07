'use client'

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { useLocale } from 'next-intl'
import {
  caretIndexForSignificant,
  countSignificantChars,
  formatGroupedDraft,
  formatGroupedValue,
  getNumberSeparators,
  parseGroupedNumber,
  stripGrouping,
  type NumberSeparators,
} from '@/lib/utils/numberFormat'

export interface GroupedChange {
  /** The re-grouped string that should be shown in the input. */
  display: string
  /** Parsed numeric value, or NaN while the field is empty/partial. */
  numeric: number
}

export interface UseGroupedNumberResult {
  locale: string
  separators: NumberSeparators
  /** Attach to the `<input>` so the caret can be restored after re-grouping. */
  inputRef: React.RefObject<HTMLInputElement | null>
  /** Format a number for display (empty string for non-finite values). */
  format: (value: number) => string
  /** Parse a displayed string back to a number (NaN when empty/partial). */
  parse: (raw: string) => number
  /** Handle a raw input event: returns what to display and the parsed value. */
  handleChange: (event: React.ChangeEvent<HTMLInputElement>) => GroupedChange
}

/**
 * Keeps a text input showing locale-aware thousands grouping while typing
 * (`630.000` in German, `630,000` in English) without disturbing the caret,
 * and hands the surrounding form plain numbers.
 */
export function useGroupedNumber(maximumFractionDigits = 0): UseGroupedNumberResult {
  const locale = useLocale()
  const separators = useMemo(() => getNumberSeparators(locale), [locale])
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pendingCaretRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const input = inputRef.current
    const pending = pendingCaretRef.current
    if (!input || pending === null) return
    pendingCaretRef.current = null
    const position = caretIndexForSignificant(input.value, pending, separators)
    try {
      input.setSelectionRange(position, position)
    } catch {
      // Inputs that do not support selection ranges can be ignored.
    }
  })

  const format = useCallback(
    (value: number) => formatGroupedValue(value, locale, separators, maximumFractionDigits),
    [locale, separators, maximumFractionDigits]
  )

  const parse = useCallback((raw: string) => parseGroupedNumber(raw, separators), [separators])

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): GroupedChange => {
      const input = event.target
      const raw = input.value
      const caret = input.selectionStart ?? raw.length
      pendingCaretRef.current = countSignificantChars(raw.slice(0, caret), separators)

      const normalised = stripGrouping(raw, separators)
      const display = formatGroupedDraft(normalised, locale, separators, maximumFractionDigits)
      const numeric = parseGroupedNumber(raw, separators)
      return { display, numeric }
    },
    [locale, separators, maximumFractionDigits]
  )

  return { locale, separators, inputRef, format, parse, handleChange }
}
