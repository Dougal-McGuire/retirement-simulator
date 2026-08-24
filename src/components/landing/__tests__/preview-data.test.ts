import { DEFAULT_PARAMS } from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import {
  APP_DEFAULT_RUNS,
  PREVIEW_AGES,
  PREVIEW_DEFAULT_RUNS_SUCCESS_RATE,
  PREVIEW_PLAN,
  PREVIEW_RUNS,
  PREVIEW_SERIES,
  PREVIEW_SUCCESS_RATE,
  PREVIEW_TERMINAL,
} from '../preview-data'

/**
 * The landing page quotes hard numbers ("94.6% stayed funded") that were baked
 * from the engine at build-authoring time. Nothing stops a later change to the
 * defaults or to the engine from turning those into marketing fiction — this
 * suite is that stop.
 *
 * The full bake is 5,000 runs; re-running that on every `pnpm test` is a waste,
 * so the guard runs a cheaper 1,000-run sample of the exact same seeded stream
 * and checks the baked values are within Monte Carlo sampling distance. A
 * genuine drift (new tax defaults, a changed withdrawal rule) moves the success
 * rate by whole points and trips the tolerance immediately.
 */
const GUARD_RUNS = 1000

describe('landing preview data', () => {
  const guard = runMonteCarloSimulation({ ...DEFAULT_PARAMS, simulationRuns: GUARD_RUNS })

  it('describes the plan the app actually ships', () => {
    expect(PREVIEW_PLAN.currentAge).toBe(DEFAULT_PARAMS.currentAge)
    expect(PREVIEW_PLAN.retirementAge).toBe(DEFAULT_PARAMS.retirementAge)
    expect(PREVIEW_PLAN.legalRetirementAge).toBe(DEFAULT_PARAMS.legalRetirementAge)
    expect(PREVIEW_PLAN.endAge).toBe(DEFAULT_PARAMS.endAge)
    expect(PREVIEW_PLAN.currentAssets).toBe(DEFAULT_PARAMS.currentAssets)
    expect(APP_DEFAULT_RUNS).toBe(DEFAULT_PARAMS.simulationRuns)
    expect(PREVIEW_AGES).toEqual(guard.ages)
  })

  it('quotes a success rate the engine still produces', () => {
    // 1.5pp covers the sampling spread between 1,000 and 5,000 runs; a real
    // regression in the defaults or the engine moves it much further.
    expect(Math.abs(PREVIEW_SUCCESS_RATE - guard.successRate)).toBeLessThan(1.5)
  })

  it('quotes the dashboard number a fresh default plan reports', () => {
    const dashboard = runMonteCarloSimulation({
      ...DEFAULT_PARAMS,
      simulationRuns: APP_DEFAULT_RUNS,
    })
    // This one is exact: same params, same run count, same seeded stream as a
    // visitor's first dashboard run.
    expect(PREVIEW_DEFAULT_RUNS_SUCCESS_RATE).toBeCloseTo(dashboard.successRate, 1)
  })

  it('charts percentile bands the engine still produces', () => {
    const keys = ['p10', 'p20', 'p50', 'p80', 'p90'] as const
    for (const key of keys) {
      expect(PREVIEW_SERIES[key]).toHaveLength(guard.ages.length)
      // Percentiles at 1,000 vs 5,000 runs differ by a few percent, not by an
      // order of magnitude. 20% catches "these numbers are from another plan".
      guard.assetPercentiles[key].forEach((expected, index) => {
        const baked = PREVIEW_SERIES[key][index]
        expect(Math.abs(baked - expected)).toBeLessThan(Math.max(expected * 0.2, 25000))
      })
    }
  })

  it('keeps the hero callouts equal to the terminal points of the charted bands', () => {
    const last = PREVIEW_AGES.length - 1
    expect(PREVIEW_TERMINAL.p10).toBe(PREVIEW_SERIES.p10[last])
    expect(PREVIEW_TERMINAL.p50).toBe(PREVIEW_SERIES.p50[last])
    expect(PREVIEW_TERMINAL.p90).toBe(PREVIEW_SERIES.p90[last])
  })

  it('bakes more paths than a visitor runs by default', () => {
    expect(PREVIEW_RUNS).toBeGreaterThan(APP_DEFAULT_RUNS)
  })
})
