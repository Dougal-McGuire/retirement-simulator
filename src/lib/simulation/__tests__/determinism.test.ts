/**
 * Determinism regression suite.
 *
 * The engine having a seeded RNG is not enough on its own: the dashboard runs
 * simulations through a Web Worker, the comparison panel and the stress levers
 * run them again with their own parameter tweaks, and the store persists
 * results between reloads. This suite walks those real paths and pins the
 * invariant the UI depends on:
 *
 *   identical parameters => bit-identical results, on every surface, forever.
 */
import type { SimulationParams, SimulationResults } from '@/types'
import { DEFAULT_PARAMS } from '@/types'
import {
  createMonteCarloSampler,
  lognormalParamsFromArithmetic,
  runMonteCarloSimulation,
  type MarketSampler,
} from '@/lib/simulation/engine'
import { runSimulationInClient } from '@/lib/simulation/workerClient'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'

const PLAN: SimulationParams = {
  ...DEFAULT_PARAMS,
  simulationRuns: 300,
  customExpenses: [
    { id: 'a', name: 'Living', amount: 4200, interval: 'monthly' },
    { id: 'b', name: 'Travel', amount: 9000, interval: 'annual' },
  ],
  oneTimeIncomes: [{ name: 'Inheritance', age: 70, amount: 120000 }],
}

const fingerprint = (results: SimulationResults) =>
  JSON.stringify({
    successRate: results.successRate,
    assets: results.assetPercentiles,
    spending: results.spendingPercentiles,
    assetsReal: results.assetPercentilesReal,
    spendingReal: results.spendingPercentilesReal,
    depletion: results.depletionByAge,
  })

describe('simulation determinism', () => {
  it('returns bit-identical results for repeated calls on structurally equal params', () => {
    const baseline = runMonteCarloSimulation(PLAN)

    for (let attempt = 0; attempt < 5; attempt++) {
      const repeat = runMonteCarloSimulation(JSON.parse(JSON.stringify(PLAN)))
      expect(fingerprint(repeat)).toBe(fingerprint(baseline))
    }
  })

  it('is unaffected by the key order of the params object', () => {
    const shuffled = Object.fromEntries(
      Object.entries(PLAN).sort(([a], [b]) => b.localeCompare(a))
    ) as unknown as SimulationParams

    expect(fingerprint(runMonteCarloSimulation(shuffled))).toBe(
      fingerprint(runMonteCarloSimulation(PLAN))
    )
  })

  describe('the worker path the dashboard actually uses', () => {
    // The dashboard never calls the engine directly in the browser: it posts to
    // `simulation.worker.ts`, which registers a `message` listener on `self`.
    // Standing up a minimal worker global and driving that module proves the
    // worker does not take a different (unseeded) route into the engine.
    type WorkerMessage = { ok: boolean; results: SimulationResults; error?: string }

    const withWorkerGlobal = async (
      body: (ask: (params: SimulationParams, id: number) => void, posted: WorkerMessage[]) => void
    ) => {
      const posted: WorkerMessage[] = []
      const listeners: ((event: { data: unknown }) => void)[] = []
      const globals = globalThis as Record<string, unknown>
      const previousSelf = globals.self

      globals.self = {
        addEventListener: (type: string, listener: (event: { data: unknown }) => void) => {
          if (type === 'message') listeners.push(listener)
        },
        postMessage: (message: WorkerMessage) => posted.push(message),
      }

      try {
        jest.resetModules()
        await import('@/lib/simulation/simulation.worker')
        body((params, id) => listeners.forEach((listener) => listener({ data: { id, params } })), posted)
      } finally {
        globals.self = previousSelf
        jest.resetModules()
      }
    }

    it('answers identical requests with identical results', async () => {
      await withWorkerGlobal((ask, posted) => {
        ask(PLAN, 1)
        ask(JSON.parse(JSON.stringify(PLAN)), 2)

        expect(posted).toHaveLength(2)
        const [first, second] = posted
        expect(first.ok).toBe(true)
        expect(second.ok).toBe(true)
        expect(fingerprint(second.results)).toBe(fingerprint(first.results))
        // ...and matches what the main thread would have computed.
        expect(fingerprint(first.results)).toBe(fingerprint(runMonteCarloSimulation(PLAN)))
      })
    })
  })

  it('agrees between the worker client and a direct engine call', async () => {
    const viaClient = await runSimulationInClient(PLAN)
    expect(fingerprint(viaClient)).toBe(fingerprint(runMonteCarloSimulation(PLAN)))
  })

  it('produces the same numbers for the dashboard, a re-run and the PDF transformer', () => {
    const dashboard = runMonteCarloSimulation(PLAN)
    const rerun = runMonteCarloSimulation(dashboard.params)

    expect(fingerprint(rerun)).toBe(fingerprint(dashboard))

    // The PDF is generated from whatever results the dashboard is showing, so
    // the health score and the milestone table must not move either.
    const report = transformToReportData(PLAN, dashboard)
    const reportFromRerun = transformToReportData(PLAN, rerun)
    expect(reportFromRerun.projections).toEqual(report.projections)
    expect(reportFromRerun.summary?.planHealthScore).toBe(report.summary?.planHealthScore)
    expect(reportFromRerun.summary?.successProbabilityPct).toBe(
      report.summary?.successProbabilityPct
    )
    expect(report.summary?.planHealthScore).toEqual(expect.any(Number))
  })

  it('feeding engine-normalized params back in is a fixed point', () => {
    // The store persists `results.params` (already normalized) and compares it
    // against the live params. If normalization were not idempotent, every
    // reload would look like a parameter change and re-roll the simulation.
    const once = runMonteCarloSimulation(PLAN)
    const twice = runMonteCarloSimulation(once.params)
    expect(twice.params).toEqual(once.params)
    expect(fingerprint(twice)).toBe(fingerprint(once))
  })

  describe('scenario set stability (common random numbers)', () => {
    // A plan with no savings, no expenses and no pension is pure compounding:
    // assets(t) = currentAssets * product(growth factors). If the market paths
    // are reused across parameter changes, doubling the starting capital must
    // scale every percentile by exactly two.
    const pureGrowth: SimulationParams = {
      ...DEFAULT_PARAMS,
      simulationRuns: 40,
      currentAge: 40,
      retirementAge: 70,
      legalRetirementAge: 70,
      endAge: 70,
      annualSavings: 0,
      annualSavingsGrowthRate: 0,
      monthlyPension: 0,
      customExpenses: [],
      oneTimeIncomes: [],
    }

    it('reuses the same market paths when an unrelated parameter changes', () => {
      const base = runMonteCarloSimulation(pureGrowth)
      const doubled = runMonteCarloSimulation({ ...pureGrowth, currentAssets: 2_000_000 })
      const single = runMonteCarloSimulation({ ...pureGrowth, currentAssets: 1_000_000 })

      doubled.assetPercentiles.p50.forEach((value, index) => {
        expect(value).toBeCloseTo(single.assetPercentiles.p50[index] * 2, 6)
      })
      expect(base.ages).toEqual(doubled.ages)
    })

    it('keeps run k on the same market path regardless of how many runs are requested', () => {
      // Recorded through the sampler seam: a 1 200-run comparison must be a
      // strict prefix of a 5 000-run dashboard sample, not an unrelated re-roll.
      const record = (runs: number) => {
        const flat = lognormalParamsFromArithmetic(
          pureGrowth.averageROI,
          pureGrowth.roiVolatility
        )
        const inflation = lognormalParamsFromArithmetic(
          pureGrowth.averageInflation,
          pureGrowth.inflationVolatility
        )
        const years = pureGrowth.endAge - pureGrowth.currentAge + 1
        const inner = createMonteCarloSampler({
          roi: Array.from({ length: years }, () => flat),
          inflation: Array.from({ length: years }, () => inflation),
        })
        const seen = new Map<string, number>()
        const sampler: MarketSampler = {
          nextGrowthFactor: (yearIndex, run, random) => {
            const value = inner.nextGrowthFactor(yearIndex, run, random)
            seen.set(`growth:${run}:${yearIndex}`, value)
            return value
          },
          nextInflationFactor: (yearIndex, run, random) => {
            const value = inner.nextInflationFactor(yearIndex, run, random)
            seen.set(`inflation:${run}:${yearIndex}`, value)
            return value
          },
        }
        runMonteCarloSimulation({ ...pureGrowth, simulationRuns: runs }, { sampler })
        return seen
      }

      const few = record(3)
      const many = record(12)

      expect(few.size).toBeGreaterThan(0)
      few.forEach((value, key) => {
        expect(many.get(key)).toBe(value)
      })
    })
  })
})
