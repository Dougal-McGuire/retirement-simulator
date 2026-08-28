import { buildFanGeometry, FAN_H, FAN_W, sparklinePath } from '../fanGeometry'
import {
  formatAxisEuro,
  formatEuroDelta,
  formatMillionsEuro,
  formatPpDelta,
  formatThousandsEuro,
} from '../format'

describe('buildFanGeometry', () => {
  const ages = Array.from({ length: 36 }, (_, i) => 55 + i)
  const flat = ages.map(() => 500_000)
  const rising = ages.map((_, i) => 500_000 + i * 50_000)

  it('scales x over the full width and y within the plot', () => {
    const geometry = buildFanGeometry(ages, [rising])
    expect(geometry.x(0)).toBe(0)
    expect(geometry.x(ages.length - 1)).toBe(FAN_W)
    expect(geometry.y(0)).toBe(FAN_H)
    // The peak sits 6% below the top edge (the headroom factor).
    expect(geometry.y(rising[rising.length - 1])).toBeGreaterThan(0)
    expect(geometry.ymax).toBeCloseTo(rising[rising.length - 1] * 1.06)
  })

  it('clamps values outside the domain instead of overflowing the plot', () => {
    const geometry = buildFanGeometry(ages, [flat])
    expect(geometry.y(-1_000)).toBe(FAN_H)
    expect(geometry.y(geometry.ymax * 2)).toBe(0)
  })

  it('maps ages to marker positions', () => {
    const geometry = buildFanGeometry(ages, [flat])
    expect(geometry.agePct(55)).toBe('0.0%')
    expect(geometry.agePct(90)).toBe('100.0%')
    expect(geometry.ageX(60)).toBeCloseTo(((60 - 55) / 35) * FAN_W)
  })

  it('builds a closed band path and an open line path', () => {
    const geometry = buildFanGeometry(ages, [rising])
    const line = geometry.line(rising)
    const band = geometry.band(flat, rising)
    expect(line.startsWith('M')).toBe(true)
    expect(line.endsWith('Z')).toBe(false)
    expect(band.endsWith('Z')).toBe(true)
    // The band walks up one edge and back down the other: twice the points.
    expect(band.split('L').length).toBeGreaterThan(line.split('L').length)
  })

  it('picks a 1-2-5 grid step that yields at most 6 rules', () => {
    for (const peak of [180_000, 900_000, 2_400_000, 9_000_000]) {
      const geometry = buildFanGeometry(ages, [ages.map(() => peak)])
      expect(geometry.gridLines.length).toBeGreaterThan(0)
      expect(geometry.gridLines.length).toBeLessThanOrEqual(6)
    }
  })

  it('ticks the age axis every five years', () => {
    const geometry = buildFanGeometry(ages, [flat])
    expect(geometry.axisTicks.map((tick) => tick.age)).toEqual([55, 60, 65, 70, 75, 80, 85, 90])
  })
})

describe('sparklinePath', () => {
  it('spans the 60×22 viewBox with a 1-unit inset', () => {
    const path = sparklinePath([0, 10])
    expect(path).toBe('M1.0,20.0 L59.0,3.0')
  })

  it('draws a flat series mid-band instead of dividing by zero', () => {
    expect(sparklinePath([5, 5, 5])).toContain(',11.0')
  })

  it('handles empty and single-point series', () => {
    expect(sparklinePath([])).toBe('')
    expect(sparklinePath([7])).toContain('M1.0,')
  })
})

describe('compact formats', () => {
  it('formats German the way the design shows', () => {
    expect(formatMillionsEuro(1_900_000, 'de')).toBe('1,9 Mio €')
    expect(formatThousandsEuro(55_000, 'de')).toBe('55,0 T€')
    expect(formatAxisEuro(1_000_000, 'de')).toBe('1 Mio €')
    expect(formatAxisEuro(500_000, 'de')).toBe('500 T€')
    expect(formatPpDelta(3.1, 'de')).toBe('+3,1 pp')
    expect(formatPpDelta(-13, 'de')).toBe('−13 pp')
    expect(formatEuroDelta(-1_000_000, 'de')).toBe('−1,0 Mio €')
    expect(formatEuroDelta(-10_200, 'de')).toBe('−10,2 T€')
  })

  it('formats English equivalents', () => {
    expect(formatMillionsEuro(1_900_000, 'en')).toBe('€1.9M')
    expect(formatThousandsEuro(55_000, 'en')).toBe('€55.0k')
    expect(formatAxisEuro(500_000, 'en')).toBe('€500k')
    expect(formatPpDelta(3.14, 'en')).toBe('+3.1 pp')
  })
})
