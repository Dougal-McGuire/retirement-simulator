import de from '@/i18n/messages/de.json'
import en from '@/i18n/messages/en.json'
import { formatSimulationRate, formatSimulationRateDelta } from '../simulationRate'

describe.each([
  {
    locale: 'en',
    messages: en,
    first: '90.4%',
    second: '90.6%',
    point: '0.2 pts',
    gain: '< 0.1 pts higher',
    loss: '< 0.1 pts lower',
    low: '<0.1%',
    high: '>99.9%',
  },
  {
    locale: 'de',
    messages: de,
    first: '90,4 %',
    second: '90,6 %',
    point: '0,2 Pkt.',
    gain: 'um < 0,1 Pkt. höher',
    loss: 'um < 0,1 Pkt. niedriger',
    low: '<0,1 %',
    high: '>99,9 %',
  },
])(
  '$locale simulation comparisons',
  ({ locale, messages, first, second, point, gain, loss, low, high }) => {
    const change = (base: number, alt: number) =>
      formatSimulationRateDelta(alt - base, locale, (key, { value }) =>
        messages.simulationCompact.compare.rateChange[key].replace('{value}', value)
      )

    it('keeps the observed 452/500 and 453/500 outcomes, their direction, and a true tie distinct', () => {
      const base = (452 / 500) * 100
      const alt = (453 / 500) * 100
      expect(formatSimulationRate(base, locale)).toBe(first)
      expect(formatSimulationRate(alt, locale)).toBe(second)
      expect(change(base, alt)).toBe('+' + point)
      expect(change(alt, base)).toBe('−' + point)
      expect(change(alt, alt)).toBe('±0')
    })

    it('does not round a near miss up to its target or combine two inequality signs', () => {
      const space = locale === 'de' ? ' ' : ''
      expect(formatSimulationRate(89.98, locale, 90)).toBe('<90' + space + '%')
      expect(formatSimulationRate(99.99, locale, 100)).toBe('<100' + space + '%')
      expect(formatSimulationRate(100, locale, 100)).toBe('100' + space + '%')
      expect(formatSimulationRate(89.7, locale, 90)).toBe(locale === 'de' ? '89,7 %' : '89.7%')
    })

    it('preserves a single success or failure and the direction of a sub-display-unit change', () => {
      const rare = 100 / 20000
      expect(formatSimulationRate(rare, locale)).toBe(low)
      expect(formatSimulationRate(100 - rare, locale)).toBe(high)
      expect(formatSimulationRate(0, locale)).toMatch(/^0\s?%$/)
      expect(formatSimulationRate(100, locale)).toMatch(/^100\s?%$/)
      expect(change(90, 90 + rare)).toBe(gain)
      expect(change(90 + rare, 90)).toBe(loss)
    })
  }
)
