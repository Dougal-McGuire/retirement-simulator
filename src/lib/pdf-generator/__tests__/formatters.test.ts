import { fmtCurrency, fmtPercent, fmtSuccessMetric } from '@/lib/pdf-generator/formatters'

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
