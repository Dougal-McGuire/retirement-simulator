import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  SimulationParams,
  SimulationResults,
  SimulationStore,
  SavedSetup,
  DEFAULT_PARAMS,
  OneTimeIncome,
  CustomExpense,
} from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'

const STORAGE_KEY = 'retirement-simulator-params'
const SAVED_SETUPS_KEY = 'retirement-simulator-saved-setups'

type PersistedParams = Partial<Omit<SimulationParams, 'customExpenses' | 'oneTimeIncomes'>> & {
  annualExpenses?: unknown
  customExpenses?: unknown
  monthlyExpenses?: unknown
  oneTimeIncomes?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const toPersistedParams = (params: unknown): PersistedParams =>
  isRecord(params) ? (params as PersistedParams) : {}

const sanitizeOneTimeIncomes = (incomes: unknown): OneTimeIncome[] => {
  if (!Array.isArray(incomes)) return []
  return incomes
    .map((entry) => {
      if (!entry) return null
      const rawAge = Number((entry as { age?: unknown }).age)
      const rawAmount = Number((entry as { amount?: unknown }).amount)
      const rawName =
        typeof (entry as { name?: unknown }).name === 'string'
          ? (entry as { name: string }).name
          : ''
      if (!Number.isFinite(rawAge) || !Number.isFinite(rawAmount)) return null
      return {
        name: rawName,
        age: rawAge,
        amount: Math.max(0, rawAmount),
      }
    })
    .filter((income): income is OneTimeIncome => income !== null)
}

const sanitizeCustomExpenses = (expenses: unknown): CustomExpense[] => {
  if (!Array.isArray(expenses)) return []
  return expenses
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const expense = entry as {
        id?: unknown
        name?: unknown
        amount?: unknown
        interval?: unknown
      }
      const rawId = typeof expense.id === 'string' ? expense.id : ''
      const rawName = typeof expense.name === 'string' ? expense.name : ''
      const rawAmount = Number(expense.amount)
      const rawInterval =
        expense.interval === 'monthly' || expense.interval === 'annual'
          ? expense.interval
          : 'monthly'

      if (!rawId || !rawName || !Number.isFinite(rawAmount) || rawAmount <= 0) return null

      return {
        id: rawId,
        name: rawName,
        amount: Math.max(0, rawAmount),
        interval: rawInterval,
      }
    })
    .filter((expense): expense is CustomExpense => expense !== null)
}

// Migration helper: convert old monthlyExpenses/annualExpenses to customExpenses
const migrateToCustomExpenses = (params: PersistedParams): CustomExpense[] => {
  const expenses: CustomExpense[] = []

  // Migrate monthly expenses
  if (isRecord(params.monthlyExpenses)) {
    const monthlyLabels: Record<string, string> = {
      health: 'Health Insurance',
      food: 'Groceries',
      entertainment: 'Entertainment',
      shopping: 'Shopping',
      utilities: 'Utilities',
    }
    Object.entries(params.monthlyExpenses).forEach(([key, value]) => {
      if (typeof value === 'number' && value > 0) {
        expenses.push({
          id: `migrated-monthly-${key}`,
          name: monthlyLabels[key] || key,
          amount: value,
          interval: 'monthly',
        })
      }
    })
  }

  // Migrate annual expenses
  if (isRecord(params.annualExpenses)) {
    const annualLabels: Record<string, string> = {
      vacations: 'Vacations',
      repairs: 'Home Repairs',
      carMaintenance: 'Car Maintenance',
    }
    Object.entries(params.annualExpenses).forEach(([key, value]) => {
      if (typeof value === 'number' && value > 0) {
        expenses.push({
          id: `migrated-annual-${key}`,
          name: annualLabels[key] || key,
          amount: value,
          interval: 'annual',
        })
      }
    })
  }

  return expenses
}

const normalizePersistedParams = (persistedParams: unknown): SimulationParams => {
  const params = toPersistedParams(persistedParams)
  const {
    annualExpenses: _annualExpenses,
    customExpenses: rawCustomExpenses,
    monthlyExpenses: _monthlyExpenses,
    oneTimeIncomes: rawOneTimeIncomes,
    ...currentParams
  } = params
  const sanitizedCustomExpenses = sanitizeCustomExpenses(rawCustomExpenses)
  const migratedCustomExpenses = migrateToCustomExpenses(params)
  const customExpenses =
    Array.isArray(rawCustomExpenses) ? sanitizedCustomExpenses : migratedCustomExpenses

  return {
    ...DEFAULT_PARAMS,
    ...currentParams,
    oneTimeIncomes: sanitizeOneTimeIncomes(rawOneTimeIncomes),
    customExpenses,
  }
}

const normalizeParamsForFingerprint = (params: Partial<SimulationParams>): SimulationParams => ({
  ...DEFAULT_PARAMS,
  ...params,
  oneTimeIncomes: sanitizeOneTimeIncomes(params.oneTimeIncomes),
  customExpenses: sanitizeCustomExpenses(params.customExpenses),
})

const getParamsFingerprint = (params: Partial<SimulationParams>) =>
  JSON.stringify(normalizeParamsForFingerprint(params))

const runSimulationWithBestAvailableRuntime = async (params: SimulationParams) => {
  if (
    typeof window === 'undefined' ||
    typeof Worker === 'undefined' ||
    process.env.NODE_ENV === 'test'
  ) {
    return runMonteCarloSimulation(params)
  }

  const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
  return runSimulationInClient(params)
}

export const useSimulationStore = create<SimulationStore>()(
  persist(
    (set, get) => {
      let scheduledRunTimeout: ReturnType<typeof setTimeout> | null = null

      const clearScheduledRun = () => {
        if (scheduledRunTimeout) {
          clearTimeout(scheduledRunTimeout)
          scheduledRunTimeout = null
        }
      }

      const scheduleSimulation = (delay = 100) => {
        clearScheduledRun()
        set({ pendingRun: true })
        scheduledRunTimeout = setTimeout(() => {
          scheduledRunTimeout = null
          void get().runSimulation()
        }, delay)
      }

      return {
        params: DEFAULT_PARAMS,
        results: null,
        isLoading: false,
        error: null,
        savedSetups: [],
        // Auto-run control
        autoRunSuspended: false,
        pendingRun: false,

        updateParams: (partial: Partial<SimulationParams>) => {
          const currentParams = get().params
          const nextOneTimeIncomes =
            partial.oneTimeIncomes !== undefined
              ? sanitizeOneTimeIncomes(partial.oneTimeIncomes)
              : Array.isArray(currentParams.oneTimeIncomes)
                ? currentParams.oneTimeIncomes
                : []
          const newParams = {
            ...currentParams,
            ...partial,
            oneTimeIncomes: nextOneTimeIncomes,
          }

          set({
            params: newParams,
            error: null,
          })

          // Auto-run simulation after parameter update unless suspended
          if (!get().autoRunSuspended) {
            scheduleSimulation()
          } else {
            // Mark that a run is pending for when autoRun resumes
            set({ pendingRun: true })
          }
        },

        runSimulation: async () => {
          if (get().isLoading) {
            set({ pendingRun: true })
            return
          }

          clearScheduledRun()
          const { params } = get()
          const requestFingerprint = getParamsFingerprint(params)

          set({ isLoading: true, error: null, pendingRun: false })

          try {
            // Run simulation in a setTimeout to allow UI to update
            const results = await new Promise<SimulationResults>((resolve, reject) => {
              setTimeout(async () => {
                try {
                  resolve(await runSimulationWithBestAvailableRuntime(params))
                } catch (err) {
                  reject(err)
                }
              }, 0)
            })

            const latestFingerprint = getParamsFingerprint(get().params)
            if (latestFingerprint !== requestFingerprint) {
              set({ isLoading: false, error: null })

              if (get().autoRunSuspended) {
                set({ pendingRun: true })
              } else {
                scheduleSimulation(0)
              }
              return
            }

            set({
              results,
              isLoading: false,
              error: null,
            })
          } catch (error) {
            console.error('Simulation error:', error)
            set({
              isLoading: false,
              error: error instanceof Error ? error.message : 'Simulation failed',
            })
          } finally {
            if (!get().autoRunSuspended && get().pendingRun) {
              scheduleSimulation(0)
            }
          }
        },

        // Control auto-run suspension during interactions (e.g., chart brushing)
        setAutoRunSuspended: (suspended: boolean) => {
          const { pendingRun } = get()
          set({ autoRunSuspended: suspended })
          if (suspended) {
            clearScheduledRun()
            return
          }
          if (!suspended && pendingRun) {
            scheduleSimulation()
          }
        },

        saveToStorage: () => {
          const { params } = get()
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(params))
          } catch (error) {
            console.error('Failed to save parameters:', error)
            set({ error: 'Failed to save parameters' })
          }
        },

        loadFromStorage: () => {
          try {
            const stored = localStorage.getItem(STORAGE_KEY)
            if (stored) {
              set({
                params: normalizePersistedParams(JSON.parse(stored) as unknown),
                error: null,
              })
              // Run simulation with loaded parameters
              get().runSimulation()
            }
          } catch (error) {
            console.error('Failed to load parameters:', error)
            set({ error: 'Failed to load parameters' })
          }
        },

        saveSetup: (name: string) => {
          const { params, savedSetups } = get()
          try {
            const newSetup: SavedSetup = {
              id: Date.now().toString(),
              name,
              timestamp: Date.now(),
              params: {
                ...DEFAULT_PARAMS,
                ...params,
                oneTimeIncomes: sanitizeOneTimeIncomes(params.oneTimeIncomes),
              },
            }

            const updatedSetups = [newSetup, ...savedSetups].slice(0, 10) // Keep only last 10

            set({ savedSetups: updatedSetups })
            localStorage.setItem(SAVED_SETUPS_KEY, JSON.stringify(updatedSetups))
          } catch (error) {
            console.error('Failed to save setup:', error)
            set({ error: 'Failed to save setup' })
          }
        },

        loadSetup: (id: string) => {
          const { savedSetups } = get()
          const setup = savedSetups.find((s) => s.id === id)
          if (setup) {
            set({
              params: normalizePersistedParams(setup.params),
              error: null,
            })
            // Run simulation with loaded parameters
            get().runSimulation()
          }
        },

        deleteSetup: (id: string) => {
          const { savedSetups } = get()
          try {
            const updatedSetups = savedSetups.filter((s) => s.id !== id)
            set({ savedSetups: updatedSetups })
            localStorage.setItem(SAVED_SETUPS_KEY, JSON.stringify(updatedSetups))
          } catch (error) {
            console.error('Failed to delete setup:', error)
            set({ error: 'Failed to delete setup' })
          }
        },

        getSavedSetups: () => {
          const { savedSetups } = get()
          return savedSetups
        },

        clearResults: () => {
          set({
            results: null,
            error: null,
          })
        },
      }
    },
    {
      name: 'retirement-simulator-store',
      partialize: (state) => ({
        params: state.params,
        results: state.results, // Persist results to avoid re-running simulation on every page load
        savedSetups: state.savedSetups,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            // Load saved setups from separate storage
            try {
              const stored = localStorage.getItem(SAVED_SETUPS_KEY)
              if (stored) {
                const savedSetups = JSON.parse(stored) as SavedSetup[]
                state.savedSetups = savedSetups.map((setup) => ({
                  ...setup,
                  params: normalizePersistedParams(setup.params),
                }))
              }
            } catch (error) {
              console.error('Failed to load saved setups:', error)
            }
            if (state.params) {
              state.params = normalizePersistedParams(state.params)
            }

            // Validate that persisted results match current params
            // If params have changed since results were generated, clear stale results
            if (state.results && state.results.params) {
              const resultsFingerprint = getParamsFingerprint(state.results.params)
              const currentFingerprint = getParamsFingerprint(state.params)

              if (resultsFingerprint !== currentFingerprint) {
                console.log('Parameters have changed since last simulation, clearing stale results')
                state.results = null
              }
            }
          }
        }
      },
    }
  )
)

// Helper hooks for specific parts of the store
export const useSimulationParams = () => useSimulationStore((state) => state.params)
export const useSimulationResults = () => useSimulationStore((state) => state.results)
export const useSimulationLoading = () => useSimulationStore((state) => state.isLoading)
export const useSimulationError = () => useSimulationStore((state) => state.error)

// Helper hooks for individual actions
export const useUpdateParams = () => useSimulationStore((state) => state.updateParams)
export const useRunSimulation = () => useSimulationStore((state) => state.runSimulation)
export const useSaveToStorage = () => useSimulationStore((state) => state.saveToStorage)
export const useLoadFromStorage = () => useSimulationStore((state) => state.loadFromStorage)
export const useSaveSetup = () => useSimulationStore((state) => state.saveSetup)
export const useLoadSetup = () => useSimulationStore((state) => state.loadSetup)
export const useDeleteSetup = () => useSimulationStore((state) => state.deleteSetup)
export const useSavedSetups = () => useSimulationStore((state) => state.savedSetups)
export const useClearResults = () => useSimulationStore((state) => state.clearResults)
export const useSetAutoRunSuspended = () => useSimulationStore((state) => state.setAutoRunSuspended)
