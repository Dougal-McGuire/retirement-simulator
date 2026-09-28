import { formatBarEuro } from '@/components/simulation-compact/format'

describe('formatBarEuro', () => {
  it('shows millions with two decimals', () => {
    expect(formatBarEuro(1_990_000, 'de')).toBe('1,99 Mio €')
    expect(formatBarEuro(1_990_000, 'en')).toBe('€1.99M')
    expect(formatBarEuro(12_345_678, 'de')).toBe('12,35 Mio €')
  })

  it('shows thousands without decimals', () => {
    expect(formatBarEuro(265_000, 'de')).toBe('265 T€')
    expect(formatBarEuro(265_400, 'en')).toBe('€265k')
    expect(formatBarEuro(1_000, 'de')).toBe('1 T€')
  })

  it('moves up a unit instead of printing 1.000 T€', () => {
    expect(formatBarEuro(999_600, 'de')).toBe('1,00 Mio €')
    expect(formatBarEuro(999_600, 'en')).toBe('€1.00M')
  })

  it('prints small amounts and zero in full', () => {
    expect(formatBarEuro(0, 'de')).toBe('0 €')
    expect(formatBarEuro(850, 'en')).toBe('€850')
  })

  it('keeps the sign of a negative amount', () => {
    expect(formatBarEuro(-265_000, 'de')).toBe('−265 T€')
    expect(formatBarEuro(-1_500_000, 'en')).toBe('−€1.50M')
  })
})
