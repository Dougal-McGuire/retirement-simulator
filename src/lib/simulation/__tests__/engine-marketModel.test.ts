import {
  blendPortfolioMoments,
  buildEquityGlidePath,
  createHistoricalSampler,
  runMonteCarloSimulation,
} from '@/lib/simulation/engine'
import { HISTORICAL_MARKET_YEARS } from '@/lib/simulation/data/historicalMarket'
import { DEFAULT_PARAMS, type SimulationParams } from '@/types'

const withParams = (overrides: Partial<SimulationParams>): SimulationParams => ({
  ...DEFAULT_PARAMS,
  ...overrides,
})

const terminalSpread = (params: SimulationParams) => {
  const results = runMonteCarloSimulation(params)
  const last = results.ages.length - 1
  return results.assetPercentiles.p90[last] - results.assetPercentiles.p10[last]
}

describe('asset allocation glide path', () => {
  it('changes nothing at all while it is switched off', () => {
    const baseline = runMonteCarloSimulation(DEFAULT_PARAMS)
    // Deliberately absurd allocation inputs: with the feature off they must not
    // reach the model at all, not even by a floating-point hair.
    const withDormantGlidePath = runMonteCarloSimulation(
      withParams({
        glidePathEnabled: false,
        equityAllocationStart: 0.1,
        equityAllocationEnd: 0.05,
        bondReturn: 0.2,
        bondVolatility: 0.4,
      })
    )

    expect(withDormantGlidePath.successRate).toBe(baseline.successRate)
    expect(withDormantGlidePath.assetPercentiles).toEqual(baseline.assetPercentiles)
    expect(withDormantGlidePath.spendingPercentiles).toEqual(baseline.spendingPercentiles)
    expect(withDormantGlidePath.assetPercentilesReal).toEqual(baseline.assetPercentilesReal)
  })

  it('slides linearly to the end allocation and then holds it', () => {
    const params = withParams({
      glidePathEnabled: true,
      currentAge: 55,
      retirementAge: 60,
      endAge: 65,
      equityAllocationStart: 0.8,
      equityAllocationEnd: 0.4,
    })

    const weights = buildEquityGlidePath(params, params.endAge - params.currentAge + 1)

    expect(weights.slice(0, 6)).toEqual([0.8, 0.72, 0.64, 0.56, 0.48, 0.4])
    // Retirement and everything after it sits at the end allocation.
    expect(weights.slice(5)).toEqual([0.4, 0.4, 0.4, 0.4, 0.4, 0.4])
  })

  it('is all-equity for every year while disabled', () => {
    expect(buildEquityGlidePath(withParams({ glidePathEnabled: false }), 4)).toEqual([1, 1, 1, 1])
  })

  it('collapses to a flat blended portfolio when start equals end', () => {
    const start = 0.6
    const blended = blendPortfolioMoments(
      start,
      DEFAULT_PARAMS.averageROI,
      DEFAULT_PARAMS.roiVolatility,
      DEFAULT_PARAMS.bondReturn,
      DEFAULT_PARAMS.bondVolatility
    )

    const flatGlide = runMonteCarloSimulation(
      withParams({
        glidePathEnabled: true,
        equityAllocationStart: start,
        equityAllocationEnd: start,
      })
    )
    // The same portfolio expressed as a single asset: no glide path, mean and
    // volatility set to the blend. Same scenario set, so this is exact.
    const equivalentFlat = runMonteCarloSimulation(
      withParams({
        glidePathEnabled: false,
        averageROI: blended.mean,
        roiVolatility: blended.stdev,
      })
    )

    expect(flatGlide.successRate).toBe(equivalentFlat.successRate)
    expect(flatGlide.assetPercentiles.p50).toEqual(equivalentFlat.assetPercentiles.p50)
    expect(flatGlide.assetPercentiles.p10).toEqual(equivalentFlat.assetPercentiles.p10)
  })

  it('blends the two sleeves with a zero-correlation variance', () => {
    const { mean, stdev } = blendPortfolioMoments(0.5, 0.08, 0.2, 0.02, 0.06)

    expect(mean).toBeCloseTo(0.05, 12)
    expect(stdev).toBeCloseTo(Math.sqrt(0.25 * 0.04 + 0.25 * 0.0036), 12)
  })

  it('narrows the terminal outcome band when the allocation declines', () => {
    const glided = terminalSpread(
      withParams({
        glidePathEnabled: true,
        equityAllocationStart: 0.8,
        equityAllocationEnd: 0.2,
      })
    )
    const allEquity = terminalSpread(withParams({ glidePathEnabled: false }))

    expect(glided).toBeLessThan(allEquity)
  })
})

describe('historical market model', () => {
  const historicalParams = withParams({ marketModel: 'historical' })

  it('runs exactly one path per start year in the series', () => {
    const results = runMonteCarloSimulation(historicalParams)
    const pathCount = HISTORICAL_MARKET_YEARS.length

    expect(pathCount).toBe(125)
    // The success rate is the share of surviving start years, so it can only
    // land on a multiple of 1/125.
    expect(Number.isInteger(Math.round((results.successRate / 100) * pathCount))).toBe(true)
    expect(((results.successRate / 100) * pathCount) % 1).toBeCloseTo(0, 9)
  })

  it('ignores the requested run count — the history sets it', () => {
    const few = runMonteCarloSimulation(
      withParams({ marketModel: 'historical', simulationRuns: 5 })
    )
    const many = runMonteCarloSimulation(
      withParams({ marketModel: 'historical', simulationRuns: 9000 })
    )

    expect(few.successRate).toBe(many.successRate)
    expect(few.assetPercentiles).toEqual(many.assetPercentiles)
    // ...and the user's chosen count survives on the params for when they
    // switch back to Monte Carlo.
    expect(few.params.simulationRuns).toBe(5)
  })

  it('is deterministic and consumes no randomness', () => {
    const explode = () => {
      throw new Error('historical mode must not draw random numbers')
    }

    const first = runMonteCarloSimulation(historicalParams, { random: explode })
    const second = runMonteCarloSimulation(historicalParams, { random: explode })

    expect(first.successRate).toBe(second.successRate)
    expect(first.assetPercentiles).toEqual(second.assetPercentiles)
  })

  it('freezes the historical success rate for the shipped defaults', () => {
    // Golden: changing the series or the replay rule must be a deliberate act.
    // 123 of the 125 start years survive the default plan; the two that do not
    // (1968 and 1969) are the classic worst-case sequence — a bear market
    // straight into the 1970s inflation, exactly the risk this mode exists to
    // surface.
    expect(runMonteCarloSimulation(historicalParams).successRate).toBe(98.4)
  })

  it('leaves Monte Carlo results untouched', () => {
    const monteCarlo = runMonteCarloSimulation(withParams({ marketModel: 'monteCarlo' }))
    const baseline = runMonteCarloSimulation(DEFAULT_PARAMS)

    expect(monteCarlo.successRate).toBe(baseline.successRate)
    expect(monteCarlo.assetPercentiles).toEqual(baseline.assetPercentiles)
  })

  it('wraps around so every start year yields a full-length history', () => {
    const length = HISTORICAL_MARKET_YEARS.length
    const sampler = createHistoricalSampler(new Array<number>(length).fill(1))
    const noRandom = () => {
      throw new Error('no randomness expected')
    }

    const lastRun = length - 1
    // Starts on the final year of the series...
    expect(sampler.nextGrowthFactor(0, lastRun, noRandom)).toBeCloseTo(
      1 + HISTORICAL_MARKET_YEARS[lastRun].equityReturn,
      12
    )
    // ...and continues into the first, instead of running out of history.
    expect(sampler.nextGrowthFactor(1, lastRun, noRandom)).toBeCloseTo(
      1 + HISTORICAL_MARKET_YEARS[0].equityReturn,
      12
    )
    expect(sampler.nextInflationFactor(2, lastRun, noRandom)).toBeCloseTo(
      1 + HISTORICAL_MARKET_YEARS[1].inflation,
      12
    )
  })

  it('blends the actual equity and bond returns at the glide-path weight', () => {
    const weights = [0.5, 0.5]
    const sampler = createHistoricalSampler(weights)
    const noRandom = () => 0.5
    const row = HISTORICAL_MARKET_YEARS[0]

    expect(sampler.nextGrowthFactor(0, 0, noRandom)).toBeCloseTo(
      1 + 0.5 * row.equityReturn + 0.5 * row.bondReturn,
      12
    )
  })

  it('describes a plausible century of returns', () => {
    const years = HISTORICAL_MARKET_YEARS
    const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

    expect(years).toHaveLength(125)
    expect(years[0].year).toBe(1900)
    expect(years[years.length - 1].year).toBe(2024)
    // Strictly consecutive calendar years — a gap would silently shorten paths.
    expect(years.every((entry, index) => entry.year === 1900 + index)).toBe(true)
    // Long-run averages in the range every published study agrees on.
    expect(mean(years.map((y) => y.equityReturn))).toBeGreaterThan(0.08)
    expect(mean(years.map((y) => y.equityReturn))).toBeLessThan(0.13)
    expect(mean(years.map((y) => y.bondReturn))).toBeGreaterThan(0.02)
    expect(mean(years.map((y) => y.bondReturn))).toBeLessThan(0.07)
    expect(mean(years.map((y) => y.inflation))).toBeGreaterThan(0.02)
    expect(mean(years.map((y) => y.inflation))).toBeLessThan(0.045)
    // No year may wipe out more than the portfolio itself.
    expect(years.every((y) => y.equityReturn > -1 && y.bondReturn > -1)).toBe(true)
  })
})
