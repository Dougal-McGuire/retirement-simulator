import {
  besteuerungsanteil,
  incomeTax,
  incomeTaxSingle,
  oneFifthRuleTax,
  ordinaryIncomeTax,
  versorgungsfreibetrag,
} from '@/lib/simulation/germanTax'

describe('§ 32a income tax tariff (2025)', () => {
  it('charges nothing up to the Grundfreibetrag and is monotonic beyond it', () => {
    expect(incomeTaxSingle(12_096)).toBe(0)
    expect(incomeTaxSingle(12_097)).toBeGreaterThanOrEqual(0)
    let previous = 0
    for (let taxable = 0; taxable <= 400_000; taxable += 1_000) {
      const tax = incomeTaxSingle(taxable)
      expect(tax).toBeGreaterThanOrEqual(previous)
      previous = tax
    }
  })

  it('matches the published zone formulas at their boundaries', () => {
    // Top of zone 2: y = 0.5347 → (932.3·y + 1400)·y = 1015.13… floored.
    expect(incomeTaxSingle(17_443)).toBe(1_015)
    // Top of the 42 % zone.
    expect(incomeTaxSingle(277_825)).toBe(Math.floor(0.42 * 277_825 - 10_911.92))
    // Rich-tax zone.
    expect(incomeTaxSingle(300_000)).toBe(Math.floor(0.45 * 300_000 - 19_246.67))
  })

  it('applies splitting as twice the tax on half the income', () => {
    expect(incomeTax(80_000, true)).toBe(2 * incomeTaxSingle(40_000))
    expect(incomeTax(80_000, true)).toBeLessThan(incomeTax(80_000, false))
  })
})

describe('ordinary income on top of other income', () => {
  it('is the marginal tax the extra income triggers', () => {
    const rest = 30_000
    expect(ordinaryIncomeTax(10_000, rest)).toBe(incomeTax(40_000) - incomeTax(30_000))
  })

  it('treats negative other income as zero', () => {
    expect(ordinaryIncomeTax(10_000, -5_000)).toBe(incomeTax(10_000))
  })
})

describe('§ 34 one-fifth rule', () => {
  it('counts the extra tax on one fifth five times', () => {
    const gross = 100_000
    const rest = 40_000
    const expected = 5 * (incomeTax(rest + gross / 5) - incomeTax(rest))
    expect(oneFifthRuleTax(gross, rest)).toBe(expected)
    // …and that is less than taxing the sum as ordinary income.
    expect(oneFifthRuleTax(gross, rest)).toBeLessThan(ordinaryIncomeTax(gross, rest))
  })

  it('lets negative other income eat into the sum first', () => {
    const gross = 100_000
    const rest = -20_000
    expect(oneFifthRuleTax(gross, rest)).toBe(5 * incomeTax(80_000 / 5))
    // A loss larger than the sum leaves nothing to tax.
    expect(oneFifthRuleTax(gross, -150_000)).toBe(0)
  })

  it('respects splitting', () => {
    expect(oneFifthRuleTax(100_000, 40_000, true)).toBeLessThan(oneFifthRuleTax(100_000, 40_000))
  })
})

describe('Besteuerungsanteil by start year', () => {
  it('follows the § 22 table', () => {
    expect(besteuerungsanteil(2005)).toBe(0.5)
    expect(besteuerungsanteil(2020)).toBe(0.8)
    expect(besteuerungsanteil(2022)).toBe(0.82)
    expect(besteuerungsanteil(2023)).toBe(0.825)
    expect(besteuerungsanteil(2033)).toBe(0.875)
    expect(besteuerungsanteil(2034)).toBe(0.88)
    expect(besteuerungsanteil(2058)).toBe(1)
    expect(besteuerungsanteil(2070)).toBe(1)
  })
})

describe('Versorgungsfreibetrag by start year', () => {
  it('follows the § 19 Abs. 2 table', () => {
    expect(versorgungsfreibetrag(2005)).toEqual({ share: 0.4, cap: 3_000, supplement: 900 })
    expect(versorgungsfreibetrag(2020)).toEqual({ share: 0.16, cap: 1_200, supplement: 360 })
    expect(versorgungsfreibetrag(2033)).toEqual({ share: 0.1, cap: 750, supplement: 225 })
    expect(versorgungsfreibetrag(2058)).toEqual({ share: 0, cap: 0, supplement: 0 })
  })
})
