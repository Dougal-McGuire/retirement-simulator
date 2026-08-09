import { runMonteCarloSimulation } from '../engine'
import { DEFAULT_PARAMS, type SimulationParams } from '@/types'

/**
 * The bequest goal: a run only succeeds when it never depletes *and* its real
 * terminal assets clear `legacyTargetReal`.
 *
 * Every assertion here is about the relationship between the two rates, not
 * about a specific number, so the suite stays meaningful if the defaults move.
 */

const withTarget = (legacyTargetReal: number): SimulationParams => ({
  ...DEFAULT_PARAMS,
  // Smaller sample: these are ordering properties, not a golden master.
  simulationRuns: 300,
  legacyTargetReal,
})

const run = (target: number) => runMonteCarloSimulation(withTarget(target))

describe('legacy / bequest goal', () => {
  it('is a no-op at zero: the headline rate is plain survival', () => {
    const none = run(0)
    const legacyFree = runMonteCarloSimulation({
      ...withTarget(0),
      // Explicitly absent rather than zero — an older persisted plan.
      legacyTargetReal: undefined as unknown as number,
    })

    expect(none.successRate).toBe(none.depletionSuccessRate)
    expect(legacyFree.successRate).toBe(none.successRate)
  })

  it('never scores above plain survival', () => {
    for (const target of [0, 100_000, 500_000, 2_000_000]) {
      const results = run(target)
      expect(results.depletionSuccessRate).toBeGreaterThanOrEqual(results.successRate)
    }
  })

  it('leaves the depletion rate untouched as the target rises', () => {
    // Raising a bequest goal must not make the money run out sooner: the goal
    // is scoring, not behaviour. (Spending is unchanged; only the bar moves.)
    const baseline = run(0).depletionSuccessRate
    expect(run(500_000).depletionSuccessRate).toBe(baseline)
    expect(run(5_000_000).depletionSuccessRate).toBe(baseline)
  })

  it('is monotonically non-increasing in the target', () => {
    const targets = [0, 250_000, 500_000, 1_000_000, 2_000_000, 4_000_000]
    const rates = targets.map((target) => run(target).successRate)

    rates.forEach((rate, index) => {
      if (index === 0) return
      expect(rate).toBeLessThanOrEqual(rates[index - 1])
    })
    // ...and it actually bites somewhere in that range.
    expect(rates.at(-1)).toBeLessThan(rates[0])
  })

  it('collapses to near zero once the target clears the P90 real terminal', () => {
    const baseline = run(0)
    const p90Terminal = baseline.assetPercentilesReal?.p90.at(-1) ?? 0
    expect(p90Terminal).toBeGreaterThan(0)

    const results = run(p90Terminal * 2)
    expect(results.successRate).toBeLessThan(5)
    // Survival itself is unaffected — the money still lasts.
    expect(results.depletionSuccessRate).toBe(baseline.depletionSuccessRate)
  })

  it('scores the goal against the real series, not the nominal one', () => {
    const baseline = run(0)
    const medianReal = baseline.assetPercentilesReal?.p50.at(-1) ?? 0
    const medianNominal = baseline.assetPercentiles.p50.at(-1) ?? 0
    // Inflation makes the nominal terminal far larger than the real one, so a
    // target between them is met by roughly half the runs in real terms and by
    // nearly all of them if the engine were (wrongly) reading nominal assets.
    expect(medianNominal).toBeGreaterThan(medianReal)

    const atMedianReal = run(medianReal).successRate
    expect(atMedianReal).toBeLessThan(baseline.successRate)
    // Half the surviving runs sit above their own real median, give or take the
    // ones that failed outright.
    expect(atMedianReal).toBeGreaterThan(30)
    expect(atMedianReal).toBeLessThan(70)
  })
})
