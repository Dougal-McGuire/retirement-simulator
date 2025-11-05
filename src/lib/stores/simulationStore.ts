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

const sanitizeOneTimeIncomes = (incomes: unknown): OneTimeIncome[] => {
  if (!Array.isArray(incomes)) return []
  return incomes
    .map((entry) => {
      if (!entry) return null
      const rawAge = Number((entry as { age?: unknown }).age)
      const rawAmount = Number((entry as { amount?: unknown }).amount)
      if (!Number.isFinite(rawAge) || !Number.isFinite(rawAmount)) return null
      return {
        age: rawAge,
        amount: Math.max(0, rawAmount),
      }
    })
    .filter((income): income is OneTimeIncome => income !== null)
}

// Migration helper: convert old monthlyExpenses/annualExpenses to customExpenses
const migrateToCustomExpenses = (params: any): CustomExpense[] => {
  const expenses: CustomExpense[] = []

  // Migrate monthly expenses
  if (params.monthlyExpenses && typeof params.monthlyExpenses === 'object') {
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
  if (params.annualExpenses && typeof params.annualExpenses === 'object') {
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

export const useSimulationStore = create<SimulationStore>()(
  persist(
    (set, get) => ({
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
          // Small delay to debounce rapid updates
          setTimeout(() => {
            get().runSimulation()
          }, 100)
        } else {
          // Mark that a run is pending for when autoRun resumes
          set({ pendingRun: true })
        }
      },

      runSimulation: async () => {
        const { params } = get()

        set({ isLoading: true, error: null })

        try {
          // Run simulation in a setTimeout to allow UI to update
          const results = await new Promise<SimulationResults>((resolve, reject) => {
            setTimeout(() => {
              try {
                resolve(runMonteCarloSimulation(params))
              } catch (err) {
                reject(err)
              }
            }, 0)
          })

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
        }
      },

      // Control auto-run suspension during interactions (e.g., chart brushing)
      setAutoRunSuspended: (suspended: boolean) => {
        const { pendingRun } = get()
        set({ autoRunSuspended: suspended })
        if (!suspended && pendingRun) {
          // Trigger a single run to catch up
          set({ pendingRun: false })
          setTimeout(() => {
            get().runSimulation()
          }, 100)
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
            const params = JSON.parse(stored) as any

            // Migrate old data structure if needed
            const customExpenses = params.customExpenses
              ? (Array.isArray(params.customExpenses) ? params.customExpenses : [])
              : migrateToCustomExpenses(params)

            set({
              params: {
                ...params,
                oneTimeIncomes: sanitizeOneTimeIncomes(params.oneTimeIncomes),
                customExpenses,
              },
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
          const params = setup.params as any

          // Migrate old data structure if needed
          const customExpenses = params.customExpenses
            ? (Array.isArray(params.customExpenses) ? params.customExpenses : [])
            : migrateToCustomExpenses(params)

          set({
            params: {
              ...params,
              oneTimeIncomes: sanitizeOneTimeIncomes(params.oneTimeIncomes),
              customExpenses,
            },
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
    }),
    {
      name: 'retirement-simulator-store',
      partialize: (state) => ({
        params: state.params,
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
                  params: {
                    ...setup.params,
                    oneTimeIncomes: sanitizeOneTimeIncomes(setup.params.oneTimeIncomes),
                  },
                }))
              }
            } catch (error) {
              console.error('Failed to load saved setups:', error)
            }
            if (state.params) {
              state.params.oneTimeIncomes = sanitizeOneTimeIncomes(state.params.oneTimeIncomes)
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
