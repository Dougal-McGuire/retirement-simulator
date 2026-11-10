import de from '@/i18n/messages/de.json'
import en from '@/i18n/messages/en.json'
import { createMoney, numberFormat } from '@/lib/format/money'
import { MONEY_UNITS } from '@/components/simulation-compact/format'

const deMoney = createMoney('de', de.ui.money)
const enMoney = createMoney('en', en.ui.money)

describe('money units', () => {
  it('the locale-string wrappers use the catalog units', () => {
    expect(MONEY_UNITS.de).toEqual(de.ui.money)
    expect(MONEY_UNITS.en).toEqual(en.ui.money)
  })
})

describe('createMoney', () => {
  it('formats full amounts in whole euros (cents on request)', () => {
    expect(deMoney.full(1234567)).toBe('1.234.567\u00a0€')
    expect(enMoney.full(1234567)).toBe('€1,234,567')
    expect(deMoney.full(12.5, { cents: true })).toBe('12,50\u00a0€')
    expect(enMoney.signed(-300)).toBe('−€300')
    expect(deMoney.signed(1200)).toBe('+1.200\u00a0€')
    expect(deMoney.signed(0.2)).toBe('±0\u00a0€')
  })

  it('compact: millions with two decimals, thousands without, small amounts in full', () => {
    expect(deMoney.compact(1_990_000)).toBe('1,99 Mio €')
    expect(enMoney.compact(1_990_000)).toBe('€1.99M')
    expect(deMoney.compact(265_000)).toBe('265 T€')
    expect(enMoney.compact(265_400)).toBe('€265k')
    expect(deMoney.compact(999_600)).toBe('1,00 Mio €')
    expect(deMoney.compact(0)).toBe('0 €')
    expect(enMoney.compact(850)).toBe('€850')
    expect(deMoney.compact(-265_000)).toBe('−265 T€')
    expect(enMoney.compact(-1_500_000)).toBe('−€1.50M')
  })

  it('axis labels drop needless decimals', () => {
    expect(deMoney.axis(1_000_000)).toBe('1 Mio €')
    expect(deMoney.axis(1_500_000)).toBe('1,5 Mio €')
    expect(enMoney.axis(500_000)).toBe('€500k')
  })

  it('signed deltas and percentage points', () => {
    expect(deMoney.delta(-10_200)).toBe('−10,2 T€')
    expect(enMoney.delta(1_000_000)).toBe('+€1.0M')
    expect(deMoney.points(3.14)).toBe('+3,1 Pkt.')
    expect(enMoney.points(-13)).toBe('−13 pts')
    expect(deMoney.points(0.25, { digits: 2 })).toBe('+0,25 Pkt.')
    expect(deMoney.percent(0.952)).toBe('95,2\u00a0%')
  })

  it('reuses one Intl.NumberFormat per locale and options', () => {
    expect(numberFormat('de', { maximumFractionDigits: 0 })).toBe(
      numberFormat('de', { maximumFractionDigits: 0 })
    )
  })
})
