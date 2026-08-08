import { buildSimulationContext } from '@/lib/simulation/context'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import {
  buildScenarioBaselineParams,
  buildScenarioParams,
  scenarioPreviewRuns,
} from '@/lib/simulation/planInsights'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { ReportDataSchema } from '@/lib/pdf-generator/schema/reportData'
import { DEFAULT_PARAMS, type SimulationParams } from '@/types'

/**
 * One plan, one success rate. The round-4 defect was four surfaces each
 * computing their own — a 95.2% hero above a 94.4% lever baseline above a
 * comparison row that disagreed with both, and a PDF quoting "472 / 500".
 *
 * The comparison clamps a plan's run count to at most COMPARISON_RUNS; below
 * that ceiling (the default 500 is) it runs the plan exactly as the dashboard
 * did, which is what these cases pin down.
 */
const COMPARISON_RUNS = 1200

const cases: Array<{ name: string; params: SimulationParams }> = [
  { name: 'monte carlo', params: { ...DEFAULT_PARAMS, simulationRuns: 200 } },
  {
    name: 'monte carlo with a legacy goal',
    params: { ...DEFAULT_PARAMS, simulationRuns: 200, legacyTargetReal: 400_000 },
  },
  {
    name: 'historical backtest',
    params: { ...DEFAULT_PARAMS, marketModel: 'historical', simulationRuns: 200 },
  },
  {
    name: 'historical backtest with a legacy goal',
    params: {
      ...DEFAULT_PARAMS,
      marketModel: 'historical',
      simulationRuns: 200,
      legacyTargetReal: 400_000,
    },
  },
]

describe.each(cases)('one plan, one number ($name)', ({ params }) => {
  const results = runMonteCarloSimulation(params)
  const context = buildSimulationContext(params, results)

  it('the stress levers run at the hero’s run count', () => {
    expect(scenarioPreviewRuns(params)).toBe(params.simulationRuns)
    for (const scenario of buildScenarioParams(params)) {
      expect(scenario.params.simulationRuns).toBe(params.simulationRuns)
    }
  })

  it('the lever baseline is bit-identical to the hero result', () => {
    // The panel now reads the hero's number instead of re-measuring one. This
    // asserts the property that makes that legitimate: re-running the unchanged
    // plan at the levers' count reproduces the dashboard result exactly.
    const baseline = runMonteCarloSimulation(buildScenarioBaselineParams(params))
    expect(baseline.successRate).toBe(results.successRate)
    expect(baseline.assetPercentiles.p10).toEqual(results.assetPercentiles.p10)
  })

  it('the comparison row reports the hero’s success rate for the same plan', () => {
    const requested = Math.min(params.simulationRuns, COMPARISON_RUNS)
    const compared = runMonteCarloSimulation({ ...params, simulationRuns: requested })
    expect(compared.successRate).toBe(context.successRate)
  })

  it('the PDF prints the hero’s success rate, definition and path count', () => {
    const data = ReportDataSchema.parse({
      ...transformToReportData(params, results, 'Base plan'),
      locale: 'en',
    })
    const content = mapReportDataToContent(data)

    expect(content.simulation.successRate * 100).toBeCloseTo(context.successRate, 9)
    expect(content.simulation.effectiveRuns).toBe(context.effectiveRuns)
    expect(content.simulation.successDefinition).toBe(context.successDefinition)
    expect(content.simulation.marketModel).toBe(context.marketModel)
    expect(content.simulation.successCount).toBe(context.successCount)
    expect(content.profile.success.trials).toBe(context.effectiveRuns)
    expect(content.profile.success.successCount).toBe(context.successCount)
    // A count out of a run total the engine never ran is the fabrication the
    // report used to print; the count must sit inside the real path count.
    expect(content.profile.success.successCount).toBeLessThanOrEqual(context.effectiveRuns)
  })
})
