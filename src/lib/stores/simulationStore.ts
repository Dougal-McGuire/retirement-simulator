import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  SimulationParams,
  SimulationResults,
  SimulationStore,
  SavedSetup,
  DEFAULT_PARAMS,
} from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'

const STORAGE_KEY = 'retirement-simulator-params'
const SAVED_SETUPS_KEY = 'retirement-simulator-saved-setups'

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
        const newParams = { ...currentParams, ...partial }

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
          const results = await new Promise<SimulationResults>((resolve) => {
            setTimeout(() => {
              resolve(runMonteCarloSimulation(params))
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
            const params = JSON.parse(stored) as SimulationParams
            set({
              params,
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
            params: { ...params },
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
            params: { ...setup.params },
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
                state.savedSetups = savedSetups
              }
            } catch (error) {
              console.error('Failed to load saved setups:', error)
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
