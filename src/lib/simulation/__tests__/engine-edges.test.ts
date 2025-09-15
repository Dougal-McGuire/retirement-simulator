import { runMonteCarloSimulation, calculateCombinedExpenses } from '../engine'
import { DEFAULT_PARAMS } from '@/types'

describe('Simulation Engine - edges', () => {
  it('spending percentiles are monotonic (p10 <= p50 <= p90)', () => {
    const testParams = { ...DEFAULT_PARAMS, simulationRuns: 120 }
    const results = runMonteCarloSimulation(testParams)
    for (let i = 0; i < results.ages.length; i++) {
      expect(results.spendingPercentiles.p10[i]).toBeLessThanOrEqual(
        results.spendingPercentiles.p50[i]
      )
      expect(results.spendingPercentiles.p50[i]).toBeLessThanOrEqual(
        results.spendingPercentiles.p90[i]
      )
    }
  })

  it('calculateCombinedExpenses returns consistent totals', () => {
    const monthly = { a: 100, b: 200, c: 300 }
    const annual = { x: 1200, y: 600 }
    const { totalMonthly, totalAnnual, combinedMonthly, combinedAnnual } =
      calculateCombinedExpenses(monthly, annual)
    expect(totalMonthly).toBe(600)
    expect(totalAnnual).toBe(1800)
    expect(combinedMonthly).toBe(600 + 1800 / 12)
    expect(combinedAnnual).toBe(600 * 12 + 1800)
  })
})
