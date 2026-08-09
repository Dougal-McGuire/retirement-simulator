import {
  caretIndexForSignificant,
  countSignificantChars,
  formatGroupedDraft,
  formatGroupedValue,
  getNumberSeparators,
  parseGroupedNumber,
  stripGrouping,
} from '../numberFormat'

const en = getNumberSeparators('en-US')
const de = getNumberSeparators('de-DE')

describe('getNumberSeparators', () => {
  it('resolves English separators', () => {
    expect(en).toEqual({ group: ',', decimal: '.' })
  })

  it('resolves German separators', () => {
    expect(de).toEqual({ group: '.', decimal: ',' })
  })
})

describe('stripGrouping', () => {
  it('drops English group separators', () => {
    expect(stripGrouping('630,000', en)).toBe('630000')
  })

  it('drops German group separators and normalises the decimal comma', () => {
    expect(stripGrouping('630.000,5', de)).toBe('630000.5')
  })

  it('keeps a leading minus sign', () => {
    expect(stripGrouping('-1.250', de)).toBe('-1250')
  })

  it('ignores stray characters', () => {
    expect(stripGrouping('€ 12a3', en)).toBe('123')
  })
})

describe('parseGroupedNumber', () => {
  it('parses grouped values in both locales', () => {
    expect(parseGroupedNumber('630,000', en)).toBe(630000)
    expect(parseGroupedNumber('630.000', de)).toBe(630000)
    expect(parseGroupedNumber('1.234,56', de)).toBeCloseTo(1234.56)
  })

  it('returns NaN for empty or partial input', () => {
    expect(Number.isNaN(parseGroupedNumber('', en))).toBe(true)
    expect(Number.isNaN(parseGroupedNumber('-', en))).toBe(true)
  })
})

describe('formatGroupedDraft', () => {
  it('groups while typing in English', () => {
    expect(formatGroupedDraft('630000', 'en-US', en)).toBe('630,000')
  })

  it('groups while typing in German', () => {
    expect(formatGroupedDraft('630000', 'de-DE', de)).toBe('630.000')
  })

  it('preserves a trailing decimal separator mid-typing', () => {
    expect(formatGroupedDraft('1234.', 'de-DE', de, 2)).toBe('1.234,')
  })

  it('passes through an empty or sign-only draft', () => {
    expect(formatGroupedDraft('', 'en-US', en)).toBe('')
    expect(formatGroupedDraft('-', 'en-US', en)).toBe('-')
  })
})

describe('formatGroupedValue', () => {
  it('formats numbers for display', () => {
    expect(formatGroupedValue(630000, 'de-DE', de)).toBe('630.000')
    expect(formatGroupedValue(0, 'en-US', en)).toBe('0')
  })

  it('returns an empty string for non-finite values', () => {
    expect(formatGroupedValue(Number.NaN, 'en-US', en)).toBe('')
  })
})

describe('caret mapping', () => {
  it('counts significant characters before the caret', () => {
    expect(countSignificantChars('630,0', en)).toBe(4)
    // Digits plus the decimal separator itself count as significant.
    expect(countSignificantChars('1.234,5', de)).toBe(6)
  })

  it('maps a significant-character offset back into the formatted string', () => {
    // Typing "7" after the first digit of "630.000" yields "6.730.000"; the
    // caret belongs after the second significant character.
    expect(caretIndexForSignificant('6.730.000', 2, de)).toBe(3)
  })

  it('keeps the caret after a leading minus sign', () => {
    expect(caretIndexForSignificant('-1,250', 0, en)).toBe(1)
  })
})
