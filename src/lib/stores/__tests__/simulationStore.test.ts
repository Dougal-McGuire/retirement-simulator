import { DEFAULT_PARAMS, MAX_PLANS, type SimulationParams, type SimulationResults } from '@/types'

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

    // Saved setups are imported as plans; `savedSetups` is now a mirror of them.
    const { plans, savedSetups } = useSimulationStore.getState()

    expect(plans.map((plan) => plan.id)).toEqual(['plan-base', 'saved-valid'])
    expect(plans[1]).toMatchObject({
      id: 'saved-valid',
      name: 'Recovered setup',
      updatedAt: 1710000000000,
      params: {
        ...DEFAULT_PARAMS,
        currentAge: 62,
        currentAssets: DEFAULT_PARAMS.currentAssets,
        withdrawalStrategy: 'fixedReal',
      },
    })
    expect(savedSetups).toEqual(
      plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        timestamp: plan.updatedAt,
        params: plan.params,
      }))
    )
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

    const { plans } = useSimulationStore.getState()

    expect(plans.map((plan) => plan.id)).toEqual(['plan-base', 'persisted-valid'])
    expect(plans[1]).toMatchObject({
      name: 'Persisted setup',
      updatedAt: 1710000000002,
      params: {
        ...DEFAULT_PARAMS,
        currentAge: 61,
        simulationRuns: 1200,
      },
    })
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

  describe('plans', () => {
    const setupStore = () => {
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
      return { useSimulationStore, runSimulation }
    }

    it('starts with a single active base plan holding the current params', () => {
      const { useSimulationStore } = setupStore()
      const { plans, activePlanId, params, savedSetups } = useSimulationStore.getState()

      expect(plans).toHaveLength(1)
      expect(plans[0].nameKey).toBe('base')
      expect(activePlanId).toBe(plans[0].id)
      expect(plans[0].params).toEqual(params)
      expect(savedSetups.map((setup) => setup.id)).toEqual([plans[0].id])
    })

    it('creates a plan from the current params, activates it and runs once', async () => {
      const { useSimulationStore, runSimulation } = setupStore()

      useSimulationStore.getState().updateParams({ retirementAge: 63 })
      await flushSimulationQueue()
      runSimulation.mockClear()

      const id = useSimulationStore.getState().createPlan('Retire at 60')
      await flushSimulationQueue()

      const { plans, activePlanId, params } = useSimulationStore.getState()
      expect(id).toBeTruthy()
      expect(plans).toHaveLength(2)
      expect(activePlanId).toBe(id)
      expect(params.retirementAge).toBe(63)
      expect(runSimulation).toHaveBeenCalledTimes(1)
    })

    it('creates a plan from explicit params (stress-test levers)', async () => {
      const { useSimulationStore } = setupStore()

      const id = useSimulationStore
        .getState()
        .createPlan('Spend 10% less', { ...DEFAULT_PARAMS, annualSavings: 61000 })
      await flushSimulationQueue()

      const plan = useSimulationStore.getState().plans.find((entry) => entry.id === id)
      expect(plan?.params.annualSavings).toBe(61000)
      expect(useSimulationStore.getState().params.annualSavings).toBe(61000)
    })

    it('keeps parameter edits in the working copy until they are saved', async () => {
      const { useSimulationStore } = setupStore()
      const baseId = useSimulationStore.getState().activePlanId

      const otherId = useSimulationStore.getState().createPlan('Barista FIRE')
      await flushSimulationQueue()

      useSimulationStore.getState().updateParams({ monthlyPension: 1234 })
      await flushSimulationQueue()

      // The simulation sees the edit, the stored plans do not.
      expect(useSimulationStore.getState().params.monthlyPension).toBe(1234)
      expect(useSimulationStore.getState().isDirty).toBe(true)
      expect(
        useSimulationStore.getState().plans.find((plan) => plan.id === otherId)?.params
          .monthlyPension
      ).toBe(DEFAULT_PARAMS.monthlyPension)

      useSimulationStore.getState().savePlanDraft()

      const { plans, isDirty, draftParams } = useSimulationStore.getState()
      expect(isDirty).toBe(false)
      expect(draftParams).toBeNull()
      expect(plans.find((plan) => plan.id === otherId)?.params.monthlyPension).toBe(1234)
      expect(plans.find((plan) => plan.id === baseId)?.params.monthlyPension).toBe(
        DEFAULT_PARAMS.monthlyPension
      )
    })

    it('switches the active plan, swapping params and scheduling one run', async () => {
      const { useSimulationStore, runSimulation } = setupStore()
      const baseId = useSimulationStore.getState().activePlanId

      useSimulationStore.getState().createPlan('Retire at 60')
      await flushSimulationQueue()
      useSimulationStore.getState().updateParams({ retirementAge: 60 })
      await flushSimulationQueue()
      runSimulation.mockClear()

      useSimulationStore.getState().setActivePlan(baseId)
      await flushSimulationQueue()

      expect(useSimulationStore.getState().activePlanId).toBe(baseId)
      expect(useSimulationStore.getState().params.retirementAge).toBe(DEFAULT_PARAMS.retirementAge)
      expect(runSimulation).toHaveBeenCalledTimes(1)
    })

    it('does not re-run when the active plan is re-selected', async () => {
      const { useSimulationStore, runSimulation } = setupStore()
      const baseId = useSimulationStore.getState().activePlanId
      runSimulation.mockClear()

      useSimulationStore.getState().setActivePlan(baseId)
      await flushSimulationQueue()

      expect(runSimulation).not.toHaveBeenCalled()
    })

    it('queues the run instead of firing it while auto-run is suspended', async () => {
      const { useSimulationStore, runSimulation } = setupStore()
      const baseId = useSimulationStore.getState().activePlanId

      useSimulationStore.getState().createPlan('Retire at 60')
      await flushSimulationQueue()
      runSimulation.mockClear()

      useSimulationStore.getState().setAutoRunSuspended(true)
      useSimulationStore.getState().setActivePlan(baseId)
      jest.advanceTimersByTime(200)
      await Promise.resolve()

      expect(runSimulation).not.toHaveBeenCalled()
      expect(useSimulationStore.getState().pendingRun).toBe(true)

      useSimulationStore.getState().setAutoRunSuspended(false)
      await flushSimulationQueue()

      expect(runSimulation).toHaveBeenCalledTimes(1)
    })

    it('duplicates a plan with its params and activates the copy', async () => {
      const { useSimulationStore } = setupStore()
      const baseId = useSimulationStore.getState().activePlanId

      useSimulationStore.getState().updateParams({ currentAssets: 999000 })
      await flushSimulationQueue()

      const copyId = useSimulationStore.getState().duplicatePlan(baseId)
      await flushSimulationQueue()

      const { plans, activePlanId } = useSimulationStore.getState()
      const copy = plans.find((plan) => plan.id === copyId)
      expect(plans).toHaveLength(2)
      expect(activePlanId).toBe(copyId)
      expect(copy?.params.currentAssets).toBe(999000)
      expect(copy?.name).not.toBe(plans[0].name)
    })

    it('renames a plan, drops its built-in name key and keeps names unique', async () => {
      const { useSimulationStore } = setupStore()
      const baseId = useSimulationStore.getState().activePlanId

      const otherId = useSimulationStore.getState().createPlan('Retire at 60')
      await flushSimulationQueue()

      useSimulationStore.getState().renamePlan(baseId, '  Coast FIRE  ')
      useSimulationStore.getState().renamePlan(otherId!, 'Coast FIRE')

      const { plans } = useSimulationStore.getState()
      const base = plans.find((plan) => plan.id === baseId)
      const other = plans.find((plan) => plan.id === otherId)
      expect(base?.name).toBe('Coast FIRE')
      expect(base?.nameKey).toBeUndefined()
      expect(other?.name).toBe('Coast FIRE (2)')
    })

    it('ignores empty rename input', async () => {
      const { useSimulationStore } = setupStore()
      const baseId = useSimulationStore.getState().activePlanId
      const before = useSimulationStore.getState().plans[0].name

      useSimulationStore.getState().renamePlan(baseId, '   ')

      expect(useSimulationStore.getState().plans[0].name).toBe(before)
    })

    it('deletes a plan and falls back to another when the active one goes', async () => {
      const { useSimulationStore, runSimulation } = setupStore()
      const baseId = useSimulationStore.getState().activePlanId

      const otherId = useSimulationStore.getState().createPlan('Retire at 60')
      await flushSimulationQueue()
      runSimulation.mockClear()

      useSimulationStore.getState().deletePlan(otherId!)
      await flushSimulationQueue()

      const { plans, activePlanId } = useSimulationStore.getState()
      expect(plans.map((plan) => plan.id)).toEqual([baseId])
      expect(activePlanId).toBe(baseId)
      expect(runSimulation).toHaveBeenCalledTimes(1)
    })

    it('refuses to delete the last remaining plan', () => {
      const { useSimulationStore } = setupStore()

      useSimulationStore.getState().deletePlan(useSimulationStore.getState().activePlanId)

      expect(useSimulationStore.getState().plans).toHaveLength(1)
    })

    it('enforces the plan limit', async () => {
      const { useSimulationStore } = setupStore()

      for (let index = 0; index < MAX_PLANS + 2; index += 1) {
        useSimulationStore.getState().createPlan(`Plan ${index}`)
        await flushSimulationQueue()
      }

      expect(useSimulationStore.getState().plans).toHaveLength(MAX_PLANS)
      expect(useSimulationStore.getState().error).toBe('planLimitReached')
    })

    it('routes the legacy setup actions through plans', async () => {
      const { useSimulationStore } = setupStore()

      useSimulationStore.getState().saveSetup('Legacy save')
      await flushSimulationQueue()

      const created = useSimulationStore
        .getState()
        .plans.find((plan) => plan.name === 'Legacy save')
      expect(created).toBeDefined()
      expect(useSimulationStore.getState().savedSetups.map((setup) => setup.id)).toEqual(
        useSimulationStore.getState().plans.map((plan) => plan.id)
      )

      useSimulationStore.getState().deleteSetup(created!.id)
      expect(useSimulationStore.getState().plans.some((plan) => plan.id === created!.id)).toBe(
        false
      )
    })
  })

  describe('working copy (plan drafts)', () => {
    const setupStore = () => {
      const { useSimulationStore, localStorageMock } = loadStore()
      const runSimulation = jest.fn(async () => {
        useSimulationStore.setState({
          results: createResults(useSimulationStore.getState().params),
          isLoading: false,
          error: null,
          pendingRun: false,
        })
      })
      useSimulationStore.setState({ runSimulation })
      return { useSimulationStore, runSimulation, localStorageMock }
    }

    it('starts clean and marks the working copy dirty on the first edit', async () => {
      const { useSimulationStore } = setupStore()

      expect(useSimulationStore.getState().isDirty).toBe(false)
      expect(useSimulationStore.getState().draftParams).toBeNull()

      useSimulationStore.getState().updateParams({ retirementAge: 63 })
      await flushSimulationQueue()

      const state = useSimulationStore.getState()
      expect(state.isDirty).toBe(true)
      expect(state.draftParams?.retirementAge).toBe(63)
      // The simulation always runs on the working copy.
      expect(state.results?.params.retirementAge).toBe(63)
      expect(state.plans[0].params.retirementAge).toBe(DEFAULT_PARAMS.retirementAge)
    })

    it('goes clean again when an edit is undone by hand', async () => {
      const { useSimulationStore } = setupStore()

      useSimulationStore.getState().updateParams({ retirementAge: 63 })
      await flushSimulationQueue()
      useSimulationStore.getState().updateParams({ retirementAge: DEFAULT_PARAMS.retirementAge })
      await flushSimulationQueue()

      expect(useSimulationStore.getState().isDirty).toBe(false)
      expect(useSimulationStore.getState().draftParams).toBeNull()
    })

    it('saves the working copy into the active plan and bumps updatedAt', async () => {
      const { useSimulationStore } = setupStore()
      const before = useSimulationStore.getState().plans[0].updatedAt

      useSimulationStore.getState().updateParams({ currentAssets: 750000 })
      await flushSimulationQueue()
      useSimulationStore.getState().savePlanDraft()

      const { plans, isDirty, draftParams, savedSetups } = useSimulationStore.getState()
      expect(isDirty).toBe(false)
      expect(draftParams).toBeNull()
      expect(plans[0].params.currentAssets).toBe(750000)
      expect(plans[0].updatedAt).toBeGreaterThanOrEqual(before)
      // The legacy mirror stays in sync with plans.
      expect(savedSetups[0].params.currentAssets).toBe(750000)
    })

    it('does nothing when saving a clean working copy', () => {
      const { useSimulationStore } = setupStore()
      const before = useSimulationStore.getState().plans[0]

      useSimulationStore.getState().savePlanDraft()

      expect(useSimulationStore.getState().plans[0]).toBe(before)
    })

    it('reverts the working copy back to the stored plan and re-runs', async () => {
      const { useSimulationStore, runSimulation } = setupStore()

      useSimulationStore.getState().updateParams({ annualSavings: 12000 })
      await flushSimulationQueue()
      runSimulation.mockClear()

      useSimulationStore.getState().revertPlanDraft()
      await flushSimulationQueue()

      const state = useSimulationStore.getState()
      expect(state.isDirty).toBe(false)
      expect(state.draftParams).toBeNull()
      expect(state.params.annualSavings).toBe(DEFAULT_PARAMS.annualSavings)
      expect(runSimulation).toHaveBeenCalledTimes(1)
    })

    it('drops the working copy when another plan is activated', async () => {
      const { useSimulationStore } = setupStore()
      const baseId = useSimulationStore.getState().activePlanId

      const otherId = useSimulationStore.getState().createPlan('Retire at 60')
      await flushSimulationQueue()

      useSimulationStore.getState().updateParams({ monthlyPension: 42 })
      await flushSimulationQueue()
      expect(useSimulationStore.getState().isDirty).toBe(true)

      useSimulationStore.getState().setActivePlan(baseId)
      await flushSimulationQueue()

      const state = useSimulationStore.getState()
      expect(state.activePlanId).toBe(baseId)
      expect(state.isDirty).toBe(false)
      expect(state.params.monthlyPension).toBe(DEFAULT_PARAMS.monthlyPension)
      // The abandoned edit never reached the plan the user was on.
      expect(state.plans.find((plan) => plan.id === otherId)?.params.monthlyPension).toBe(
        DEFAULT_PARAMS.monthlyPension
      )
    })

    it('lets a dirty plan be re-selected to discard the working copy', async () => {
      const { useSimulationStore } = setupStore()
      const baseId = useSimulationStore.getState().activePlanId

      useSimulationStore.getState().updateParams({ monthlyPension: 42 })
      await flushSimulationQueue()

      useSimulationStore.getState().setActivePlan(baseId)
      await flushSimulationQueue()

      expect(useSimulationStore.getState().isDirty).toBe(false)
      expect(useSimulationStore.getState().params.monthlyPension).toBe(
        DEFAULT_PARAMS.monthlyPension
      )
    })

    it('hands the working copy to a new plan created from it', async () => {
      const { useSimulationStore } = setupStore()
      const baseId = useSimulationStore.getState().activePlanId

      useSimulationStore.getState().updateParams({ retirementAge: 58 })
      await flushSimulationQueue()

      const newId = useSimulationStore.getState().createPlan('Retire at 58')
      await flushSimulationQueue()

      const state = useSimulationStore.getState()
      expect(state.isDirty).toBe(false)
      expect(state.plans.find((plan) => plan.id === newId)?.params.retirementAge).toBe(58)
      expect(state.plans.find((plan) => plan.id === baseId)?.params.retirementAge).toBe(
        DEFAULT_PARAMS.retirementAge
      )
    })

    it('caches the success rate of a clean run per plan', async () => {
      const { useSimulationStore } = setupStore()
      const baseId = useSimulationStore.getState().activePlanId

      useSimulationStore.setState({
        results: createResults(useSimulationStore.getState().params),
      })
      await useSimulationStore.getState().runSimulation()

      // The stubbed runSimulation does not populate the cache, so drive the
      // real bookkeeping through savePlanDraft instead.
      useSimulationStore.getState().updateParams({ currentAssets: 700000 })
      await flushSimulationQueue()
      useSimulationStore.setState({
        results: createResults(useSimulationStore.getState().params),
      })
      useSimulationStore.getState().savePlanDraft()

      expect(useSimulationStore.getState().planSuccessRates[baseId]).toBe(75)
    })

    it('round-trips an unsaved working copy through persistence', async () => {
      const { useSimulationStore, localStorageMock } = setupStore()

      useSimulationStore.getState().updateParams({ retirementAge: 64 })
      await flushSimulationQueue()
      useSimulationStore.getState().savePlanDraft()
      useSimulationStore.getState().updateParams({ retirementAge: 66 })
      await flushSimulationQueue()

      const persisted = localStorageMock.getItem(STORE_KEY)
      expect(persisted).toBeTruthy()
      const parsed = JSON.parse(persisted as string) as {
        version: number
        state: { draftParams: SimulationParams | null; plans: { params: SimulationParams }[] }
      }
      expect(parsed.version).toBe(3)
      expect(parsed.state.draftParams?.retirementAge).toBe(66)
      expect(parsed.state.plans[0].params.retirementAge).toBe(64)

      // Reload from exactly what was written (the legacy-import marker is part
      // of the same storage in a real browser session).
      const reloaded = loadStore({
        [STORE_KEY]: persisted as string,
        'retirement-simulator-plans-imported': '1',
      })
      const state = reloaded.useSimulationStore.getState()
      expect(state.isDirty).toBe(true)
      expect(state.params.retirementAge).toBe(66)
      expect(state.plans[0].params.retirementAge).toBe(64)
    })

    it('migrates v1 state into a clean working copy', () => {
      const v1Params = { ...DEFAULT_PARAMS, retirementAge: 61 }
      const { useSimulationStore } = loadStore({
        [STORE_KEY]: JSON.stringify({
          version: 1,
          state: {
            params: v1Params,
            results: null,
            plans: [
              {
                id: 'plan-base',
                name: 'Base plan',
                params: v1Params,
                createdAt: 1,
                updatedAt: 2,
              },
            ],
            activePlanId: 'plan-base',
          },
        }),
      })

      const state = useSimulationStore.getState()
      expect(state.isDirty).toBe(false)
      expect(state.draftParams).toBeNull()
      expect(state.params.retirementAge).toBe(61)
      expect(state.plans[0].params.retirementAge).toBe(61)
    })
  })

  describe('cash flows (store v3)', () => {
    /** A v2 plan: spending in `customExpenses`, windfalls in `oneTimeIncomes`. */
    const v2Params = (overrides: Record<string, unknown> = {}) => ({
      ...DEFAULT_PARAMS,
      cashFlows: undefined,
      customExpenses: [
        { id: 'rent', name: 'Rent', amount: 1400, interval: 'monthly' },
        { id: 'travel', name: 'Travel', amount: 6000, interval: 'annual' },
      ],
      oneTimeIncomes: [{ name: 'Inheritance', age: 70, amount: 120000 }],
      ...overrides,
    })

    const v2Blob = () =>
      JSON.stringify({
        version: 2,
        state: {
          params: v2Params({ retirementAge: 62 }),
          draftParams: v2Params({ retirementAge: 63 }),
          results: null,
          plans: [
            {
              id: 'plan-base',
              name: 'Base plan',
              params: v2Params({ retirementAge: 62 }),
              createdAt: 1,
              updatedAt: 2,
            },
            {
              id: 'plan-b',
              name: 'Later retirement',
              params: v2Params({ retirementAge: 65 }),
              createdAt: 3,
              updatedAt: 4,
            },
          ],
          activePlanId: 'plan-base',
        },
      })

    it('migrates every stored parameter set from v2 to cash flows', () => {
      const { useSimulationStore } = loadStore({
        [STORE_KEY]: v2Blob(),
        'retirement-simulator-plans-imported': '1',
      })

      const state = useSimulationStore.getState()

      // Both plans, and the unsaved working copy, are migrated — not just the
      // one that happens to be active.
      const migrated = [
        ...state.plans.map((plan) => plan.params),
        state.params,
        state.draftParams as SimulationParams,
      ]

      migrated.forEach((params) => {
        // The v2 pension field becomes the statutory pension flow, ahead of
        // the migrated expenses and the one-off income.
        expect(params.cashFlows.map((flow) => flow.id)).toEqual([
          'pension-statutory',
          'rent',
          'travel',
          expect.stringContaining('income'),
        ])
        expect(params.cashFlows[0]).toMatchObject({
          kind: 'pension',
          nameKey: 'statutoryPension',
          frequency: 'monthly',
          inflationLinked: false,
        })
        expect(params.cashFlows[1]).toEqual({
          id: 'rent',
          kind: 'expense',
          name: 'Rent',
          amount: 1400,
          frequency: 'monthly',
        })
        expect(params.cashFlows[3]).toMatchObject({
          kind: 'income',
          name: 'Inheritance',
          frequency: 'once',
          startAge: 70,
          amount: 120000,
        })
      })

      // ...and the legacy arrays still say exactly what they said before, so
      // every consumer that reads them keeps working.
      expect(state.params.customExpenses).toEqual([
        { id: 'rent', name: 'Rent', amount: 1400, interval: 'monthly' },
        { id: 'travel', name: 'Travel', amount: 6000, interval: 'annual' },
      ])
      expect(state.params.oneTimeIncomes).toEqual([
        { name: 'Inheritance', age: 70, amount: 120000 },
      ])
      expect(state.draftParams?.retirementAge).toBe(63)
      expect(state.isDirty).toBe(true)
    })

    it('keeps the working copy and the plan independent after migration', () => {
      const { useSimulationStore } = loadStore({
        [STORE_KEY]: v2Blob(),
        'retirement-simulator-plans-imported': '1',
      })

      const state = useSimulationStore.getState()
      expect(state.plans[0].params.retirementAge).toBe(62)
      expect(state.plans[1].params.retirementAge).toBe(65)
      expect(state.params.retirementAge).toBe(63)
    })

    it('folds a legacy expense write into the flow list', async () => {
      const { useSimulationStore } = loadStore()

      useSimulationStore.getState().updateParams({
        customExpenses: [
          ...useSimulationStore.getState().params.customExpenses,
          { id: 'boat', name: 'Boat', amount: 400, interval: 'monthly' },
        ],
      })
      await flushSimulationQueue()

      const { params } = useSimulationStore.getState()
      expect(params.cashFlows.find((flow) => flow.id === 'boat')).toEqual({
        id: 'boat',
        kind: 'expense',
        name: 'Boat',
        amount: 400,
        frequency: 'monthly',
      })
      expect(params.customExpenses.find((expense) => expense.id === 'boat')).toBeDefined()
    })

    it('regenerates the projections when cash flows are written directly', async () => {
      const { useSimulationStore } = loadStore()

      useSimulationStore.getState().updateParams({
        cashFlows: [
          {
            id: 'rent',
            kind: 'income',
            name: 'Rental income',
            amount: 900,
            frequency: 'monthly',
            startAge: 62,
            endAge: 70,
          },
          {
            id: 'gift',
            kind: 'income',
            name: 'Gift',
            amount: 5000,
            frequency: 'once',
            startAge: 66,
          },
          { id: 'food', kind: 'expense', name: 'Food', amount: 1200, frequency: 'monthly' },
        ],
      })
      await flushSimulationQueue()

      const { params } = useSimulationStore.getState()
      // The windowed income has no legacy counterpart and must not leak into one.
      expect(params.customExpenses).toEqual([
        { id: 'food', name: 'Food', amount: 1200, interval: 'monthly' },
      ])
      expect(params.oneTimeIncomes).toEqual([{ name: 'Gift', age: 66, amount: 5000 }])
      expect(params.cashFlows).toHaveLength(3)
    })

    it('survives a legacy write without losing windowed flows', async () => {
      const { useSimulationStore } = loadStore()
      const windowed = {
        id: 'rent',
        kind: 'income' as const,
        name: 'Rental income',
        amount: 900,
        frequency: 'monthly' as const,
        startAge: 62,
        endAge: 70,
      }

      useSimulationStore.getState().updateParams({ cashFlows: [windowed] })
      await flushSimulationQueue()

      // A surface that only knows `customExpenses` (the sidebar, a stress lever)
      // writes next. The windowed income has to come through untouched.
      useSimulationStore.getState().updateParams({
        customExpenses: [{ id: 'food', name: 'Food', amount: 1200, interval: 'monthly' }],
      })
      await flushSimulationQueue()

      const { params } = useSimulationStore.getState()
      expect(params.cashFlows).toEqual([
        windowed,
        { id: 'food', kind: 'expense', name: 'Food', amount: 1200, frequency: 'monthly' },
      ])
    })

    it('round-trips a windowed flow through persistence', async () => {
      const { useSimulationStore, localStorageMock } = loadStore()
      const windowed = {
        id: 'care',
        kind: 'expense' as const,
        name: 'Care',
        amount: 2500,
        frequency: 'monthly' as const,
        startAge: 80,
        endAge: 90,
        inflationLinked: false,
        growthRate: 0.02,
      }

      useSimulationStore
        .getState()
        .updateParams({ cashFlows: [...DEFAULT_PARAMS.cashFlows, windowed] })
      await flushSimulationQueue()

      const persisted = localStorageMock.getItem(STORE_KEY) as string
      const reloaded = loadStore({
        [STORE_KEY]: persisted,
        'retirement-simulator-plans-imported': '1',
      })

      expect(reloaded.useSimulationStore.getState().params.cashFlows).toContainEqual(windowed)
    })
  })
})
