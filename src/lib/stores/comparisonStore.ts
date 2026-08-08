import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MAX_COMPARISON_PLANS } from '@/types'

/**
 * Comparison state lives outside the simulation store on purpose: it is view
 * state (which plans are lined up, and the last run's numbers), not plan data.
 * Keeping it separate also lets the stress levers preselect a comparison
 * without touching the active plan.
 */

/**
 * A comparison result, reduced to what the table and the overlay chart draw.
 *
 * Full `SimulationResults` objects would be an order of magnitude larger in
 * localStorage for no gain, so only the median path is kept.
 */
export interface ComparisonSnapshot {
  planId: string
  name: string
  successRate: number
  medianEndAssets: number
  depletionRisk: number
  shortfallAge: number | null
  retirementAge: number
  ages: number[]
  medianAssets: Array<number | null>
  /** Signature of the parameters this snapshot was produced from. */
  fingerprint: string
  runs: number
  /** Wall-clock time of the run, shown next to stale results. */
  ranAt: number
}

interface ComparisonState {
  selectedIds: string[]
  snapshots: ComparisonSnapshot[]
  setSelectedIds: (ids: string[]) => void
  toggleSelected: (id: string) => void
  setSnapshots: (snapshots: ComparisonSnapshot[]) => void
  clearSnapshots: () => void
}

export const MIN_COMPARISON_PLANS = 2

export const useComparisonStore = create<ComparisonState>()(
  persist(
    (set) => ({
      selectedIds: [],
      snapshots: [],

      setSelectedIds: (ids) => set({ selectedIds: ids.slice(0, MAX_COMPARISON_PLANS) }),

      toggleSelected: (id) =>
        set((state) => {
          if (state.selectedIds.includes(id)) {
            return { selectedIds: state.selectedIds.filter((entry) => entry !== id) }
          }
          if (state.selectedIds.length >= MAX_COMPARISON_PLANS) return state
          return { selectedIds: [...state.selectedIds, id] }
        }),

      setSnapshots: (snapshots) => set({ snapshots }),
      clearSnapshots: () => set({ snapshots: [] }),
    }),
    {
      name: 'retirement-simulator-comparison',
      version: 1,
      partialize: (state) => ({ selectedIds: state.selectedIds, snapshots: state.snapshots }),
    }
  )
)

export const useComparisonSelection = () => useComparisonStore((state) => state.selectedIds)
export const useComparisonSnapshots = () => useComparisonStore((state) => state.snapshots)
export const useSetComparisonSelection = () => useComparisonStore((state) => state.setSelectedIds)
