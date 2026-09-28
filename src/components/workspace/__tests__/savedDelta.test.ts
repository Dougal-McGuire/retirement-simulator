import { roundDelta, savedDeltaTone, savedSuccessDelta } from '@/components/workspace/savedDelta'

describe('savedSuccessDelta (the result bar delta against the saved plan)', () => {
  it('is null while the working copy is clean', () => {
    expect(savedSuccessDelta({ isDirty: false, savedRate: 90, rate: 95 })).toBeNull()
  })

  it('is null while the saved plan has no known rate, or there are no results', () => {
    expect(savedSuccessDelta({ isDirty: true, savedRate: undefined, rate: 95 })).toBeNull()
    expect(savedSuccessDelta({ isDirty: true, savedRate: null, rate: 95 })).toBeNull()
    expect(savedSuccessDelta({ isDirty: true, savedRate: 90, rate: null })).toBeNull()
    expect(savedSuccessDelta({ isDirty: true, savedRate: Number.NaN, rate: 95 })).toBeNull()
  })

  it('is the difference in points, with its sign', () => {
    expect(savedSuccessDelta({ isDirty: true, savedRate: 90, rate: 91.3 })).toBeCloseTo(1.3)
    expect(savedSuccessDelta({ isDirty: true, savedRate: 95.2, rate: 93.1 })).toBeCloseTo(-2.1)
    expect(savedSuccessDelta({ isDirty: true, savedRate: 88, rate: 88 })).toBe(0)
  })

  it('takes its tone from the rounded value the chip shows', () => {
    expect(savedDeltaTone(1.3)).toBe('ok')
    expect(savedDeltaTone(-2.1)).toBe('danger')
    expect(savedDeltaTone(0)).toBe('neutral')
    // Rounds to ±0 → neutral, never a red "−0,0".
    expect(savedDeltaTone(-0.04)).toBe('neutral')
    expect(savedDeltaTone(0.04)).toBe('neutral')
    expect(Object.is(roundDelta(-0.04), 0)).toBe(true)
    expect(roundDelta(1.26)).toBe(1.3)
  })
})
