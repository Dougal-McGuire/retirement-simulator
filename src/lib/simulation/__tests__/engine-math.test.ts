import {
  computeGrossWithdrawal,
  lognormalParamsFromArithmetic,
  sampleLognormalFactorFromArithmetic,
  runMonteCarloSimulation,
} from '../engine'
import { DEFAULT_PARAMS } from '@/types'

describe('Engine math correctness', () => {
  it('computeGrossWithdrawal grosses up correctly for taxed gains', () => {
    const currentAssets = 1100
    const costBasis = 1000 // basis ratio ~ 0.9090909
    const netNeeded = 100
    const t = 0.25
    const W = computeGrossWithdrawal(currentAssets, costBasis, netNeeded, t)
    // Expected denom = 1 - 0.25*(1 - 1000/1100) = 0.977272727...
    const expected = 100 / (1 - 0.25 * (1 - 1000 / 1100))
    expect(W).toBeCloseTo(expected, 6)
  })

  it('lognormalParamsFromArithmetic yields factors with target arithmetic mean/std (approx)', () => {
    const mean = 0.07
    const stdev = 0.15
    const N = 20000
    let sum = 0
    let sum2 = 0
    for (let i = 0; i < N; i++) {
      const f = sampleLognormalFactorFromArithmetic(mean, stdev)
      const r = f - 1
      sum += r
      sum2 += r * r
    }
    const m = sum / N
    const variance = sum2 / N - m * m
    const s = Math.sqrt(Math.max(0, variance))
    expect(m).toBeCloseTo(mean, 2)
    expect(s).toBeCloseTo(stdev, 2)
  })

  it('inflation factor sampling stays positive', () => {
    const mean = 0.025
    const stdev = 0.01
    for (let i = 0; i < 10000; i++) {
      const f = sampleLognormalFactorFromArithmetic(mean, stdev)
      expect(f).toBeGreaterThan(0)
    }
  })

  it('surplus income gets reinvested during retirement', () => {
    // One-year retirement with zero ROI and no inflation, pension exceeds expenses
    const params = {
      ...DEFAULT_PARAMS,
      currentAge: 60,
      retirementAge: 60,
      legalRetirementAge: 60,
      endAge: 60,
      currentAssets: 1000,
      annualSavings: 0,
      monthlyPension: 1000, // 12000 annual income
      averageROI: 0,
      roiVolatility: 0,
      averageInflation: 0,
      inflationVolatility: 0,
      monthlyExpenses: {
        health: 0,
        food: 0,
        entertainment: 0,
        shopping: 0,
        utilities: 0,
      },
      annualExpenses: {
        vacations: 0,
        repairs: 0,
        carMaintenance: 0,
      },
      simulationRuns: 1,
    }
    const results = runMonteCarloSimulation(params)
    expect(results.assetPercentiles.p50[0]).toBeCloseTo(1000 + 12000, 6)
  })

  it('withdrawal uses proper tax gross-up in a deterministic scenario', () => {
    // Immediate retirement, one-year, ROI deterministic positive (10%), no inflation, no pension.
    const params = {
      ...DEFAULT_PARAMS,
      currentAge: 60,
      retirementAge: 60,
      legalRetirementAge: 90,
      endAge: 60,
      currentAssets: 1000,
      annualSavings: 0,
      monthlyPension: 0,
      averageROI: 0.1,
      roiVolatility: 0,
      averageInflation: 0,
      inflationVolatility: 0,
      capitalGainsTax: 25,
      monthlyExpenses: {
        health: 100 / 12, // total annual = 100
        food: 0,
        entertainment: 0,
        shopping: 0,
        utilities: 0,
      },
      annualExpenses: {
        vacations: 0,
        repairs: 0,
        carMaintenance: 0,
      },
      simulationRuns: 1,
    }
    const results = runMonteCarloSimulation(params)
    // After ROI: 1000 * 1.1 = 1100; basisRatio = 1000/1100; denom = 1 - 0.25*(1 - basisRatio)
    const denom = 1 - 0.25 * (1 - 1000 / 1100)
    const expectedWithdrawal = 100 / denom
    const expectedAssetsEnd = 1100 - expectedWithdrawal
    expect(results.assetPercentiles.p50[0]).toBeCloseTo(expectedAssetsEnd, 4)
  })
})

