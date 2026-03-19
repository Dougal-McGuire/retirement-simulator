import { DEFAULT_PARAMS, type SimulationResults } from '@/types'

type TransformerModule = typeof import('../reportDataTransformer')

function createResults(successRate: number): SimulationResults {
  return {
    ages: [DEFAULT_PARAMS.currentAge],
    assetPercentiles: {
      p10: [100_000],
      p20: [125_000],
      p50: [150_000],
      p80: [200_000],
      p90: [250_000],
    },
    spendingPercentiles: {
      p10: [2_000],
      p20: [2_200],
      p50: [2_500],
      p80: [2_800],
      p90: [3_000],
    },
    successRate,
    params: { ...DEFAULT_PARAMS },
  }
}

describe('reportDataTransformer behavior', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('does not run extra simulations while building recommendation uplift details', () => {
    const runMonteCarloSimulation = jest.fn()

    jest.doMock('@/lib/simulation/engine', () => ({
      runMonteCarloSimulation,
    }))

    let transformerModule!: TransformerModule
    jest.isolateModules(() => {
      transformerModule = require('../reportDataTransformer') as TransformerModule
    })

    const params = {
      ...DEFAULT_PARAMS,
      annualSavings: 24_000,
      simulationRuns: 800,
    }
    const reportData = transformerModule.transformToReportData(params, createResults(60))

    expect(runMonteCarloSimulation).not.toHaveBeenCalled()
    expect(reportData.summary?.topActionsDetailed.length).toBeGreaterThan(0)
  })
})
