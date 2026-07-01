import { DEFAULT_PARAMS, type SimulationParams, type SimulationResults } from '@/types'

type StoreModule = typeof import('../simulationStore')

const STORE_KEY = 'retirement-simulator-store'
const STORAGE_KEY = 'retirement-simulator-params'
const SAVED_SETUPS_KEY = 'retirement-simulator-saved-setups'

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

  it('sanitizes invalid scalar params when hydrating persisted params', () => {
    const { useSimulationStore } = loadStore({
      [STORE_KEY]: JSON.stringify({
        state: {
          params: {
            ...DEFAULT_PARAMS,
            currentAge: 'bad',
            retirementAge: '61',
            currentAssets: null,
            annualSavingsGrowthRate: '',
            monthlyPension: false,
            averageROI: '0.09',
            withdrawalStrategy: 'invalid',
            dsWithdrawalRate: '0.06',
            dsCeilingRate: '',
            dsFloorRate: false,
          },
          results: null,
          savedSetups: [],
        },
        version: 0,
      }),
    })

    const { params } = useSimulationStore.getState()
    expect(params.currentAge).toBe(DEFAULT_PARAMS.currentAge)
    expect(params.retirementAge).toBe(61)
    expect(params.currentAssets).toBe(DEFAULT_PARAMS.currentAssets)
    expect(params.annualSavingsGrowthRate).toBe(DEFAULT_PARAMS.annualSavingsGrowthRate)
    expect(params.monthlyPension).toBe(DEFAULT_PARAMS.monthlyPension)
    expect(params.averageROI).toBe(0.09)
    expect(params.withdrawalStrategy).toBe(DEFAULT_PARAMS.withdrawalStrategy)
    expect(params.dsWithdrawalRate).toBe(0.06)
    expect(params.dsCeilingRate).toBe(DEFAULT_PARAMS.dsCeilingRate)
    expect(params.dsFloorRate).toBe(DEFAULT_PARAMS.dsFloorRate)
  })

  it('adds Vanguard DS defaults when hydrating legacy persisted params', () => {
    const {
      dsCeilingRate: _dsCeilingRate,
      dsFloorRate: _dsFloorRate,
      dsWithdrawalRate: _dsWithdrawalRate,
      withdrawalStrategy: _withdrawalStrategy,
      ...legacyParams
    } = DEFAULT_PARAMS
    const { useSimulationStore } = loadStore({
      [STORE_KEY]: JSON.stringify({
        state: {
          params: legacyParams,
          results: null,
          savedSetups: [],
        },
        version: 0,
      }),
    })

    const { params } = useSimulationStore.getState()
    expect(params.withdrawalStrategy).toBe('vanguardDynamic')
    expect(params.dsWithdrawalRate).toBe(DEFAULT_PARAMS.dsWithdrawalRate)
    expect(params.dsCeilingRate).toBe(DEFAULT_PARAMS.dsCeilingRate)
    expect(params.dsFloorRate).toBe(DEFAULT_PARAMS.dsFloorRate)
  })

  it('migrates legacy expenses when hydrating persisted params', () => {
    const { customExpenses: _customExpenses, ...legacyParams } = DEFAULT_PARAMS
    const { useSimulationStore } = loadStore({
      [STORE_KEY]: JSON.stringify({
        state: {
          params: {
            ...legacyParams,
            monthlyExpenses: {
              food: 725,
              health: 0,
            },
            annualExpenses: {
              repairs: 3400,
              vacations: 'skip-invalid',
            },
          },
          results: null,
          savedSetups: [],
        },
        version: 0,
      }),
    })

    expect(useSimulationStore.getState().params.customExpenses).toEqual([
      {
        id: 'migrated-monthly-food',
        name: 'Groceries',
        amount: 725,
        interval: 'monthly',
      },
      {
        id: 'migrated-annual-repairs',
        name: 'Home Repairs',
        amount: 3400,
        interval: 'annual',
      },
    ])
  })

  it('preserves current custom expenses when hydrating persisted params', () => {
    const currentExpense = {
      id: 'current-rent',
      name: 'Rent',
      amount: 2500,
      interval: 'monthly' as const,
    }
    const { useSimulationStore } = loadStore({
      [STORE_KEY]: JSON.stringify({
        state: {
          params: {
            ...DEFAULT_PARAMS,
            customExpenses: [currentExpense],
          },
          results: null,
          savedSetups: [],
        },
        version: 0,
      }),
    })

    expect(useSimulationStore.getState().params.customExpenses).toEqual([currentExpense])
  })

  it('preserves empty current custom expenses instead of reviving stale legacy expenses', () => {
    const { useSimulationStore } = loadStore({
      [STORE_KEY]: JSON.stringify({
        state: {
          params: {
            ...DEFAULT_PARAMS,
            customExpenses: [],
            monthlyExpenses: {
              food: 725,
            },
            annualExpenses: {
              repairs: 3400,
            },
          },
          results: null,
          savedSetups: [],
        },
        version: 0,
      }),
    })

    expect(useSimulationStore.getState().params.customExpenses).toEqual([])
  })

  it('drops malformed saved setup storage while normalizing recovered setup params', () => {
    const { useSimulationStore } = loadStore({
      [SAVED_SETUPS_KEY]: JSON.stringify([
        {
          id: 'saved-valid',
          name: 'Recovered setup',
          timestamp: 1710000000000,
          params: {
            ...DEFAULT_PARAMS,
            currentAge: '62',
            currentAssets: 'invalid',
            withdrawalStrategy: 'fixedReal',
          },
        },
        {
          id: '',
          name: 'Missing id',
          timestamp: 1710000000001,
          params: DEFAULT_PARAMS,
        },
        {
          id: 'missing-timestamp',
          name: 'Missing timestamp',
          params: DEFAULT_PARAMS,
        },
        'not-a-setup',
      ]),
    })

    expect(useSimulationStore.getState().savedSetups).toEqual([
      {
        id: 'saved-valid',
        name: 'Recovered setup',
        timestamp: 1710000000000,
        params: {
          ...DEFAULT_PARAMS,
          currentAge: 62,
          currentAssets: DEFAULT_PARAMS.currentAssets,
          withdrawalStrategy: 'fixedReal',
        },
      },
    ])
  })

  it('drops malformed saved setups from the main persisted store', () => {
    const { useSimulationStore } = loadStore({
      [STORE_KEY]: JSON.stringify({
        state: {
          params: DEFAULT_PARAMS,
          results: null,
          savedSetups: [
            {
              id: 'persisted-valid',
              name: 'Persisted setup',
              timestamp: 1710000000002,
              params: {
                ...DEFAULT_PARAMS,
                currentAge: '61',
                simulationRuns: '1200',
              },
            },
            {
              id: '',
              name: 'Missing id',
              timestamp: 1710000000003,
              params: DEFAULT_PARAMS,
            },
            null,
          ],
        },
        version: 0,
      }),
    })

    expect(useSimulationStore.getState().savedSetups).toEqual([
      {
        id: 'persisted-valid',
        name: 'Persisted setup',
        timestamp: 1710000000002,
        params: {
          ...DEFAULT_PARAMS,
          currentAge: 61,
          simulationRuns: 1200,
        },
      },
    ])
  })

  it('sanitizes invalid scalar params when loading params from storage', () => {
    const { useSimulationStore } = loadStore({
      [STORAGE_KEY]: JSON.stringify({
        ...DEFAULT_PARAMS,
        currentAge: 'invalid',
        legalRetirementAge: '68',
        endAge: null,
        simulationRuns: '750',
        withdrawalStrategy: 'fixedReal',
        dsWithdrawalRate: '0.055',
      }),
    })
    const runSimulation = jest.fn(async () => {})
    useSimulationStore.setState({ runSimulation })

    useSimulationStore.getState().loadFromStorage()

    const { params } = useSimulationStore.getState()
    expect(runSimulation).toHaveBeenCalledTimes(1)
    expect(params.currentAge).toBe(DEFAULT_PARAMS.currentAge)
    expect(params.legalRetirementAge).toBe(68)
    expect(params.endAge).toBe(DEFAULT_PARAMS.endAge)
    expect(params.simulationRuns).toBe(750)
    expect(params.withdrawalStrategy).toBe('fixedReal')
    expect(params.dsWithdrawalRate).toBe(0.055)
  })

  it('migrates legacy expenses when loading params from storage', () => {
    const { customExpenses: _customExpenses, ...legacyParams } = DEFAULT_PARAMS
    const { useSimulationStore } = loadStore({
      [STORAGE_KEY]: JSON.stringify({
        ...legacyParams,
        monthlyExpenses: {
          utilities: 410,
        },
        annualExpenses: {
          carMaintenance: 1600,
        },
      }),
    })
    const runSimulation = jest.fn(async () => {})
    useSimulationStore.setState({ runSimulation })

    useSimulationStore.getState().loadFromStorage()

    expect(runSimulation).toHaveBeenCalledTimes(1)
    expect(useSimulationStore.getState().params.customExpenses).toEqual([
      {
        id: 'migrated-monthly-utilities',
        name: 'Utilities',
        amount: 410,
        interval: 'monthly',
      },
      {
        id: 'migrated-annual-carMaintenance',
        name: 'Car Maintenance',
        amount: 1600,
        interval: 'annual',
      },
    ])
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
            customExpenses: [
              {
                id: 'saved-current-expense',
                name: 'Saved expense',
                amount: 1200,
                interval: 'annual',
              },
            ],
          },
        },
      ],
    })

    useSimulationStore.getState().loadSetup('saved-1')
    await flushSimulationQueue()

    expect(runSimulation).toHaveBeenCalledTimes(1)
    expect(useSimulationStore.getState().params.currentAge).toBe(59)
    expect(useSimulationStore.getState().params.customExpenses).toEqual([
      {
        id: 'saved-current-expense',
        name: 'Saved expense',
        amount: 1200,
        interval: 'annual',
      },
    ])
  })
})
