import {
  buildFanGeometry,
  FAN_H,
  FAN_W,
  seriesPeak,
  sliceByAge,
  sparklinePath,
} from '../fanGeometry'
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

  describe('the saved plan under a draft (ghost)', () => {
    it('a held peak raises the scale and never lowers it', () => {
      const own = buildFanGeometry(ages, [flat])
      // The ghost (or an earlier draft) reached higher: the axis covers it.
      const held = buildFanGeometry(ages, [flat], { minPeak: 2_000_000 })
      expect(held.ymax).toBeCloseTo(2_000_000 * 1.06)
      expect(held.y(500_000)).toBeGreaterThan(own.y(500_000))
      // A held peak below what the chart needs changes nothing.
      expect(buildFanGeometry(ages, [flat], { minPeak: 100 }).ymax).toBe(own.ymax)
      // With no series of its own the geometry is built from the peak alone.
      expect(buildFanGeometry(ages, [], { minPeak: 500_000 }).ymax).toBe(own.ymax)
    })

    it('seriesPeak takes the largest finite value of any series', () => {
      expect(seriesPeak([flat, rising])).toBe(rising[rising.length - 1])
      expect(seriesPeak([[1, Number.NaN, 3], [Number.POSITIVE_INFINITY, 2]])).toBe(3)
      expect(seriesPeak([])).toBe(0)
      expect(seriesPeak([[-5, -1]])).toBe(0)
    })

    it('draws a series from another age grid where its ages fall on this axis', () => {
      const geometry = buildFanGeometry(ages, [rising])
      // The saved plan started three years earlier and ends five years sooner.
      const savedAges = Array.from({ length: 34 }, (_, i) => 52 + i)
      const savedSeries = savedAges.map(() => 500_000)
      const path = geometry.lineByAge(savedAges, savedSeries)
      const points = path.slice(1).split(' L')
      // Ages 55–85 are on this chart: 31 points, from the left edge to age 85.
      expect(points).toHaveLength(31)
      expect(points[0].split(',')[0]).toBe('0.0')
      expect(Number(points[30].split(',')[0])).toBeCloseTo(geometry.ageX(85), 1)
      // The same grid gives the same line as `line`.
      expect(geometry.lineByAge(ages, rising)).toBe(geometry.line(rising))
      // Nothing (or a single point) in range draws nothing.
      expect(geometry.lineByAge([10, 20, 30], [1, 2, 3])).toBe('')
      expect(geometry.lineByAge([40, 55], [1, 2])).toBe('')
    })

    it('sliceByAge cuts a series to the ages on screen', () => {
      expect(sliceByAge([50, 55, 60, 65, 70], [1, 2, 3, 4, 5], 55, 65)).toEqual([2, 3, 4])
      expect(sliceByAge([50, 55], [1, 2], 60, 70)).toEqual([])
    })
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
