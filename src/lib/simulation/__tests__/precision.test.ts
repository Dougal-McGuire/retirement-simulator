import { DEFAULT_PARAMS, type SimulationParams } from '@/types'
import {
  MAX_SIMULATION_RUNS,
  comparisonRunCount,
  observedSuccessPercent,
  effectiveRunCount,
  formatSamplingInterval95,
  samplingInterval95,
} from '../context'
import { lognormalParamsFromArithmetic, runMonteCarloSimulation } from '../engine'
import { HISTORICAL_PATH_COUNT } from '../data/historicalMarket'

test('the approximate 95% interval narrows with more runs and remains open at the extremes', () => {
  const quick = samplingInterval95(455, 500)
  const final = samplingInterval95(4550, 5000)
  expect(quick.lower).toBeCloseTo(88.17, 1)
  expect(quick.upper).toBeCloseTo(93.21, 1)
  expect(final.lower).toBeGreaterThan(quick.lower)
  expect(final.upper).toBeLessThan(quick.upper)
  expect(samplingInterval95(0, 500).lower).toBe(0)
  expect(samplingInterval95(0, 500).upper).toBeCloseTo(0.762, 3)
  expect(samplingInterval95(500, 500).upper).toBe(100)
  expect(samplingInterval95(500, 500).lower).toBeCloseTo(99.238, 3)
})

test.each([10000, 20000])(
  'outward-rounded limits stay distinct in English and German at %i paths',
  (runs) => {
    for (const locale of ['en', 'de']) {
      const number = (value: number, options: Intl.NumberFormatOptions) =>
        new Intl.NumberFormat(locale, options).format(value)
      const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })
      expect(formatSamplingInterval95(0, runs, number)).toEqual({
        lower: percent.format(0),
        upper: percent.format(0.001),
      })
      expect(formatSamplingInterval95(runs, runs, number)).toEqual({
        lower: percent.format(0.999),
        upper: percent.format(1),
      })
    }
  }
)

test('all selected Monte Carlo plans get a common budget, independently of historical runs', () => {
  const monteCarlo = { ...DEFAULT_PARAMS, simulationRuns: 200 }
  const historical = {
    ...DEFAULT_PARAMS,
    marketModel: 'historical' as const,
    simulationRuns: 10000,
  }
  expect(comparisonRunCount([monteCarlo, DEFAULT_PARAMS, historical], false)).toBe(200)
  expect(comparisonRunCount([monteCarlo, DEFAULT_PARAMS, historical], true)).toBe(5000)
  expect(comparisonRunCount([{ ...monteCarlo, simulationRuns: 8000 }, monteCarlo], true)).toBe(8000)
  expect(comparisonRunCount([{ ...monteCarlo, simulationRuns: 1e9 }], true)).toBe(20000)
  expect(effectiveRunCount({ ...monteCarlo, simulationRuns: Number.NaN })).toBe(1)
  expect(effectiveRunCount(historical)).toBe(HISTORICAL_PATH_COUNT)
})

test('changing return and inflation assumptions transforms the same year-by-year market shocks', () => {
  const base: SimulationParams = {
    ...DEFAULT_PARAMS,
    currentAge: 50,
    retirementAge: 55,
    endAge: 58,
    annualSavings: 0,
    monthlyPension: 0,
    oneTimeIncomes: [],
    cashFlows: [],
    customExpenses: [],
    withdrawalStrategy: 'fixedReal',
    simulationRuns: 8,
  }
  // With no flows, the nominal balance and realised price level reveal both
  // actual market draws, including years on either side of retirement.
  function recoverShocks(params: SimulationParams) {
    const results = runMonteCarloSimulation(params)
    const roi = lognormalParamsFromArithmetic(params.averageROI, params.roiVolatility)
    const inflation = lognormalParamsFromArithmetic(
      params.averageInflation,
      params.inflationVolatility
    )
    return results.sampleAssetPaths!.flatMap((nominal, path) => {
      const real = results.sampleAssetPathsReal![path]
      return nominal.flatMap((assets, year) => {
        const previous = year ? nominal[year - 1] : params.currentAssets
        const priceLevel = assets / real[year]
        const previousLevel = year ? previous / real[year - 1] : 1
        return [
          (Math.log(assets / previous) - roi.mu) / roi.sigma,
          (Math.log(priceLevel / previousLevel) - inflation.mu) / inflation.sigma,
        ]
      })
    })
  }
  const original = recoverShocks(base)
  const changed = recoverShocks({
    ...base,
    averageROI: 0.04,
    roiVolatility: 0.24,
    averageInflation: 0.035,
    inflationVolatility: 0.02,
    simulationRuns: 12,
    retirementAge: 53,
  })
  expect(changed).toHaveLength(original.length)
  expect(original.length).toBeGreaterThan(0)
  changed.forEach((draw, index) => expect(draw).toBeCloseTo(original[index], 9))
})

it('agrees with the count-based decision at every supported run count and whole-percent target', () => {
  for (let paths = 1; paths <= MAX_SIMULATION_RUNS; paths++) {
    for (let target = 1; target <= 100; target++) {
      const needed = Math.ceil((target * paths) / 100)
      const at = observedSuccessPercent(needed, paths)
      const below = observedSuccessPercent(needed - 1, paths)
      const exact = (target * paths) % 100 === 0
      if (below >= target || at < target || (exact && at !== target)) {
        throw new Error(
          `Threshold mismatch at ${needed}/${paths}, target ${target}%: ${below}, ${at}`
        )
      }
    }
  }
})
