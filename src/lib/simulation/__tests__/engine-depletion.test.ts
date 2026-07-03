import { runMonteCarloSimulation } from '../engine'
import { DEFAULT_PARAMS, SimulationParams } from '@/types'

const baseParams: SimulationParams = { ...DEFAULT_PARAMS, simulationRuns: 200 }

describe('depletionByAge', () => {
  it('stays at zero when the plan is comfortably funded', () => {
    const results = runMonteCarloSimulation({
      ...baseParams,
      currentAssets: 50_000_000,
      roiVolatility: 0.05,
    })

    expect(results.depletionByAge).toHaveLength(results.ages.length)
    expect(results.depletionByAge!.every((value) => value === 0)).toBe(true)
    expect(results.successRate).toBe(100)
  })

  it('hits 1 in the first retirement year when there is no money at all', () => {
    const results = runMonteCarloSimulation({
      ...baseParams,
      currentAssets: 0,
      annualSavings: 0,
      annualSavingsGrowthRate: 0,
      monthlyPension: 0,
      oneTimeIncomes: [],
    })

    const retirementIndex = results.ages.findIndex((age) => age >= baseParams.retirementAge)
    expect(results.successRate).toBe(0)
    results.depletionByAge!.forEach((value, index) => {
      expect(value).toBe(index >= retirementIndex ? 1 : 0)
    })
  })

  it('is monotonically non-decreasing and consistent with the success rate', () => {
    const results = runMonteCarloSimulation({
      ...baseParams,
      currentAssets: 150_000,
      annualSavings: 0,
      monthlyPension: 1000,
      roiVolatility: 0.25,
    })

    const depletion = results.depletionByAge!
    for (let i = 1; i < depletion.length; i++) {
      expect(depletion[i]).toBeGreaterThanOrEqual(depletion[i - 1])
    }
    expect(depletion[depletion.length - 1]).toBeCloseTo(1 - results.successRate / 100, 10)
  })
})
