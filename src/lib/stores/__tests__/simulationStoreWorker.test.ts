import { DEFAULT_PARAMS, type SimulationParams, type SimulationResults } from '@/types'

/**
 * The run's hand-off to the worker. `runSimulation` must post the job before
 * it flags `isLoading`: that flag re-renders the loading state, and posting
 * after it made every edit wait for that render before the worker could start
 * (plus a `setTimeout(0)` it no longer needs). Part of the §7 budget.
 */

const calls: Array<{ params: SimulationParams; isLoadingAtPost: boolean }> = []
let resolveRun: ((results: SimulationResults) => void) | null = null

type StoreModule = typeof import('../simulationStore')
let store: StoreModule['useSimulationStore']

jest.mock('@/lib/simulation/workerClient', () => ({
  canUseWorker: () => true,
  runSimulationInClient: (params: SimulationParams) => {
    calls.push({ params, isLoadingAtPost: store.getState().isLoading })
    return new Promise<SimulationResults>((resolve) => {
      resolveRun = resolve
    })
  },
}))

const results = (params: SimulationParams): SimulationResults => ({
  ages: [params.currentAge],
  assetPercentiles: { p10: [1], p20: [2], p50: [3], p80: [4], p90: [5] },
  spendingPercentiles: { p10: [1], p20: [2], p50: [3], p80: [4], p90: [5] },
  successRate: 81,
  params,
})

beforeEach(() => {
  calls.length = 0
  resolveRun = null
  const storage = new Map<string, string>()
  const localStorageMock = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, String(value)),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => storage.clear(),
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: localStorageMock },
    configurable: true,
    writable: true,
  })
  jest.isolateModules(() => {
    store = (require('../simulationStore') as StoreModule).useSimulationStore
  })
})

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage
  delete (globalThis as { window?: Window }).window
})

describe('runSimulation → worker', () => {
  it('posts the job synchronously, before the loading state is set', () => {
    void store.getState().runSimulation()

    expect(calls).toHaveLength(1)
    expect(calls[0].isLoadingAtPost).toBe(false)
    expect(calls[0].params).toBe(store.getState().params)
    expect(store.getState().isLoading).toBe(true)
  })

  it('stores the worker result and clears the loading state', async () => {
    const run = store.getState().runSimulation()
    resolveRun?.(results(store.getState().params))
    await run

    expect(store.getState().isLoading).toBe(false)
    expect(store.getState().results?.successRate).toBe(81)
    expect(store.getState().planSuccessRates[store.getState().activePlanId]).toBe(81)
  })

  it('discards a result that no longer matches the draft and runs again', async () => {
    jest.useFakeTimers()
    try {
      const run = store.getState().runSimulation()
      const requested = store.getState().params
      store.setState({ params: { ...DEFAULT_PARAMS, endAge: DEFAULT_PARAMS.endAge + 1 } })
      resolveRun?.(results(requested))
      await run

      expect(store.getState().results).toBeNull()
      jest.advanceTimersByTime(0)
      expect(calls).toHaveLength(2)
      expect(calls[1].params.endAge).toBe(DEFAULT_PARAMS.endAge + 1)
    } finally {
      jest.useRealTimers()
    }
  })
})
