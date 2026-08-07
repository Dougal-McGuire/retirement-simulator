import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  SimulationParams,
  SimulationResults,
  SimulationStore,
  SavedSetup,
  DEFAULT_PARAMS,
  MAX_PLANS,
  OneTimeIncome,
  CustomExpense,
  isWithdrawalStrategy,
  type Plan,
} from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import {
  bootstrapPlans,
  createPlanId,
  DEFAULT_PLAN_ID,
  DEFAULT_PLAN_NAME,
  DEFAULT_PLAN_NAME_KEY,
  makePlan,
  plansToSavedSetups,
  uniquePlanName,
} from '@/lib/stores/plans'
import {
  BASE_PARAMS_KEY,
  BASE_SAVED_SETUPS_KEY,
  BASE_STORE_KEY,
  storageKey,
} from '@/lib/stores/persistenceKey'

// Resolved lazily: when a Google account is signed in these keys gain a
// per-user suffix so several accounts can share one browser without seeing
// each other's plans. Signed out they resolve to the original key names, so
// existing local data is untouched. See `./persistenceKey`.
const STORAGE_KEY = () => storageKey(BASE_PARAMS_KEY)
const SAVED_SETUPS_KEY = () => storageKey(BASE_SAVED_SETUPS_KEY)

/** v0: params + savedSetups. v1: first-class plans. */
const STORE_VERSION = 1

/**
 * Marks that pre-plan saved setups have been imported as plans, so the one-time
 * migration never resurrects plans the user deleted afterwards.
 */
const BASE_PLANS_IMPORTED_KEY = 'retirement-simulator-plans-imported'

type NumericParamKey = keyof Omit<
  SimulationParams,
  'customExpenses' | 'oneTimeIncomes' | 'withdrawalStrategy'
>

type PersistedParams = Partial<Record<NumericParamKey, unknown>> & {
  annualExpenses?: unknown
  customExpenses?: unknown
  monthlyExpenses?: unknown
  oneTimeIncomes?: unknown
  withdrawalStrategy?: unknown
}

const numericParamKeys = [
  'currentAge',
  'retirementAge',
  'legalRetirementAge',
  'endAge',
  'currentAssets',
  'annualSavings',
  'annualSavingsGrowthRate',
  'monthlyPension',
  'averageROI',
  'roiVolatility',
  'averageInflation',
  'inflationVolatility',
  'capitalGainsTax',
  'dsWithdrawalRate',
  'dsCeilingRate',
  'dsFloorRate',
  'simulationRuns',
] satisfies NumericParamKey[]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const toPersistedParams = (params: unknown): PersistedParams =>
  isRecord(params) ? (params as PersistedParams) : {}

const toFiniteNumber = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback
  if (typeof value === 'string' && value.trim() === '') return fallback

  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

const sanitizeNumericParams = (
  params: PersistedParams
): Partial<Record<NumericParamKey, number>> => {
  const sanitized: Partial<Record<NumericParamKey, number>> = {}

  numericParamKeys.forEach((key) => {
    if (params[key] === undefined) return
    sanitized[key] = toFiniteNumber(params[key], DEFAULT_PARAMS[key])
  })

  return sanitized
}

const sanitizeWithdrawalStrategy = (strategy: unknown): SimulationParams['withdrawalStrategy'] =>
  isWithdrawalStrategy(strategy) ? strategy : DEFAULT_PARAMS.withdrawalStrategy

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
    withdrawalStrategy: rawWithdrawalStrategy,
  } = params
  const sanitizedCustomExpenses = sanitizeCustomExpenses(rawCustomExpenses)
  const migratedCustomExpenses = migrateToCustomExpenses(params)
  const customExpenses = Array.isArray(rawCustomExpenses)
    ? sanitizedCustomExpenses
    : migratedCustomExpenses

  return {
    ...DEFAULT_PARAMS,
    ...sanitizeNumericParams(params),
    withdrawalStrategy: sanitizeWithdrawalStrategy(rawWithdrawalStrategy),
    oneTimeIncomes: sanitizeOneTimeIncomes(rawOneTimeIncomes),
    customExpenses,
  }
}

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

      /**
       * Plans are the single source of truth for parameter sets. `savedSetups`
       * is kept as a mirror so the legacy save/load controls keep working.
       */
      const commitPlans = (plans: Plan[]) => {
        set({ plans, savedSetups: plansToSavedSetups(plans) })
      }

      /** Applies params to the store and mirrors them into the active plan. */
      const applyParams = (nextParams: SimulationParams) => {
        const { plans, activePlanId } = get()
        const timestamp = Date.now()
        const nextPlans = plans.map((plan) =>
          plan.id === activePlanId ? { ...plan, params: nextParams, updatedAt: timestamp } : plan
        )

        set({
          params: nextParams,
          error: null,
          plans: nextPlans,
          savedSetups: plansToSavedSetups(nextPlans),
        })
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
        results: null,
        isLoading: false,
        error: null,
        savedSetups: plansToSavedSetups([defaultPlan]),
        plans: [defaultPlan],
        activePlanId: DEFAULT_PLAN_ID,
        // Auto-run control
        autoRunSuspended: false,
        pendingRun: false,

        createPlan: (name: string, params?: SimulationParams) => {
          const { plans, params: currentParams } = get()
          if (plans.length >= MAX_PLANS) {
            set({ error: 'planLimitReached' })
            return null
          }

          const plan = makePlan({
            id: createPlanId(plans),
            name: uniquePlanName(name, plans),
            params: normalizePersistedParams(params ?? currentParams),
          })

          commitPlans([...plans, plan])
          set({ activePlanId: plan.id, params: plan.params, error: null })
          requestRun()

          return plan.id
        },

        duplicatePlan: (id: string, name?: string) => {
          const { plans } = get()
          const source = plans.find((plan) => plan.id === id)
          if (!source) return null
          if (plans.length >= MAX_PLANS) {
            set({ error: 'planLimitReached' })
            return null
          }

          const copy = makePlan({
            id: createPlanId(plans),
            name: uniquePlanName(name ?? source.name, plans),
            params: source.params,
          })

          commitPlans([...plans, copy])
          set({ activePlanId: copy.id, params: copy.params, error: null })
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

          if (activePlanId === id) {
            const nextActive = nextPlans[0]
            set({ activePlanId: nextActive.id, params: nextActive.params, error: null })
            requestRun()
          }
        },

        setActivePlan: (id: string) => {
          const { plans, activePlanId } = get()
          if (id === activePlanId) return

          const plan = plans.find((entry) => entry.id === id)
          if (!plan) return

          set({ activePlanId: plan.id, params: plan.params, error: null })
          requestRun()
        },

        getActivePlan: () => {
          const { plans, activePlanId } = get()
          return plans.find((plan) => plan.id === activePlanId)
        },

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
        const state = (isRecord(persistedState) ? persistedState : {}) as Partial<SimulationStore>
        if (version < 1) {
          return { ...state, plans: [], activePlanId: '' } as SimulationStore
        }
        return state as SimulationStore
      },
      partialize: (state) => ({
        params: state.params,
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
            if (activePlan) {
              state.params = activePlan.params
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

// Plan helpers
export const usePlans = () => useSimulationStore((state) => state.plans)
export const useActivePlanId = () => useSimulationStore((state) => state.activePlanId)
export const useCreatePlan = () => useSimulationStore((state) => state.createPlan)
export const useRenamePlan = () => useSimulationStore((state) => state.renamePlan)
export const useDuplicatePlan = () => useSimulationStore((state) => state.duplicatePlan)
export const useDeletePlan = () => useSimulationStore((state) => state.deletePlan)
export const useSetActivePlan = () => useSimulationStore((state) => state.setActivePlan)
