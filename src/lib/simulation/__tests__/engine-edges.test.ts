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
    const customExpenses = [
      { id: 'a', name: 'A', amount: 100, interval: 'monthly' as const },
      { id: 'b', name: 'B', amount: 200, interval: 'monthly' as const },
      { id: 'c', name: 'C', amount: 300, interval: 'monthly' as const },
      { id: 'x', name: 'X', amount: 1200, interval: 'annual' as const },
      { id: 'y', name: 'Y', amount: 600, interval: 'annual' as const },
    ]
    const { totalMonthly, totalAnnual, combinedMonthly, combinedAnnual } =
      calculateCombinedExpenses(customExpenses)
    expect(totalMonthly).toBe(600)
    expect(totalAnnual).toBe(1800)
    expect(combinedMonthly).toBe(600 + 1800 / 12)
    expect(combinedAnnual).toBe(600 * 12 + 1800)
  })

  it('normalizes temporary invalid inputs so simulation still returns finite outputs', () => {
    const params = {
      ...DEFAULT_PARAMS,
      currentAge: 30,
      retirementAge: 20,
      legalRetirementAge: 10,
      endAge: 25,
      averageROI: -1.5,
      simulationRuns: 0,
    }

    const results = runMonteCarloSimulation(params)

    expect(results.ages.length).toBeGreaterThan(0)
    expect(Number.isFinite(results.successRate)).toBe(true)
    expect(results.successRate).toBeGreaterThanOrEqual(0)
    expect(results.successRate).toBeLessThanOrEqual(100)
    expect(results.params.simulationRuns).toBe(1)
    expect(results.params.endAge).toBeGreaterThanOrEqual(results.params.retirementAge)
    expect(results.params.retirementAge).toBeGreaterThanOrEqual(results.params.currentAge)
  })
})
