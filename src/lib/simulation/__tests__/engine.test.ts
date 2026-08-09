import {
  boxMullerTransform,
  calculatePercentile,
  calculatePercentiles,
  mulberry32,
  runMonteCarloSimulation,
} from '../engine'
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

    it('should return a finite fallback for empty data', () => {
      expect(calculatePercentile([], 50)).toBe(0)
    })

    it('should clamp invalid percentile values to finite boundaries', () => {
      const data = [1, 2, 3, 4, 5]

      expect(calculatePercentile(data, -10)).toBe(1)
      expect(calculatePercentile(data, 110)).toBe(5)
      expect(calculatePercentile(data, Number.NaN)).toBe(1)
      expect(calculatePercentile(data, Number.POSITIVE_INFINITY)).toBe(5)
    })
  })

  describe('calculatePercentiles', () => {
    it('calculates all supported percentiles for each age slice', () => {
      const result = calculatePercentiles([
        [10, 100],
        [20, 200],
        [30, 300],
        [40, 400],
      ])

      expect(result).toEqual({
        p10: [13, 130],
        p20: [16, 160],
        p50: [25, 250],
        p80: [34, 340],
        p90: [37, 370],
      })
    })

    it('sorts each age slice only once', () => {
      const sortSpy = jest.spyOn(Array.prototype, 'sort')

      calculatePercentiles([
        [10, 100],
        [20, 200],
        [30, 300],
        [40, 400],
      ])

      expect(sortSpy).toHaveBeenCalledTimes(2)
      sortSpy.mockRestore()
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

    it('is deterministic for identical parameters', () => {
      const testParams = { ...DEFAULT_PARAMS, simulationRuns: 50 }
      const first = runMonteCarloSimulation(testParams)
      const second = runMonteCarloSimulation({ ...testParams })

      expect(second.successRate).toBe(first.successRate)
      expect(second.assetPercentiles.p50).toEqual(first.assetPercentiles.p50)
      expect(second.spendingPercentiles.p50).toEqual(first.spendingPercentiles.p50)
    })

    it('produces different market paths when parameters differ', () => {
      const base = runMonteCarloSimulation({ ...DEFAULT_PARAMS, simulationRuns: 50 })
      const varied = runMonteCarloSimulation({
        ...DEFAULT_PARAMS,
        simulationRuns: 50,
        roiVolatility: DEFAULT_PARAMS.roiVolatility + 0.05,
      })

      expect(varied.assetPercentiles.p50).not.toEqual(base.assetPercentiles.p50)
    })

    it('accepts an explicit random source', () => {
      const testParams = { ...DEFAULT_PARAMS, simulationRuns: 20 }
      const seeded = runMonteCarloSimulation(testParams, { random: mulberry32(1234) })
      const sameSeed = runMonteCarloSimulation(testParams, { random: mulberry32(1234) })

      expect(sameSeed.assetPercentiles.p50).toEqual(seeded.assetPercentiles.p50)
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
