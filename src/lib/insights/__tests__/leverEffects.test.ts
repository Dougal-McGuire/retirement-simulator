import { DEFAULT_PARAMS, type SimulationParams, type SimulationResults } from '@/types'
import { applyCashFlows } from '@/lib/simulation/cashFlows'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { buildScenarioParams } from '@/lib/simulation/planInsights'
import {
  cachedLeverEffects,
  clearLeverEffectsCache,
  measureLeverEffects,
} from '../leverEffects'

/**
 * The report's lever figures are measurements: the same three scenarios the
 * workspace runs, on the same paths, at the same run count. (They replace a
 * formula that printed "+13–17 pp" where the simulation measured +2.5.)
 */
const params = applyCashFlows({ ...DEFAULT_PARAMS, simulationRuns: 150 })
const base = runMonteCarloSimulation(params)
const engine = async (scenario: SimulationParams) => runMonteCarloSimulation(scenario)

beforeEach(() => clearLeverEffectsCache())

describe('measureLeverEffects', () => {
  it('runs exactly the workspace’s three scenarios at the plan’s own run count', async () => {
    const seen: SimulationParams[] = []
    await measureLeverEffects(base, async (scenario) => {
      seen.push(scenario)
      return runMonteCarloSimulation(scenario)
    })
    const scenarios = buildScenarioParams(base.params)
    expect(seen).toHaveLength(3)
    expect(seen).toEqual(scenarios.map((scenario) => scenario.params))
    for (const scenario of seen) expect(scenario.simulationRuns).toBe(params.simulationRuns)
  })

  it('reports each lever as its simulated success rate against the base result', async () => {
    const effects = await measureLeverEffects(base, engine)
    expect(effects.baseSuccessRate).toBe(base.successRate)
    expect(effects.levers.map((lever) => lever.id)).toEqual([
      'laterRetirement',
      'moreSavings',
      'lowerSpending',
    ])
    for (const scenario of buildScenarioParams(base.params)) {
      // Common random numbers: re-running the scenario gives the same paths.
      const rerun = runMonteCarloSimulation(scenario.params)
      const lever = effects.levers.find((entry) => entry.id === scenario.id)!
      expect(lever.successRate).toBe(rerun.successRate)
      expect(lever.delta).toBe(rerun.successRate - base.successRate)
      expect(lever.worstDecileEnd).toBe(rerun.assetPercentiles.p10.at(-1))
      expect(lever.worstDecileEndReal).toBe(rerun.assetPercentilesReal!.p10.at(-1))
    }
    expect(effects.baseWorstDecileEnd).toBe(base.assetPercentiles.p10.at(-1))
  })

  it('measures once per plan: a second report of the same plan runs nothing', async () => {
    const run = jest.fn(engine)
    const first = await measureLeverEffects(base, run)
    expect(run).toHaveBeenCalledTimes(3)
    const second = await measureLeverEffects(base, run)
    expect(run).toHaveBeenCalledTimes(3)
    expect(second).toBe(first)
    expect(cachedLeverEffects(base.params)).toBe(first)

    // Another plan is another measurement.
    const other = applyCashFlows({ ...params, annualSavings: params.annualSavings + 1000 })
    expect(cachedLeverEffects(other)).toBeNull()
  })

  it('fails as a whole — and caches nothing — when one scenario cannot be simulated', async () => {
    let calls = 0
    const flaky = async (scenario: SimulationParams): Promise<SimulationResults> => {
      calls += 1
      if (calls === 2) throw new Error('worker died')
      return runMonteCarloSimulation(scenario)
    }
    await expect(measureLeverEffects(base, flaky)).rejects.toThrow('worker died')
    expect(cachedLeverEffects(base.params)).toBeNull()
    // The next attempt starts over and succeeds.
    await expect(measureLeverEffects(base, engine)).resolves.toMatchObject({
      baseSuccessRate: base.successRate,
    })
  })
})
