import {
  DEFAULT_TWEEN_MS,
  easeOutCubic,
  tweenDuration,
  tweenValue,
} from '@/components/workspace/AnimatedNumber'

describe('AnimatedNumber tween', () => {
  it('eases out: fast start, gentle landing, clamped to [0, 1]', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5)
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
  })

  it('moves from the value on screen to the target and ends exactly on it', () => {
    expect(tweenValue(90, 95, 0, 240)).toBe(90)
    expect(tweenValue(90, 95, 120, 240)).toBeCloseTo(90 + 5 * 0.875, 5)
    expect(tweenValue(90, 95, 240, 240)).toBe(95)
    expect(tweenValue(90, 95, 1000, 240)).toBe(95)
    // Downward changes tween too.
    expect(tweenValue(95, 90, 120, 240)).toBeCloseTo(95 - 5 * 0.875, 5)
  })

  it('is instant under reduced motion', () => {
    expect(tweenDuration(90, 95, DEFAULT_TWEEN_MS, true)).toBe(0)
    expect(tweenValue(90, 95, 0, 0)).toBe(95)
  })

  it('animates only real changes between finite numbers', () => {
    expect(tweenDuration(90, 95, DEFAULT_TWEEN_MS, false)).toBe(DEFAULT_TWEEN_MS)
    expect(tweenDuration(95, 95, DEFAULT_TWEEN_MS, false)).toBe(0)
    expect(tweenDuration(null, 95, DEFAULT_TWEEN_MS, false)).toBe(0)
    expect(tweenDuration(90, null, DEFAULT_TWEEN_MS, false)).toBe(0)
    expect(tweenDuration(Number.NaN, 95, DEFAULT_TWEEN_MS, false)).toBe(0)
    expect(tweenDuration(90, 95, 0, false)).toBe(0)
  })

  it('is interruptible: a new tween starts from the mid-flight value', () => {
    const midway = tweenValue(90, 95, 60, 240)
    expect(midway).toBeGreaterThan(90)
    expect(midway).toBeLessThan(95)
    // Redirected to 80 from wherever it was, not from 95.
    expect(tweenValue(midway, 80, 0, 240)).toBe(midway)
    expect(tweenValue(midway, 80, 240, 240)).toBe(80)
  })
})
