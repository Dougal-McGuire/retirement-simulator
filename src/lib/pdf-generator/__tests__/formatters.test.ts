import {
  fmtCurrency,
  fmtPercent,
  fmtRatioPercent,
  fmtSuccessMetric,
} from '@/lib/pdf-generator/formatters'

describe('de-DE Formatters', () => {
  it('formats currency with schmalem geschützten Leerzeichen', () => {
    expect(fmtCurrency(123456)).toBe('123.456\u202f€')
  })

  it('formats percentages with schmalem Leerzeichen', () => {
    expect(fmtPercent(0.626)).toBe('62,6\u202f%')
  })

  it('creates success metric with korrektem Layout', () => {
    expect(fmtSuccessMetric(313, 500, 0.626)).toBe('313/500 (62,6\u202f%)')
  })
})

describe('fmtRatioPercent', () => {
  it('keeps ratios above 100% intact, unlike fmtPercent', () => {
    // fmtPercent guesses the unit and would read 1.1 as "1.1%".
    expect(fmtPercent(1.1, 0)).toBe('1\u202f%')
    expect(fmtRatioPercent(1.1, 0)).toBe('110\u202f%')
  })

  it('formats fractions for both locales', () => {
    expect(fmtRatioPercent(0.44, 0, 'en-US')).toBe('44%')
    expect(fmtRatioPercent(0.44, 0, 'de-DE')).toBe('44\u202f%')
  })
})
