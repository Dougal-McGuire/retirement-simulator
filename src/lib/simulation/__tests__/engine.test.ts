import { boxMullerTransform, calculatePercentile, runMonteCarloSimulation } from '../engine'
import { DEFAULT_PARAMS } from '@/types'

describe('Simulation Engine', () => {
  describe('boxMullerTransform', () => {
    it('should generate numbers with approximately correct mean and standard deviation', () => {
      const mean = 0.07
      const stdDev = 0.02
      const samples = Array.from({ length: 10000 }, () => boxMullerTransform(mean, stdDev))

      const calculatedMean = samples.reduce((sum, val) => sum + val, 0) / samples.length
      const variance =
        samples.reduce((sum, val) => sum + Math.pow(val - calculatedMean, 2), 0) / samples.length
      const calculatedStdDev = Math.sqrt(variance)

      expect(calculatedMean).toBeCloseTo(mean, 2)
      expect(calculatedStdDev).toBeCloseTo(stdDev, 1)
    })
  })

  describe('calculatePercentile', () => {
    it('should correctly calculate percentiles', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

      expect(calculatePercentile(data, 50)).toBe(5.5) // median
      expect(calculatePercentile(data, 0)).toBe(1) // minimum
      expect(calculatePercentile(data, 100)).toBe(10) // maximum
      expect(calculatePercentile(data, 25)).toBe(3.25) // first quartile
    })
  })

  describe('runMonteCarloSimulation', () => {
    it('should run simulation without errors', () => {
      const testParams = { ...DEFAULT_PARAMS, simulationRuns: 10 }
      const results = runMonteCarloSimulation(testParams)

      expect(results).toBeDefined()
      expect(results.ages).toHaveLength(testParams.endAge - testParams.currentAge + 1)
      expect(results.assetPercentiles.p10).toHaveLength(results.ages.length)
      expect(results.assetPercentiles.p50).toHaveLength(results.ages.length)
      expect(results.assetPercentiles.p90).toHaveLength(results.ages.length)
      expect(results.successRate).toBeGreaterThanOrEqual(0)
      expect(results.successRate).toBeLessThanOrEqual(100)
    })

    it('should have increasing percentiles (p10 <= p50 <= p90)', () => {
      const testParams = { ...DEFAULT_PARAMS, simulationRuns: 100 }
      const results = runMonteCarloSimulation(testParams)

      for (let i = 0; i < results.ages.length; i++) {
        expect(results.assetPercentiles.p10[i]).toBeLessThanOrEqual(results.assetPercentiles.p50[i])
        expect(results.assetPercentiles.p50[i]).toBeLessThanOrEqual(results.assetPercentiles.p90[i])
      }
    })
  })
})
