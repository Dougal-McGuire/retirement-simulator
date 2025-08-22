import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SimulationParams, SimulationResults, SimulationStore, DEFAULT_PARAMS } from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'

const STORAGE_KEY = 'retirement-simulator-params'

export const useSimulationStore = create<SimulationStore>()(
  persist(
    (set, get) => ({
      params: DEFAULT_PARAMS,
      results: null,
      isLoading: false,
      error: null,

      updateParams: (partial: Partial<SimulationParams>) => {
        const currentParams = get().params
        const newParams = { ...currentParams, ...partial }
        
        set({ 
          params: newParams,
          error: null
        })
        
        // Auto-run simulation after parameter update
        // Small delay to debounce rapid updates
        setTimeout(() => {
          get().runSimulation()
        }, 100)
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
            error: null
          })
        } catch (error) {
          console.error('Simulation error:', error)
          set({ 
            isLoading: false,
            error: error instanceof Error ? error.message : 'Simulation failed'
          })
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
              error: null
            })
            // Run simulation with loaded parameters
            get().runSimulation()
          }
        } catch (error) {
          console.error('Failed to load parameters:', error)
          set({ error: 'Failed to load parameters' })
        }
      },

      clearResults: () => {
        set({ 
          results: null,
          error: null
        })
      },
    }),
    {
      name: 'retirement-simulator-store',
      partialize: (state) => ({ 
        params: state.params 
      }),
    }
  )
)

// Helper hooks for specific parts of the store
export const useSimulationParams = () => useSimulationStore((state) => state.params)
export const useSimulationResults = () => useSimulationStore((state) => state.results)
export const useSimulationLoading = () => useSimulationStore((state) => state.isLoading)
export const useSimulationError = () => useSimulationStore((state) => state.error)

// Helper hook for actions
export const useSimulationActions = () => useSimulationStore((state) => ({
  updateParams: state.updateParams,
  runSimulation: state.runSimulation,
  saveToStorage: state.saveToStorage,
  loadFromStorage: state.loadFromStorage,
  clearResults: state.clearResults,
}))