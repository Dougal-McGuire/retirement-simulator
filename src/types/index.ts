export const WITHDRAWAL_STRATEGIES = ['fixedReal', 'vanguardDynamic'] as const

export type WithdrawalStrategy = (typeof WITHDRAWAL_STRATEGIES)[number]

export const isWithdrawalStrategy = (value: unknown): value is WithdrawalStrategy =>
  typeof value === 'string' && (WITHDRAWAL_STRATEGIES as readonly string[]).includes(value)

// Simulation parameter interfaces
export interface SimulationParams {
  // Personal information
  currentAge: number
  retirementAge: number
  legalRetirementAge: number
  endAge: number

  // Assets & Income
  currentAssets: number
  annualSavings: number
  annualSavingsGrowthRate: number
  monthlyPension: number
  oneTimeIncomes: OneTimeIncome[]

  // Market parameters
  averageROI: number
  roiVolatility: number
  averageInflation: number
  inflationVolatility: number
  capitalGainsTax: number

  // Expenses
  customExpenses: CustomExpense[]

  // Withdrawal strategy
  withdrawalStrategy: WithdrawalStrategy
  dsWithdrawalRate: number
  dsCeilingRate: number
  dsFloorRate: number

  // Simulation settings
  simulationRuns: number
}

// Results interfaces
export interface PercentileData {
  p10: number[]
  p20: number[]
  p50: number[]
  p80: number[]
  p90: number[]
}

export interface SimulationResults {
  ages: number[]
  assetPercentiles: PercentileData
  spendingPercentiles: PercentileData
  successRate: number
  /**
   * Fraction of runs (0..1) whose assets were exhausted at or before each age.
   * Optional because results persisted before this field existed lack it.
   */
  depletionByAge?: number[]
  params: SimulationParams
}

// Form step interfaces
export interface PersonalInfoStep {
  currentAge: number
  retirementAge: number
  legalRetirementAge: number
  endAge: number
}

export interface AssetsIncomeStep {
  currentAssets: number
  annualSavings: number
  annualSavingsGrowthRate: number
  monthlyPension: number
  oneTimeIncomes: OneTimeIncome[]
}

export interface ExpensesStep {
  customExpenses: CustomExpense[]
}

export interface MarketAssumptionsStep {
  averageROI: number
  roiVolatility: number
  averageInflation: number
  inflationVolatility: number
  capitalGainsTax: number
  simulationRuns: number
}

// Saved setup interface (legacy snapshot shape, kept as a view over plans)
export interface SavedSetup {
  id: string
  name: string
  timestamp: number
  params: SimulationParams
}

/**
 * A first-class, named plan. Every plan owns a full parameter set; the active
 * plan is the one the dashboard renders and the parameter controls edit.
 */
export interface Plan {
  id: string
  name: string
  /**
   * Translation key for built-in plan names (e.g. the migrated "Base plan").
   * Cleared as soon as the user renames the plan, so user text always wins.
   */
  nameKey?: string
  params: SimulationParams
  createdAt: number
  updatedAt: number
}

/** Upper bound on stored plans (10 legacy setups + base plan + headroom). */
export const MAX_PLANS = 12

/** Maximum number of plans that can be compared side by side. */
export const MAX_COMPARISON_PLANS = 3

// State management interfaces
export interface SimulationStore {
  params: SimulationParams
  results: SimulationResults | null
  isLoading: boolean
  error: string | null
  savedSetups: SavedSetup[]
  plans: Plan[]
  activePlanId: string
  autoRunSuspended: boolean
  pendingRun: boolean

  // Plan actions
  /** Creates a plan from `params` (defaults to the current params) and activates it. */
  createPlan: (name: string, params?: SimulationParams) => string | null
  renamePlan: (id: string, name: string) => void
  /** Copies a plan (params included) under a new name and activates the copy. */
  duplicatePlan: (id: string, name?: string) => string | null
  deletePlan: (id: string) => void
  setActivePlan: (id: string) => void
  getActivePlan: () => Plan | undefined

  // Actions
  updateParams: (partial: Partial<SimulationParams>) => void
  runSimulation: () => Promise<void>
  setAutoRunSuspended: (suspended: boolean) => void
  saveToStorage: () => void
  loadFromStorage: () => void
  saveSetup: (name: string) => void
  loadSetup: (id: string) => void
  deleteSetup: (id: string) => void
  getSavedSetups: () => SavedSetup[]
  clearResults: () => void
}

export interface OneTimeIncome {
  age: number
  amount: number
  name: string
}

export const EXPENSE_INTERVALS = ['monthly', 'annual'] as const

export type ExpenseInterval = (typeof EXPENSE_INTERVALS)[number]

export interface CustomExpense {
  id: string
  name: string
  amount: number
  interval: ExpenseInterval
}

// Chart data interfaces
export interface ChartDataPoint {
  age: number
  assets_p10: number
  assets_p20: number
  assets_p50: number
  assets_p80: number
  assets_p90: number
  spending_p10: number
  spending_p50: number
  spending_p90: number
  withdrawal_rate_p50: number | null
  monthly_savings_p50: number | null
}

declare global {
  interface Window {
    __APPLY_TOC__?: () => void
  }
}

// Default values
export const DEFAULT_PARAMS: SimulationParams = {
  currentAge: 55,
  retirementAge: 60,
  legalRetirementAge: 67,
  endAge: 90,
  currentAssets: 630000,
  annualSavings: 48000,
  annualSavingsGrowthRate: 0.02,
  monthlyPension: 5000,
  oneTimeIncomes: [],
  averageROI: 0.07,
  roiVolatility: 0.15,
  averageInflation: 0.025,
  inflationVolatility: 0.01,
  capitalGainsTax: 26.25,
  customExpenses: [
    { id: 'health', name: 'Health Insurance', amount: 1300, interval: 'monthly' },
    { id: 'food', name: 'Groceries', amount: 1200, interval: 'monthly' },
    { id: 'entertainment', name: 'Entertainment', amount: 300, interval: 'monthly' },
    { id: 'shopping', name: 'Shopping', amount: 500, interval: 'monthly' },
    { id: 'utilities', name: 'Utilities', amount: 400, interval: 'monthly' },
    { id: 'vacations', name: 'Vacations', amount: 12000, interval: 'annual' },
    { id: 'repairs', name: 'Home Repairs', amount: 5000, interval: 'annual' },
    { id: 'carMaintenance', name: 'Car Maintenance', amount: 1500, interval: 'annual' },
  ],
  withdrawalStrategy: 'vanguardDynamic',
  dsWithdrawalRate: 0.05,
  dsCeilingRate: 0.05,
  dsFloorRate: -0.025,
  simulationRuns: 500,
}
