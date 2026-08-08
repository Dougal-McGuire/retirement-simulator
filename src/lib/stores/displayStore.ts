import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * View preferences for the dashboard.
 *
 * Deliberately a *separate* store from the simulation store. `displayReal` only
 * changes which pre-computed series the charts read; it is not an input to the
 * model. Keeping it out of `SimulationParams` structurally guarantees it can
 * never leak into the params fingerprint or the plan identity hash, so flipping
 * the toggle can never trigger a re-run or invalidate persisted results.
 */
export type DisplayStore = {
  /** true = show euro amounts in today's purchasing power. */
  displayReal: boolean
  setDisplayReal: (displayReal: boolean) => void
}

export const DISPLAY_STORE_KEY = 'retirement-simulator-display'

export const useDisplayStore = create<DisplayStore>()(
  persist(
    (set) => ({
      displayReal: false,
      setDisplayReal: (displayReal: boolean) => set({ displayReal }),
    }),
    { name: DISPLAY_STORE_KEY }
  )
)

export const useDisplayReal = () => useDisplayStore((state) => state.displayReal)
export const useSetDisplayReal = () => useDisplayStore((state) => state.setDisplayReal)
