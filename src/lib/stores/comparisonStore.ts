import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MAX_COMPARISON_PLANS } from '@/types'

/**
 * Comparison state lives outside the simulation store on purpose: it is view
 * state (which plans are lined up), not plan data. Keeping it separate also
 * lets the stress levers preselect a comparison without touching the active
 * plan. The compared numbers themselves are computed live by `CompareView`
 * and never stored.
 */

interface ComparisonState {
  selectedIds: string[]
  setSelectedIds: (ids: string[]) => void
  toggleSelected: (id: string) => void
}

export const MIN_COMPARISON_PLANS = 2

export const useComparisonStore = create<ComparisonState>()(
  persist(
    (set) => ({
      selectedIds: [],

      setSelectedIds: (ids) => set({ selectedIds: ids.slice(0, MAX_COMPARISON_PLANS) }),

      toggleSelected: (id) =>
        set((state) => {
          if (state.selectedIds.includes(id)) {
            return { selectedIds: state.selectedIds.filter((entry) => entry !== id) }
          }
          if (state.selectedIds.length >= MAX_COMPARISON_PLANS) return state
          return { selectedIds: [...state.selectedIds, id] }
        }),
    }),
    {
      name: 'retirement-simulator-comparison',
      version: 1,
      partialize: (state) => ({ selectedIds: state.selectedIds }),
    }
  )
)

export const useComparisonSelection = () => useComparisonStore((state) => state.selectedIds)
export const useSetComparisonSelection = () => useComparisonStore((state) => state.setSelectedIds)
