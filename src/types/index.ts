export const WITHDRAWAL_STRATEGIES = ['fixedReal', 'vanguardDynamic'] as const

export type WithdrawalStrategy = (typeof WITHDRAWAL_STRATEGIES)[number]

export const isWithdrawalStrategy = (value: unknown): value is WithdrawalStrategy =>
  typeof value === 'string' && (WITHDRAWAL_STRATEGIES as readonly string[]).includes(value)

/**
 * How a year's market outcome is produced.
 *
 * - `monteCarlo`: independent lognormal draws from the plan's own mean/volatility
 *   assumptions (the default).
 * - `historical`: replays a real long-run return series, one path per available
 *   start year. Deterministic — the ROI, volatility and inflation assumptions are
 *   ignored, the history supplies all three.
 */
export const MARKET_MODELS = ['monteCarlo', 'historical'] as const

export type MarketModel = (typeof MARKET_MODELS)[number]

export const isMarketModel = (value: unknown): value is MarketModel =>
  typeof value === 'string' && (MARKET_MODELS as readonly string[]).includes(value)

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
  /**
   * Expected arithmetic return. With `glidePathEnabled` this is the *equity*
   * assumption; the bond sleeve uses `bondReturn`/`bondVolatility`.
   */
  averageROI: number
  /** Return volatility — the equity assumption when the glide path is on. */
  roiVolatility: number
  averageInflation: number
  inflationVolatility: number
  capitalGainsTax: number

  // Market model
  /** Monte Carlo draws vs. replaying a real historical return series. */
  marketModel: MarketModel

  // Asset allocation glide path
  /**
   * Blend equities and bonds with an allocation that slides from
   * `equityAllocationStart` to `equityAllocationEnd` over the accumulation
   * years, then holds flat through retirement. Off by default, in which case
   * the portfolio is 100% "equity" and the model is unchanged.
   */
  glidePathEnabled: boolean
  /** Equity share in the plan's first year (0–1). */
  equityAllocationStart: number
  /** Equity share from the retirement year onwards (0–1). */
  equityAllocationEnd: number
  /** Expected arithmetic return of the bond sleeve. */
  bondReturn: number
  /** Volatility of the bond sleeve. */
  bondVolatility: number

  // Expenses (legacy projection of `cashFlows`; see below)
  customExpenses: CustomExpense[]

  /**
   * The single source of truth for everything that flows in or out on top of
   * savings and pension: recurring or one-off, income or expense, optionally
   * limited to an age window.
   *
   * `customExpenses` and `oneTimeIncomes` are kept as *derived projections* of
   * the lifetime-expense and one-off-income subsets so every older consumer
   * (report transformer, insights, saved plans) keeps working unchanged. The
   * store regenerates them on every write — never edit them independently.
   */
  cashFlows: CashFlow[]

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
  /**
   * Same series expressed in today's purchasing power. Each Monte Carlo path is
   * deflated by its own realised inflation *before* percentiles are taken, so
   * these are genuine quantiles of the real-terms distribution rather than the
   * nominal band divided by an average price level.
   *
   * Optional: results persisted before this field existed lack it, and the UI
   * falls back to the nominal series.
   */
  assetPercentilesReal?: PercentileData
  spendingPercentilesReal?: PercentileData
  /**
   * Median realised price level per age, relative to the plan's first year
   * (index 0 is always 1). Used to express nominally fixed amounts — a pension
   * quoted in today's euros — in real terms without re-running the simulation.
   */
  inflationIndexP50?: number[]
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
  /**
   * The working copy the simulation always runs on: the active plan's params
   * with any unsaved edits layered on top. Never write to it directly — use
   * `updateParams`, which keeps `draftParams`/`isDirty` in sync.
   */
  params: SimulationParams
  /**
   * Unsaved edits sandboxed over the active plan. `null` while the working copy
   * matches the stored plan, so a plan is only ever mutated on an explicit save.
   */
  draftParams: SimulationParams | null
  /** True while `draftParams` differs from the active plan's stored params. */
  isDirty: boolean
  /** Last known success rate per plan id, used to enrich the plan switcher. */
  planSuccessRates: Record<string, number>
  results: SimulationResults | null
  isLoading: boolean
  error: string | null
  savedSetups: SavedSetup[]
  plans: Plan[]
  activePlanId: string
  autoRunSuspended: boolean
  pendingRun: boolean

  // Draft (working copy) actions
  /** Commits the working copy into the active plan. No-op when clean. */
  savePlanDraft: () => void
  /** Throws the working copy away and restores the active plan's params. */
  revertPlanDraft: () => void

  // Plan actions
  /**
   * Creates a plan from `params` (defaults to the current params) and activates
   * it. Pass `{ activate: false }` to add the plan in the background — used by
   * the stress levers, which must not hijack the plan the user is editing.
   */
  createPlan: (
    name: string,
    params?: SimulationParams,
    options?: { activate?: boolean }
  ) => string | null
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

export const CASHFLOW_FREQUENCIES = ['monthly', 'annual', 'once'] as const

export type CashFlowFrequency = (typeof CASHFLOW_FREQUENCIES)[number]

export const isCashFlowFrequency = (value: unknown): value is CashFlowFrequency =>
  typeof value === 'string' && (CASHFLOW_FREQUENCIES as readonly string[]).includes(value)

export const CASHFLOW_KINDS = ['income', 'expense'] as const

export type CashFlowKind = (typeof CASHFLOW_KINDS)[number]

export const isCashFlowKind = (value: unknown): value is CashFlowKind =>
  typeof value === 'string' && (CASHFLOW_KINDS as readonly string[]).includes(value)

/**
 * One money movement in the plan: rent that arrives for eight years, a roof
 * repair in a single year, groceries for life.
 *
 * Amounts are quoted **per occurrence in today's euros**. Unless
 * `inflationLinked` is explicitly false they are re-priced with the plan's
 * realised inflation, so "€1,200 of groceries" stays €1,200 of groceries in
 * 2045 too.
 */
export interface CashFlow {
  id: string
  kind: CashFlowKind
  name: string
  /** Amount per occurrence, in today's euros. */
  amount: number
  frequency: CashFlowFrequency
  /** First age the flow applies to. Undefined = from `currentAge`. */
  startAge?: number
  /** Last age the flow applies to. Undefined = through `endAge`; ignored for `once`. */
  endAge?: number
  /** Default true. False pins the amount to a fixed nominal € figure. */
  inflationLinked?: boolean
  /** Extra real growth per year on top of inflation (0 by default). */
  growthRate?: number
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
  marketModel: 'monteCarlo',
  glidePathEnabled: false,
  equityAllocationStart: 0.8,
  equityAllocationEnd: 0.4,
  bondReturn: 0.03,
  bondVolatility: 0.06,
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
  // The same eight expenses as unified cash flows — `customExpenses` above is
  // the lifetime-expense projection of this list, regenerated on every write.
  cashFlows: [
    { id: 'health', kind: 'expense', name: 'Health Insurance', amount: 1300, frequency: 'monthly' },
    { id: 'food', kind: 'expense', name: 'Groceries', amount: 1200, frequency: 'monthly' },
    {
      id: 'entertainment',
      kind: 'expense',
      name: 'Entertainment',
      amount: 300,
      frequency: 'monthly',
    },
    { id: 'shopping', kind: 'expense', name: 'Shopping', amount: 500, frequency: 'monthly' },
    { id: 'utilities', kind: 'expense', name: 'Utilities', amount: 400, frequency: 'monthly' },
    { id: 'vacations', kind: 'expense', name: 'Vacations', amount: 12000, frequency: 'annual' },
    { id: 'repairs', kind: 'expense', name: 'Home Repairs', amount: 5000, frequency: 'annual' },
    {
      id: 'carMaintenance',
      kind: 'expense',
      name: 'Car Maintenance',
      amount: 1500,
      frequency: 'annual',
    },
  ],
  withdrawalStrategy: 'vanguardDynamic',
  dsWithdrawalRate: 0.05,
  dsCeilingRate: 0.05,
  dsFloorRate: -0.025,
  simulationRuns: 500,
}
