import { DEFAULT_PARAMS, type SimulationParams } from '@/types'
import { runMonteCarloSimulation } from '../engine'
import { projectCustomExpenses } from '../cashFlows'
import { compareRetirementAges } from '../retirementFrontier'

const flat: SimulationParams = {
  ...DEFAULT_PARAMS,
  currentAge: 65,
  retirementAge: 66,
  legalRetirementAge: 67,
  endAge: 67,
  currentAssets: 36000,
  annualSavings: 12000,
  annualSavingsGrowthRate: 0,
  averageROI: 0,
  roiVolatility: 0,
  averageInflation: 0,
  inflationVolatility: 0,
  simulationRuns: 3,
  monthlyPension: 0,
  cashFlows: [],
  customExpenses: [],
  oneTimeIncomes: [],
  legacyTargetReal: 0,
  glidePathEnabled: false,
}

it('searches every age, counts the last year, and prices one extra work year', () => {
  const result = compareRetirementAges(flat, { monthlyBudget: 1500, probability: 90, endAge: 67 })
  expect(result.earliestAge).toBe(66)
  expect(result.rows.map((r) => [r.age, r.successRate])).toEqual([
    [65, 0],
    [66, 100],
    [67, 100],
  ])
  expect(result.rows[1].extraYearGain).toBe(
    result.rows[1].monthlyLimit! - result.rows[0].monthlyLimit!
  )
  expect(result.rows[2].monthlyLimit).toBe(5050) // €60k, within engine's 1% funding tolerance
  expect(result.rows[0].extraYearGain).toBeNull()
})

it('replaces all ordinary expenses, keeps scheduled expenses and respects bequests', () => {
  const params: SimulationParams = {
    ...flat,
    currentAssets: 12000,
    legacyTargetReal: 5000,
    cashFlows: [
      {
        id: 'regular',
        name: 'Costs',
        kind: 'expense',
        frequency: 'monthly',
        amount: 50000,
        growthRate: 0.15,
        inflationLinked: false,
      },
      {
        id: 'repair',
        name: 'Repair',
        kind: 'expense',
        frequency: 'once',
        amount: 1000,
        startAge: 65,
      },
    ],
  }
  params.customExpenses = projectCustomExpenses(params.cashFlows)
  const result = compareRetirementAges(params, { monthlyBudget: 501, probability: 100, endAge: 65 })
  expect(result.rows).toEqual([{ age: 65, successRate: 0, monthlyLimit: 500, extraYearGain: null }])
  expect(result.earliestAge).toBeNull()
})

it('distinguishes an unaffordable bequest even at zero budget from a funded zero', () => {
  const result = compareRetirementAges(
    { ...flat, currentAssets: 0, legacyTargetReal: 1 },
    { monthlyBudget: 0, probability: 50, endAge: 65 }
  )
  expect(result.rows[0].monthlyLimit).toBeNull()
  expect(result.earliestAge).toBeNull()
  const zero = compareRetirementAges(
    { ...flat, currentAssets: 0 },
    { monthlyBudget: 0, probability: 50, endAge: 65 }
  )
  expect(zero.rows[0].monthlyLimit).toBe(0)
  expect(zero.earliestAge).toBe(65)
})

it.each(['historical', 'monteCarlo'] as const)(
  'matches the dashboard fixed-budget run on %s paths',
  (marketModel) => {
    const params = {
      ...DEFAULT_PARAMS,
      currentAge: 64,
      legalRetirementAge: 66,
      retirementAge: 66,
      endAge: 90,
      marketModel,
      simulationRuns: 30,
      glidePathEnabled: true,
      withdrawalStrategy: 'fixedReal' as const,
      customExpenses: [],
      cashFlows: [],
      oneTimeIncomes: [],
      monthlyPension: 0,
      currentAssets: 400000,
    }
    const budget = {
      name: 'Living costs',
      id: 'living',
      kind: 'expense' as const,
      frequency: 'monthly' as const,
      amount: 2000,
    }
    const result = compareRetirementAges(params, {
      maxRetirementAge: 66,
      monthlyBudget: 2000,
      probability: 80,
      endAge: 90,
    })
    for (const row of result.rows) {
      const reference = runMonteCarloSimulation({
        ...params,
        retirementAge: row.age,
        cashFlows: [budget],
        customExpenses: projectCustomExpenses([budget]),
      })
      expect(row.successRate).toBe(reference.successRate)
    }
  }
)

it('uses a shared capped prefix and reports every age against a fixed total', () => {
  const progress = jest.fn()
  const result = compareRetirementAges(
    { ...flat, simulationRuns: 2000 },
    { monthlyBudget: 100, probability: 90, endAge: 66 },
    progress
  )
  expect(result.paths).toBe(500)
  expect(progress.mock.calls).toEqual([
    [1, 2],
    [2, 2],
  ])
})

it.each([
  { monthlyBudget: -1, probability: 90, endAge: 67 },
  { monthlyBudget: 0, probability: 0, endAge: 67 },
  { monthlyBudget: 0, probability: 101, endAge: 67 },
  { monthlyBudget: 0, probability: 90, endAge: 64 },
  { monthlyBudget: 0, probability: 90, endAge: NaN },
])('rejects invalid targets %j', (targets) => {
  expect(() => compareRetirementAges(flat, targets)).toThrow(RangeError)
})

it('finds an age beyond the statutory and planned ages, or respects an earlier search limit', () => {
  const params = { ...flat, currentAssets: 0, retirementAge: 67, endAge: 72 }
  const targets = { monthlyBudget: 1000, probability: 90, endAge: 72 }
  expect(compareRetirementAges(params, targets).earliestAge).toBe(69)
  expect(compareRetirementAges(params, { ...targets, maxRetirementAge: 67 }).earliestAge).toBeNull()
})

it('uses the full final Monte Carlo budget but only distinct historical start years', () => {
  const targets = { monthlyBudget: 1000, probability: 90, endAge: 65, final: true }
  expect(compareRetirementAges(flat, targets).paths).toBe(5000)
  const historical: SimulationParams = { ...flat, marketModel: 'historical' }
  const quick = compareRetirementAges(historical, { ...targets, final: false })
  expect(compareRetirementAges(historical, targets)).toEqual(quick)
})

it('reports an exact 58 of 100 as meeting the 58% target', () => {
  const plan = {
    ...DEFAULT_PARAMS,
    currentAge: 65,
    retirementAge: 65,
    legalRetirementAge: 65,
    endAge: 65,
    currentAssets: 12000,
    annualSavings: 0,
    monthlyPension: 0,
    capitalGainsTax: 0,
    cashFlows: [],
    oneTimeIncomes: [],
    customExpenses: [],
    simulationRuns: 100,
  }
  const result = compareRetirementAges(plan, { monthlyBudget: 1063, probability: 58, endAge: 65 })
  expect(result.earliestAge).toBe(65)
  expect(result.rows[0].successRate).toBe(58)
})
