/**
 * Persisted-parameter normalisation.
 *
 * Extracted from `simulationStore` so that *server* code (the cloud plan store
 * behind `/api/plans`) can sanitise a blob without importing the Zustand store,
 * the simulation engine or anything that expects a browser. The store keeps
 * re-exporting `normalizePersistedParams`, so existing importers are unchanged.
 */

import {
  DEFAULT_PARAMS,
  isHouseholdType,
  isMarketModel,
  isWithdrawalStrategy,
  type CustomExpense,
  type OneTimeIncome,
  type SimulationParams,
} from '@/types'
import {
  projectCustomExpenses,
  projectOneTimeIncomes,
  reconcileCashFlows,
} from '@/lib/simulation/cashFlows'

type NumericParamKey = keyof Omit<
  SimulationParams,
  | 'customExpenses'
  | 'oneTimeIncomes'
  | 'cashFlows'
  | 'withdrawalStrategy'
  | 'marketModel'
  | 'glidePathEnabled'
  | 'householdType'
>

export type PersistedParams = Partial<Record<NumericParamKey, unknown>> & {
  annualExpenses?: unknown
  customExpenses?: unknown
  monthlyExpenses?: unknown
  oneTimeIncomes?: unknown
  cashFlows?: unknown
  withdrawalStrategy?: unknown
  marketModel?: unknown
  glidePathEnabled?: unknown
  householdType?: unknown
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
  'taxAllowanceAnnual',
  'equityFundExemption',
  'pensionTaxablePortion',
  'pensionTaxRate',
  'legacyTargetReal',
  'equityAllocationStart',
  'equityAllocationEnd',
  'bondReturn',
  'bondVolatility',
  'dsWithdrawalRate',
  'dsCeilingRate',
  'dsFloorRate',
  'spendingFloorReal',
  'simulationRuns',
] satisfies NumericParamKey[]

export const isRecord = (value: unknown): value is Record<string, unknown> =>
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

const sanitizeMarketModel = (model: unknown): SimulationParams['marketModel'] =>
  isMarketModel(model) ? model : DEFAULT_PARAMS.marketModel

const sanitizeHouseholdType = (value: unknown): SimulationParams['householdType'] =>
  isHouseholdType(value) ? value : DEFAULT_PARAMS.householdType

/** Persisted booleans arrive as `true`/`false`, `"true"`/`"false"` or nothing. */
const sanitizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export const sanitizeOneTimeIncomes = (incomes: unknown): OneTimeIncome[] => {
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

export const sanitizeCustomExpenses = (expenses: unknown): CustomExpense[] => {
  if (!Array.isArray(expenses)) return []
  return expenses
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const expense = entry as {
        id?: unknown
        name?: unknown
        nameKey?: unknown
        amount?: unknown
        interval?: unknown
      }
      const rawId = typeof expense.id === 'string' ? expense.id : ''
      const rawName = typeof expense.name === 'string' ? expense.name : ''
      // Preserved so a seeded expense keeps following the UI language across a
      // round trip through storage (see `CashFlow.nameKey`).
      const rawNameKey =
        typeof expense.nameKey === 'string' && expense.nameKey.trim() !== ''
          ? expense.nameKey.trim()
          : undefined
      const rawAmount = Number(expense.amount)
      const rawInterval =
        expense.interval === 'monthly' || expense.interval === 'annual'
          ? expense.interval
          : 'monthly'

      if (!rawId || !rawName || !Number.isFinite(rawAmount) || rawAmount <= 0) return null

      return {
        id: rawId,
        name: rawName,
        ...(rawNameKey !== undefined ? { nameKey: rawNameKey } : {}),
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

/**
 * Turns anything that came out of localStorage (or an older app version) into a
 * complete, valid parameter set.
 *
 * Exported for `paramRegistration.test.ts`: every field of `SimulationParams`
 * has to survive this round-trip, otherwise a newly added parameter silently
 * resets to its default on every reload.
 */
export const normalizePersistedParams = (persistedParams: unknown): SimulationParams => {
  const params = toPersistedParams(persistedParams)
  const {
    annualExpenses: _annualExpenses,
    customExpenses: rawCustomExpenses,
    monthlyExpenses: _monthlyExpenses,
    oneTimeIncomes: rawOneTimeIncomes,
    withdrawalStrategy: rawWithdrawalStrategy,
    marketModel: rawMarketModel,
    glidePathEnabled: rawGlidePathEnabled,
    householdType: rawHouseholdType,
  } = params
  const sanitizedCustomExpenses = sanitizeCustomExpenses(rawCustomExpenses)
  const migratedCustomExpenses = migrateToCustomExpenses(params)
  const customExpenses = Array.isArray(rawCustomExpenses)
    ? sanitizedCustomExpenses
    : migratedCustomExpenses
  const oneTimeIncomes = sanitizeOneTimeIncomes(rawOneTimeIncomes)
  const numerics = sanitizeNumericParams(params)
  const currentAge = numerics.currentAge ?? DEFAULT_PARAMS.currentAge

  /**
   * Unified cash flows (store v3). Anything persisted before them has none, so
   * the two legacy arrays *are* the plan and get folded in; from v3 on they are
   * projections and simply agree with the flows already stored. Either way the
   * three fields leave this function describing one and the same plan.
   */
  const cashFlows = reconcileCashFlows({
    cashFlows: params.cashFlows,
    customExpenses,
    oneTimeIncomes,
    currentAge,
  })

  return {
    ...DEFAULT_PARAMS,
    ...numerics,
    withdrawalStrategy: sanitizeWithdrawalStrategy(rawWithdrawalStrategy),
    marketModel: sanitizeMarketModel(rawMarketModel),
    glidePathEnabled: sanitizeBoolean(rawGlidePathEnabled, DEFAULT_PARAMS.glidePathEnabled),
    householdType: sanitizeHouseholdType(rawHouseholdType),
    cashFlows,
    oneTimeIncomes: projectOneTimeIncomes(cashFlows, currentAge),
    customExpenses: projectCustomExpenses(cashFlows),
  }
}
