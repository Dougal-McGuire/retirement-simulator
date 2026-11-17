import { DEFAULT_PARAMS, type SimulationParams } from '@/types'
import { runMonteCarloSimulation } from '../engine'
import { applyCashFlows } from '../cashFlows'

const plan = (overrides: Partial<SimulationParams> = {}) =>
  applyCashFlows({
    ...DEFAULT_PARAMS,
    currentAge: 60,
    retirementAge: 60,
    endAge: 63,
    legalRetirementAge: 67,
    currentAssets: 0,
    annualSavings: 0,
    monthlyPension: 0,
    averageROI: 0,
    roiVolatility: 0,
    averageInflation: 0,
    inflationVolatility: 0,
    capitalGainsTax: 0,
    simulationRuns: 1,
    customExpenses: [],
    oneTimeIncomes: [],
    withdrawalStrategy: 'fixedReal',
    cashFlows: [
      { id: 'living', kind: 'expense', name: 'Living', frequency: 'monthly', amount: 100 },
    ],
    ...overrides,
  })

it('counts only underfunded years, including a gap that returns in the final year', () => {
  const params = plan()
  const result = runMonteCarloSimulation(
    plan({
      cashFlows: [
        ...params.cashFlows,
        {
          id: 'temporary',
          kind: 'income',
          name: 'Temporary income',
          frequency: 'monthly',
          amount: 100,
          startAge: 61,
          endAge: 62,
        },
      ],
    }),
    { sampler: { nextGrowthFactor: () => 1, nextInflationFactor: () => 1.5 } }
  )
  expect(result.shortfallDetails?.funding).toEqual({
    affectedPaths: 1,
    atHorizon: 1,
    medianFirstAge: 60,
    medianAffectedYears: 2,
    medianMonthlyGapReal: 100,
  })
})

it('excludes fully funded paths from the gap medians and identifies bequest-only failures', () => {
  const result = runMonteCarloSimulation(
    plan({
      currentAssets: 1200,
      endAge: 60,
      simulationRuns: 3,
      legacyTargetReal: 100,
    }),
    { sampler: { nextGrowthFactor: (_i, run) => [1, 0.5, 0.2][run], nextInflationFactor: () => 1 } }
  )
  expect(result.shortfallDetails).toMatchObject({
    paths: 3,
    bequestOnlyPaths: 1,
    funding: { affectedPaths: 2, medianMonthlyGapReal: 65 },
  })
})

it('can meet every requested payment while missing an independent lifestyle floor', () => {
  const params = plan({
    currentAssets: 100_000,
    dsWithdrawalRate: 0.04,
    endAge: 60,
    withdrawalStrategy: 'percentOfPortfolio',
    lifestyleFloorMonthlyReal: 500,
  })
  const result = runMonteCarloSimulation(
    plan({
      ...params,
      cashFlows: [
        ...params.cashFlows,
        {
          id: 'repair',
          kind: 'expense',
          name: 'Repair',
          frequency: 'once',
          startAge: 60,
          amount: 6000,
        },
      ],
    })
  )
  expect(result.successRate).toBe(100)
  expect(result.shortfallDetails?.funding.affectedPaths).toBe(0)
  expect(result.shortfallDetails?.funding.medianFirstAge).toBeNull()
  expect(result.shortfallDetails?.fundedPathsBelowLifestyleFloor).toBe(1)
  expect(result.shortfallDetails?.lifestyle?.affectedPaths).toBe(1)
  expect(result.shortfallDetails?.lifestyle?.medianMonthlyGapReal).toBeCloseTo(500 - 4000 / 12)
})

it('ignores working years for lifestyle, respects the funding tolerance and distinguishes recovery', () => {
  const params = plan({
    currentAge: 59,
    currentAssets: 0,
    endAge: 60,
    lifestyleFloorMonthlyReal: 99,
  })
  const result = runMonteCarloSimulation(
    plan({
      ...params,
      cashFlows: [
        ...params.cashFlows,
        { id: 'bill', kind: 'expense', name: 'Bill', frequency: 'once', startAge: 59, amount: 900 },
        {
          id: 'salary',
          kind: 'income',
          name: 'Income',
          frequency: 'monthly',
          startAge: 60,
          amount: 99,
        },
      ],
    })
  )
  expect(result.shortfallDetails?.funding).toEqual({
    affectedPaths: 1,
    atHorizon: 0,
    medianFirstAge: 59,
    medianAffectedYears: 1,
    medianMonthlyGapReal: 75,
  })
  expect(result.shortfallDetails?.lifestyle?.affectedPaths).toBe(0)
  expect(runMonteCarloSimulation(plan()).shortfallDetails?.lifestyle).toBeNull()
})

it('gives equal weight to a path with one bad year and a path with three', () => {
  const result = runMonteCarloSimulation(
    plan({ currentAssets: 1200, endAge: 62, simulationRuns: 2 }),
    {
      sampler: {
        nextGrowthFactor: (year, run) => (year === 0 ? [0.5, 2][run] : 1),
        nextInflationFactor: () => 1,
      },
    }
  )
  const funding = result.shortfallDetails?.funding
  expect(funding).toMatchObject({ affectedPaths: 2, medianFirstAge: 61, medianAffectedYears: 2 })
  expect(funding?.medianMonthlyGapReal).toBeCloseTo(((50 + 100 + 100) / 3 + 100) / 2)
})
