import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_PLAN_SECTION,
  isPlanSectionGroup,
  type PlanSectionGroup,
} from '@/components/plans/planSections'

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
  /**
   * True once the dashboard's first-visit welcome strip has been dismissed.
   * A view preference, not a plan input — which is exactly why it lives here
   * and not in `SimulationParams`.
   */
  welcomeDismissed: boolean
  dismissWelcome: () => void
  /**
   * Which page of the plan editor is open. The editor shows one section at a
   * time, and coming back after a reload should land where you left off.
   *
   * A view preference like the two above: the open page can never reach the
   * engine.
   */
  planSection: PlanSectionGroup
  setPlanSection: (section: PlanSectionGroup) => void
}

export const DISPLAY_STORE_KEY = 'retirement-simulator-display'

export const useDisplayStore = create<DisplayStore>()(
  persist(
    (set) => ({
      displayReal: false,
      setDisplayReal: (displayReal: boolean) => set({ displayReal }),
      welcomeDismissed: false,
      dismissWelcome: () => set({ welcomeDismissed: true }),
      planSection: DEFAULT_PLAN_SECTION,
      setPlanSection: (section: PlanSectionGroup) =>
        set((state) => (state.planSection === section ? state : { planSection: section })),
    }),
    {
      name: DISPLAY_STORE_KEY,
      // A section name persisted by an older build (or edited by hand) that the
      // editor no longer has must not leave the plan tab blank.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<DisplayStore> & Record<string, unknown>
        const { planSectionsCollapsed: _legacy, ...rest } = stored
        return {
          ...current,
          ...rest,
          planSection: isPlanSectionGroup(rest.planSection)
            ? rest.planSection
            : current.planSection,
        }
      },
    }
  )
)

export const useDisplayReal = () => useDisplayStore((state) => state.displayReal)
export const useSetDisplayReal = () => useDisplayStore((state) => state.setDisplayReal)
export const useWelcomeDismissed = () => useDisplayStore((state) => state.welcomeDismissed)
export const useDismissWelcome = () => useDisplayStore((state) => state.dismissWelcome)
export const usePlanSection = () => useDisplayStore((state) => state.planSection)
export const useSetPlanSection = () => useDisplayStore((state) => state.setPlanSection)
