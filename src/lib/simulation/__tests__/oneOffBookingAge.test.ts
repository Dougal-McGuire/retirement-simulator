import { DEFAULT_PARAMS } from '@/types'
import { normalizePersistedParams } from '@/lib/stores/normalizeParams'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { buildFlowTracks } from '@/lib/simulation/flowBreakdown'

const plan = {
  ...DEFAULT_PARAMS,
  currentAge: 60,
  retirementAge: 60,
  endAge: 62,
  currentAssets: 0,
  annualSavings: 0,
  monthlyPension: 0,
  averageROI: 0,
  roiVolatility: 0,
  averageInflation: 0,
  inflationVolatility: 0,
  simulationRuns: 1,
  withdrawalStrategy: 'fixedReal' as const,
  cashFlows: [],
  customExpenses: [{ id: 'living', name: 'Budget', amount: 100, interval: 'annual' as const }],
  oneTimeIncomes: [
    { name: 'First', age: 60, amount: 100 },
    { name: 'Last', age: 62, amount: 200 },
  ],
}

it('makes new one-off income spendable in the entered year, including both horizon boundaries', () => {
  const result = runMonteCarloSimulation(normalizePersistedParams(JSON.parse(JSON.stringify(plan))))
  const rows = result.cashFlowMeans!
  expect(rows.map((row) => row.oneOffIncomeGross)).toEqual([100, 0, 200])
  expect(rows.map((row) => row.shortfall)).toEqual([0, 100, 0])
  expect(buildFlowTracks(result.params).tracks.find((t) => t.flow.name === 'First')?.gross)
    .toEqual([100, 0, 0])
})

it('retains the effective years and final closing credit on repeated loads of a legacy setup', () => {
  const oldSetup = Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'oneOffIncomeTiming'))
  const restored = normalizePersistedParams(normalizePersistedParams(oldSetup))
  const rows = runMonteCarloSimulation(restored).cashFlowMeans!
  expect(rows.map((row) => row.oneOffIncomeGross)).toEqual([0, 100, 200])
  expect(rows.map((row) => row.shortfall)).toEqual([100, 0, 100])
})
