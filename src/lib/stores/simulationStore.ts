import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  SimulationParams,
  SimulationResults,
  SimulationStore,
  SavedSetup,
  DEFAULT_PARAMS,
  MAX_PLANS,
  type Plan,
} from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import {
  projectCustomExpenses,
  projectOneTimeIncomes,
  reconcileCashFlows,
  sanitizeCashFlows,
} from '@/lib/simulation/cashFlows'
import {
  bootstrapPlans,
  createPlanId,
  DEFAULT_PLAN_ID,
  DEFAULT_PLAN_NAME,
  DEFAULT_PLAN_NAME_KEY,
  makePlan,
  normalizePlans,
  plansToSavedSetups,
  uniquePlanName,
} from '@/lib/stores/plans'
import {
  BASE_PARAMS_KEY,
  BASE_PLANS_IMPORTED_KEY,
  BASE_SAVED_SETUPS_KEY,
  BASE_STORE_KEY,
  storageKey,
} from '@/lib/stores/persistenceKey'
import {
  isRecord,
  normalizePersistedParams,
  sanitizeCustomExpenses,
  sanitizeOneTimeIncomes,
} from '@/lib/stores/normalizeParams'

// Re-exported so the many existing importers (and `paramRegistration.test.ts`)
// keep resolving it here; the implementation now lives in a store-free module
// that the server-side plan store can share. See `./normalizeParams`.
export { normalizePersistedParams }

// Resolved lazily: when a Google account is signed in these keys gain a
// per-user suffix so several accounts can share one browser without seeing
// each other's plans. Signed out they resolve to the original key names, so
// existing local data is untouched. See `./persistenceKey`.
const STORAGE_KEY = () => storageKey(BASE_PARAMS_KEY)
const SAVED_SETUPS_KEY = () => storageKey(BASE_SAVED_SETUPS_KEY)

/**
 * v0: params + savedSetups.
 * v1: first-class plans.
 * v2: plans are durable; edits live in a working copy (`draftParams`).
 * v3: unified `cashFlows`; `customExpenses`/`oneTimeIncomes` become projections.
 */
const STORE_VERSION = 3


const normalizeSavedSetups = (value: unknown): SavedSetup[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      if (!isRecord(entry)) return null

      const { id, name, timestamp, params } = entry
      if (
        typeof id !== 'string' ||
        id.trim() === '' ||
        typeof name !== 'string' ||
        typeof timestamp !== 'number' ||
        !Number.isFinite(timestamp)
      ) {
        return null
      }

      return {
        id,
        name,
        timestamp,
        params: normalizePersistedParams(params),
      }
    })
    .filter((setup): setup is SavedSetup => setup !== null)
}

const normalizeParamsForFingerprint = (params: Partial<SimulationParams>): SimulationParams => ({
  ...DEFAULT_PARAMS,
  ...params,
  oneTimeIncomes: sanitizeOneTimeIncomes(params.oneTimeIncomes),
  customExpenses: sanitizeCustomExpenses(params.customExpenses),
  cashFlows: sanitizeCashFlows(params.cashFlows),
})

const getParamsFingerprint = (params: Partial<SimulationParams>) =>
  JSON.stringify(normalizeParamsForFingerprint(params))

const paramsDiffer = (a: SimulationParams, b: SimulationParams) =>
  getParamsFingerprint(a) !== getParamsFingerprint(b)

const sanitizePlanSuccessRates = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) return {}
  const sanitized: Record<string, number> = {}
  Object.entries(value).forEach(([id, rate]) => {
    if (typeof rate === 'number' && Number.isFinite(rate)) sanitized[id] = rate
  })
  return sanitized
}

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

      /**
       * Plans are the single source of truth for parameter sets. `savedSetups`
       * is kept as a mirror so the legacy save/load controls keep working.
       */
      const commitPlans = (plans: Plan[]) => {
        set({ plans, savedSetups: plansToSavedSetups(plans) })
      }

      const findPlan = (id: string) => get().plans.find((plan) => plan.id === id)

      /**
       * Writes params into the *working copy* only. The named plan is durable:
       * it changes on `savePlanDraft`, never as a side effect of editing. This
       * is what keeps an abandoned wizard session (or a stray slider drag) from
       * silently rewriting a plan the user considers finished.
       */
      const applyParams = (nextParams: SimulationParams) => {
        const activePlan = findPlan(get().activePlanId)
        const dirty = activePlan ? paramsDiffer(nextParams, activePlan.params) : true

        set({
          params: nextParams,
          draftParams: dirty ? nextParams : null,
          isDirty: dirty,
          error: null,
        })
      }

      /** Drops the working copy and points the store at `plan`'s stored params. */
      const adoptPlanParams = (plan: Plan) => {
        set({
          activePlanId: plan.id,
          params: plan.params,
          draftParams: null,
          isDirty: false,
          error: null,
        })
      }

      /** Remembers a plan's success rate when the current results describe it. */
      const successRateFor = (params: SimulationParams): number | null => {
        const { results } = get()
        if (!results) return null
        return paramsDiffer(results.params, params) ? null : results.successRate
      }

      const rememberSuccessRate = (planId: string, rate: number | null) => {
        const next = { ...get().planSuccessRates }
        if (rate === null) delete next[planId]
        else next[planId] = rate
        set({ planSuccessRates: next })
      }

      /** Runs (or queues) a simulation after a plan-level change. */
      const requestRun = () => {
        if (get().autoRunSuspended) {
          set({ pendingRun: true })
          return
        }
        scheduleSimulation(0)
      }

      const defaultPlan = makePlan({
        id: DEFAULT_PLAN_ID,
        name: DEFAULT_PLAN_NAME,
        nameKey: DEFAULT_PLAN_NAME_KEY,
        params: DEFAULT_PARAMS,
        createdAt: 0,
      })

      return {
        params: DEFAULT_PARAMS,
        draftParams: null,
        isDirty: false,
        planSuccessRates: {},
        results: null,
        resultsComputedAt: null,
        isLoading: false,
        error: null,
        savedSetups: plansToSavedSetups([defaultPlan]),
        plans: [defaultPlan],
        activePlanId: DEFAULT_PLAN_ID,
        // Auto-run control
        autoRunSuspended: false,
        pendingRun: false,

        savePlanDraft: () => {
          const { plans, activePlanId, params, isDirty } = get()
          if (!isDirty) return
          if (!plans.some((plan) => plan.id === activePlanId)) return

          const timestamp = Date.now()
          const nextPlans = plans.map((plan) =>
            plan.id === activePlanId ? { ...plan, params, updatedAt: timestamp } : plan
          )

          commitPlans(nextPlans)
          set({ draftParams: null, isDirty: false, error: null })
          rememberSuccessRate(activePlanId, successRateFor(params))
        },

        revertPlanDraft: () => {
          const { activePlanId, isDirty } = get()
          if (!isDirty) return
          const plan = findPlan(activePlanId)
          if (!plan) return

          adoptPlanParams(plan)
          requestRun()
        },

        createPlan: (
          name: string,
          params?: SimulationParams,
          options?: { activate?: boolean; nameKey?: string }
        ) => {
          const { plans, params: currentParams } = get()
          if (plans.length >= MAX_PLANS) {
            set({ error: 'planLimitReached' })
            return null
          }

          const plan = makePlan({
            id: createPlanId(plans),
            name: uniquePlanName(name, plans),
            // Built-in plans (the demo) carry a key so their name follows the
            // UI language until the user renames them.
            nameKey: options?.nameKey,
            params: normalizePersistedParams(params ?? currentParams),
          })

          commitPlans([...plans, plan])
          rememberSuccessRate(plan.id, successRateFor(plan.params))

          // Background creation (stress levers): the plan is stored but the
          // user keeps editing whatever they were on.
          if (options?.activate === false) return plan.id

          // The new plan owns these params now, so the working copy is clean.
          adoptPlanParams(plan)
          requestRun()

          return plan.id
        },

        duplicatePlan: (id: string, name?: string) => {
          const { plans, activePlanId, isDirty, params } = get()
          const source = plans.find((plan) => plan.id === id)
          if (!source) return null
          if (plans.length >= MAX_PLANS) {
            set({ error: 'planLimitReached' })
            return null
          }

          // Duplicating the plan you are editing copies what is on screen, so
          // "Duplicate" doubles as a save-as for unsaved work.
          const sourceParams = id === activePlanId && isDirty ? params : source.params

          const copy = makePlan({
            id: createPlanId(plans),
            name: uniquePlanName(name ?? source.name, plans),
            params: sourceParams,
          })

          commitPlans([...plans, copy])
          adoptPlanParams(copy)
          const sourceRate = get().planSuccessRates[source.id]
          rememberSuccessRate(copy.id, typeof sourceRate === 'number' ? sourceRate : null)
          requestRun()

          return copy.id
        },

        renamePlan: (id: string, name: string) => {
          const { plans } = get()
          const trimmed = name.trim()
          if (!trimmed) return

          commitPlans(
            plans.map((plan) =>
              plan.id === id
                ? {
                    ...plan,
                    name: uniquePlanName(trimmed, plans, id),
                    nameKey: undefined,
                    updatedAt: Date.now(),
                  }
                : plan
            )
          )
        },

        deletePlan: (id: string) => {
          const { plans, activePlanId } = get()
          if (plans.length <= 1) return
          if (!plans.some((plan) => plan.id === id)) return

          const nextPlans = plans.filter((plan) => plan.id !== id)
          commitPlans(nextPlans)
          rememberSuccessRate(id, null)

          if (activePlanId === id) {
            adoptPlanParams(nextPlans[0])
            requestRun()
          }
        },

        /**
         * Activates another plan. Any working copy is dropped — callers that can
         * lose user edits (the plan switcher) prompt first.
         */
        setActivePlan: (id: string) => {
          const { plans, activePlanId, isDirty } = get()
          if (id === activePlanId && !isDirty) return

          const plan = plans.find((entry) => entry.id === id)
          if (!plan) return

          adoptPlanParams(plan)
          requestRun()
        },

        getActivePlan: () => {
          const { plans, activePlanId } = get()
          return plans.find((plan) => plan.id === activePlanId)
        },

        /**
         * Entry point for cloud sync (see `./planSync`). Everything arriving
         * here has been through the same sanitizers the persisted state gets,
         * because it came off a network that a tampered blob could reach.
         *
         * Unsaved work always wins over a remote update: while `isDirty` the
         * user keeps the plan they are editing and the params on screen, and
         * only the surrounding list is reconciled.
         */
        applySyncedPlans: (incoming: Plan[], incomingActiveId: string) => {
          const nextPlans = normalizePlans(incoming, normalizePersistedParams)
          if (nextPlans.length === 0) return false

          const { plans, activePlanId, isDirty } = get()

          const requestedActive = nextPlans.some((plan) => plan.id === incomingActiveId)
            ? incomingActiveId
            : nextPlans.some((plan) => plan.id === activePlanId)
              ? activePlanId
              : nextPlans[0].id

          // A dirty working copy pins the selection: switching plans underneath
          // an unsaved edit would strand it on a plan it does not belong to.
          const keepCurrent = isDirty && nextPlans.some((plan) => plan.id === activePlanId)
          const nextActiveId = keepCurrent ? activePlanId : requestedActive

          const unchanged =
            nextActiveId === activePlanId &&
            plans.length === nextPlans.length &&
            plans.every((plan, index) => {
              const candidate = nextPlans[index]
              return (
                plan.id === candidate.id &&
                plan.name === candidate.name &&
                plan.updatedAt === candidate.updatedAt &&
                !paramsDiffer(plan.params, candidate.params)
              )
            })

          if (unchanged) return false

          commitPlans(nextPlans)

          const activePlan = nextPlans.find((plan) => plan.id === nextActiveId)
          if (activePlan && !keepCurrent) {
            adoptPlanParams(activePlan)
            requestRun()
          } else {
            set({ activePlanId: nextActiveId })
          }

          return true
        },

        updateParams: (partial: Partial<SimulationParams>) => {
          const currentParams = get().params
          const nextOneTimeIncomes =
            partial.oneTimeIncomes !== undefined
              ? sanitizeOneTimeIncomes(partial.oneTimeIncomes)
              : Array.isArray(currentParams.oneTimeIncomes)
                ? currentParams.oneTimeIncomes
                : []
          const merged = {
            ...currentParams,
            ...partial,
            oneTimeIncomes: nextOneTimeIncomes,
          }

          /**
           * The single funnel into the flow list.
           *
           * Writes that name `cashFlows` are the new, complete intent. Writes
           * that only touch a legacy array (the sidebar's expense editor, a
           * stress lever scaling `customExpenses`) are folded into the flows
           * instead of competing with them. Either way the projections are
           * rewritten afterwards, so no consumer ever sees the two disagree.
           */
          const cashFlows =
            partial.cashFlows !== undefined
              ? sanitizeCashFlows(partial.cashFlows)
              : reconcileCashFlows({
                  cashFlows: currentParams.cashFlows,
                  customExpenses: merged.customExpenses,
                  oneTimeIncomes: merged.oneTimeIncomes,
                  currentAge: merged.currentAge,
                })

          const newParams: SimulationParams = {
            ...merged,
            cashFlows,
            customExpenses: projectCustomExpenses(cashFlows),
            oneTimeIncomes: projectOneTimeIncomes(cashFlows, merged.currentAge),
          }

          applyParams(newParams)

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

            set((state) => ({
              results,
              resultsComputedAt: Date.now(),
              isLoading: false,
              error: null,
              // A clean run describes the stored plan, so the switcher can show
              // its success rate without re-simulating.
              planSuccessRates: state.isDirty
                ? state.planSuccessRates
                : { ...state.planSuccessRates, [state.activePlanId]: results.successRate },
            }))
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
            localStorage.setItem(STORAGE_KEY(), JSON.stringify(params))
          } catch (error) {
            console.error('Failed to save parameters:', error)
            set({ error: 'Failed to save parameters' })
          }
        },

        loadFromStorage: () => {
          try {
            const stored = localStorage.getItem(STORAGE_KEY())
            if (stored) {
              applyParams(normalizePersistedParams(JSON.parse(stored) as unknown))
              // Run simulation with loaded parameters
              get().runSimulation()
            }
          } catch (error) {
            console.error('Failed to load parameters:', error)
            set({ error: 'Failed to load parameters' })
          }
        },

        // Legacy setup actions, now expressed in terms of plans so both entry
        // points (sidebar "save as" and the plan switcher) stay in sync.
        saveSetup: (name: string) => {
          get().createPlan(name)
        },

        loadSetup: (id: string) => {
          const { plans, savedSetups } = get()

          if (plans.some((plan) => plan.id === id)) {
            get().setActivePlan(id)
            return
          }

          // Pre-plan snapshot that was never migrated: import its params into
          // the active plan rather than dropping the user's data.
          const setup = savedSetups.find((entry) => entry.id === id)
          if (setup) {
            applyParams(normalizePersistedParams(setup.params))
            get().runSimulation()
          }
        },

        deleteSetup: (id: string) => {
          const { plans, savedSetups } = get()

          if (plans.some((plan) => plan.id === id)) {
            get().deletePlan(id)
            return
          }

          set({ savedSetups: savedSetups.filter((entry) => entry.id !== id) })
        },

        getSavedSetups: () => {
          const { savedSetups } = get()
          return savedSetups
        },

        clearResults: () => {
          set({
            results: null,
            resultsComputedAt: null,
            error: null,
          })
        },
      }
    },
    {
      name: BASE_STORE_KEY,
      version: STORE_VERSION,
      // v0 state has no plans. Clearing the field here stops the shallow merge
      // from keeping the store's default plan around; onRehydrateStorage then
      // rebuilds plans from the persisted params and saved setups (which may
      // also live in the legacy standalone storage key).
      migrate: (persistedState, version) => {
        let state = (
          isRecord(persistedState) ? { ...persistedState } : {}
        ) as Partial<SimulationStore>
        if (version < 1) {
          state = { ...state, plans: [], activePlanId: '' }
        }
        // v1 mirrored every edit straight into the active plan, so there is no
        // draft to recover: the persisted params already are the plan's params.
        if (version < 2) {
          state = { ...state, draftParams: null, isDirty: false, planSuccessRates: {} }
        }
        // v2 kept spending in `customExpenses` and windfalls in `oneTimeIncomes`.
        // v3 turns both into cash flows — lifetime expenses keep their ids, a
        // windfall becomes a one-off income at the age it was booked for — and
        // regenerates the two arrays as projections. Every parameter set is
        // migrated: the live params, the unsaved working copy, and each plan.
        if (version < 3) {
          state = {
            ...state,
            ...(state.params ? { params: normalizePersistedParams(state.params) } : {}),
            ...(state.draftParams
              ? { draftParams: normalizePersistedParams(state.draftParams) }
              : {}),
            ...(Array.isArray(state.plans)
              ? {
                  plans: state.plans.map((plan) =>
                    isRecord(plan)
                      ? { ...plan, params: normalizePersistedParams(plan.params) }
                      : plan
                  ) as Plan[],
                }
              : {}),
          }
        }
        return state as SimulationStore
      },
      partialize: (state) => ({
        params: state.params,
        draftParams: state.draftParams,
        planSuccessRates: state.planSuccessRates,
        results: state.results, // Persist results to avoid re-running simulation on every page load
        plans: state.plans,
        activePlanId: state.activePlanId,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            state.savedSetups = normalizeSavedSetups(state.savedSetups)

            // Load saved setups from separate storage
            try {
              const stored = localStorage.getItem(SAVED_SETUPS_KEY())
              if (stored) {
                state.savedSetups = normalizeSavedSetups(JSON.parse(stored) as unknown)
              }
            } catch (error) {
              console.error('Failed to load saved setups:', error)
            }
            if (state.params) {
              state.params = normalizePersistedParams(state.params)
            }

            // Upgrade any persisted shape to the plan model. Pre-plan state
            // becomes a "Base plan" plus one plan per saved setup; nothing the
            // user stored is discarded. The import runs at most once (guarded
            // by a marker key) so plans deleted later never reappear.
            let legacyImportDone = false
            try {
              legacyImportDone = localStorage.getItem(storageKey(BASE_PLANS_IMPORTED_KEY)) === '1'
            } catch {
              legacyImportDone = false
            }

            const bootstrapped = bootstrapPlans(
              {
                plans: state.plans,
                params: state.params ?? DEFAULT_PARAMS,
                savedSetups: state.savedSetups,
                activePlanId: state.activePlanId,
                allowLegacyImport: !legacyImportDone,
              },
              normalizePersistedParams
            )

            if (!legacyImportDone) {
              try {
                localStorage.setItem(storageKey(BASE_PLANS_IMPORTED_KEY), '1')
              } catch {
                // Storage full or unavailable: the import stays idempotent
                // because imported plans keep their original setup ids.
              }
            }

            state.plans = bootstrapped.plans
            state.activePlanId = bootstrapped.activePlanId
            state.savedSetups = plansToSavedSetups(bootstrapped.plans)

            const activePlan = bootstrapped.plans.find(
              (plan) => plan.id === bootstrapped.activePlanId
            )
            // Unsaved edits survive a reload as a visible working copy rather
            // than being silently written into (or dropped from) the plan.
            const draft = state.draftParams ? normalizePersistedParams(state.draftParams) : null
            if (activePlan) {
              if (draft && paramsDiffer(draft, activePlan.params)) {
                state.params = draft
                state.draftParams = draft
                state.isDirty = true
              } else {
                state.params = activePlan.params
                state.draftParams = null
                state.isDirty = false
              }
            } else {
              state.draftParams = null
              state.isDirty = false
            }

            state.planSuccessRates = sanitizePlanSuccessRates(state.planSuccessRates)

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

// Plan helpers
export const usePlans = () => useSimulationStore((state) => state.plans)
export const useActivePlanId = () => useSimulationStore((state) => state.activePlanId)
export const useCreatePlan = () => useSimulationStore((state) => state.createPlan)
export const useRenamePlan = () => useSimulationStore((state) => state.renamePlan)
export const useDuplicatePlan = () => useSimulationStore((state) => state.duplicatePlan)
export const useDeletePlan = () => useSimulationStore((state) => state.deletePlan)
export const useSetActivePlan = () => useSimulationStore((state) => state.setActivePlan)

// Working-copy (draft) helpers
export const usePlanIsDirty = () => useSimulationStore((state) => state.isDirty)
export const useSavePlanDraft = () => useSimulationStore((state) => state.savePlanDraft)
export const useRevertPlanDraft = () => useSimulationStore((state) => state.revertPlanDraft)
export const usePlanSuccessRates = () => useSimulationStore((state) => state.planSuccessRates)
export const useActivePlan = () =>
  useSimulationStore((state) => state.plans.find((plan) => plan.id === state.activePlanId))
