import { spendingDomainMax } from '../spendingScale'

describe('spendingDomainMax', () => {
  const data = [
    { spending_p50: 1000, spending_p90: 1800 },
    { spending_p50: 1200, spending_p90: 2200 },
    { spending_p50: 9000, spending_p90: 12000 },
  ]
  const visible = { startIndex: 0, endIndex: 1 }

  it('uses the visible median range in focus mode', () => {
    const focus = spendingDomainMax(data, visible, 'focus')
    expect(focus).toBeGreaterThanOrEqual(1200)
    expect(focus).toBeLessThan(2200)
  })

  it('uses the visible outer range in full mode', () => {
    const full = spendingDomainMax(data, visible, 'full')
    expect(full).toBeGreaterThanOrEqual(2200)
    expect(full).toBeLessThan(9000)
  })
})
