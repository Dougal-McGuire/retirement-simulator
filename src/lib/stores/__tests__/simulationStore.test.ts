import { DEFAULT_PARAMS, type SimulationParams, type SimulationResults } from '@/types'

type StoreModule = typeof import('../simulationStore')

const STORE_KEY = 'retirement-simulator-store'

function createResults(params: SimulationParams): SimulationResults {
  return {
    ages: [params.currentAge],
    assetPercentiles: {
      p10: [100],
      p20: [200],
      p50: [300],
      p80: [400],
      p90: [500],
    },
    spendingPercentiles: {
      p10: [10],
      p20: [20],
      p50: [30],
      p80: [40],
      p90: [50],
    },
    successRate: 75,
    params,
  }
}

function createLocalStorageMock(initialState: Record<string, string> = {}) {
  let store = { ...initialState }

  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = String(value)
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key]
    }),
    clear: jest.fn(() => {
      store = {}
    }),
  }
}

async function flushSimulationQueue() {
  jest.advanceTimersByTime(100)
  await Promise.resolve()
  jest.advanceTimersByTime(0)
  await Promise.resolve()
}

function loadStore(initialStorage: Record<string, string> = {}) {
  jest.resetModules()

  const localStorageMock = createLocalStorageMock(initialStorage)
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

  let storeModule!: StoreModule

  jest.isolateModules(() => {
    storeModule = require('../simulationStore') as StoreModule
  })

  return {
    ...storeModule,
    localStorageMock,
  }
}

describe('simulationStore', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    jest.clearAllMocks()
    delete (globalThis as { localStorage?: Storage }).localStorage
    delete (globalThis as { window?: Window }).window
  })

  it('coalesces rapid parameter updates into one simulation with the latest params', async () => {
    const { useSimulationStore } = loadStore()
    const runSimulation = jest.fn(async () => {
      useSimulationStore.setState({
        results: createResults(useSimulationStore.getState().params),
        isLoading: false,
        error: null,
        pendingRun: false,
      })
    })
    useSimulationStore.setState({ runSimulation })

    useSimulationStore.getState().updateParams({ currentAge: 56 })
    useSimulationStore.getState().updateParams({ currentAge: 57 })
    useSimulationStore.getState().updateParams({ currentAge: 58 })

    await flushSimulationQueue()

    expect(runSimulation).toHaveBeenCalledTimes(1)
    expect(useSimulationStore.getState().results?.params.currentAge).toBe(58)
  })

  it('queues only one catch-up simulation while auto-run is suspended', async () => {
    const { useSimulationStore } = loadStore()
    const runSimulation = jest.fn(async () => {
      useSimulationStore.setState({
        results: createResults(useSimulationStore.getState().params),
        isLoading: false,
        error: null,
        pendingRun: false,
      })
    })
    useSimulationStore.setState({ runSimulation })

    useSimulationStore.getState().setAutoRunSuspended(true)
    useSimulationStore.getState().updateParams({ currentAge: 56 })
    useSimulationStore.getState().updateParams({ currentAge: 57 })

    jest.advanceTimersByTime(200)
    await Promise.resolve()

    expect(runSimulation).not.toHaveBeenCalled()
    expect(useSimulationStore.getState().pendingRun).toBe(true)

    useSimulationStore.getState().setAutoRunSuspended(false)
    await flushSimulationQueue()

    expect(runSimulation).toHaveBeenCalledTimes(1)
    expect(useSimulationStore.getState().pendingRun).toBe(false)
    expect(useSimulationStore.getState().results?.params.currentAge).toBe(57)
  })

  it('clears persisted results when their params no longer match the hydrated params', () => {
    const { useSimulationStore } = loadStore({
      [STORE_KEY]: JSON.stringify({
        state: {
          params: DEFAULT_PARAMS,
          results: createResults({ ...DEFAULT_PARAMS, currentAge: DEFAULT_PARAMS.currentAge + 1 }),
          savedSetups: [],
        },
        version: 0,
      }),
    })

    expect(useSimulationStore.getState().results).toBeNull()
  })

  it('runs one simulation when loading a saved setup', async () => {
    const { useSimulationStore } = loadStore()
    const runSimulation = jest.fn(async () => {
      useSimulationStore.setState({
        results: createResults(useSimulationStore.getState().params),
        isLoading: false,
        error: null,
        pendingRun: false,
      })
    })
    useSimulationStore.setState({ runSimulation })

    useSimulationStore.setState({
      savedSetups: [
        {
          id: 'saved-1',
          name: 'Saved setup',
          timestamp: Date.now(),
          params: {
            ...DEFAULT_PARAMS,
            currentAge: 59,
          },
        },
      ],
    })

    useSimulationStore.getState().loadSetup('saved-1')
    await flushSimulationQueue()

    expect(runSimulation).toHaveBeenCalledTimes(1)
    expect(useSimulationStore.getState().params.currentAge).toBe(59)
  })
})
