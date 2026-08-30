import { spendingDomainMax } from '../spendingScale'

describe('spendingDomainMax', () => {
  const data = [
    { spending_p90: 1000 },
    { spending_p90: 2000 },
    { spending_p90: 9000 },
  ]

  it('scales to the visible window in focus mode', () => {
    expect(spendingDomainMax(data, { startIndex: 0, endIndex: 1 }, 'focus')).toBeLessThan(9000)
  })

  it('keeps the full series available in full mode', () => {
    expect(spendingDomainMax(data, { startIndex: 0, endIndex: 1 }, 'full')).toBeGreaterThanOrEqual(9000)
  })
})
