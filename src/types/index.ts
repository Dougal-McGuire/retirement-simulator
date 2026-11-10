import { besteuerungsanteil } from '@/lib/simulation/germanTax'

/**
 * The withdrawal-strategy library.
 *
 * Order is the display order of the strategy picker: from the most predictable
 * rule to the most market-responsive one.
 *
 * - `fixedReal`: spend the plan's budget, inflation-linked, whatever the market
 *   does. Maximum spending stability, maximum depletion risk.
 * - `vanguardDynamic`: what is affordable is the year's other income plus
 *   `dsWithdrawalRate` of the prior year-end portfolio; spending moves towards
 *   it, but never more than `dsCeilingRate` up or `dsFloorRate` down versus
 *   last year's inflation-adjusted spending.
 * - `guytonKlinger`: inflation-linked like `fixedReal`, with two guardrails
 *   that cut or raise spending by 10% once the portfolio's withdrawal rate
 *   (spending minus other income, over the portfolio) has drifted ±20% away
 *   from `dsWithdrawalRate`.
 * - `percentOfPortfolio`: the portfolio pays `dsWithdrawalRate` of itself every
 *   year, on top of the other income. The rule alone cannot deplete it — a
 *   `spendingFloorReal` or the plan's scheduled expenses can — and spending
 *   swings with the market.
 *
 * "Other income" is the year's net pensions and recurring income. The rules
 * govern the portfolio-funded part of spending only; see
 * `docs/specs/2026-11-09-withdrawal-rules-with-income.md`.
 */
export const WITHDRAWAL_STRATEGIES = [
  'fixedReal',
  'vanguardDynamic',
  'guytonKlinger',
  'percentOfPortfolio',
] as const

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

/**
 * Who the plan is taxed as. German investment income is sheltered by the
 * *Sparerpauschbetrag*, and a jointly assessed couple gets exactly twice the
 * single allowance — the only thing this switch does.
 */
export const HOUSEHOLD_TYPES = ['single', 'couple'] as const

export type HouseholdType = (typeof HOUSEHOLD_TYPES)[number]

export const isHouseholdType = (value: unknown): value is HouseholdType =>
  typeof value === 'string' && (HOUSEHOLD_TYPES as readonly string[]).includes(value)

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
  /**
   * Projection of the statutory pension: the monthly amount of the `pension`
   * cash flow with id `pension-statutory`, kept in sync like `customExpenses`.
   * Writing it edits that flow; other pensions live only in `cashFlows`.
   */
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
  /** Abgeltungsteuer incl. Soli, in percentage points (e.g. 26.375). */
  capitalGainsTax: number

  // German investment & pension taxation
  /**
   * Sparerpauschbetrag: tax-free investment income per year, in nominal euros.
   * Doubled for a `couple`. Refills every calendar year; 0 switches it off.
   */
  taxAllowanceAnnual: number
  /** Single or jointly assessed — the latter doubles `taxAllowanceAnnual`. */
  householdType: HouseholdType
  /**
   * Teilfreistellung: the share of a realised equity-fund gain that is exempt
   * from Abgeltungsteuer (0.30 for an equity fund, 0.15 for a mixed one, 0 for
   * anything without the partial exemption).
   */
  equityFundExemption: number
  /**
   * Besteuerungsanteil: the share of the statutory pension that counts as
   * taxable income for this cohort.
   */
  pensionTaxablePortion: number
  /** Effective income-tax rate applied to the taxable part of the pension. */
  pensionTaxRate: number

  // Goals
  /**
   * Bequest goal in *today's* euros. A run only counts as a success when it
   * never depletes AND its real terminal assets clear this bar. 0 disables the
   * goal, in which case success is plain survival.
   */
  legacyTargetReal: number

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
  /**
   * Target withdrawal rate: the share of the portfolio a rule takes per year,
   * on top of pensions and recurring income. Read by `vanguardDynamic` (the
   * rate it aims at), `guytonKlinger` (the rate its guardrails are measured
   * against) and `percentOfPortfolio` (the rate it takes outright). Ignored by
   * `fixedReal`.
   */
  dsWithdrawalRate: number
  /** `vanguardDynamic` only: largest real raise versus last year (0.05 = +5%). */
  dsCeilingRate: number
  /** `vanguardDynamic` only: largest real cut versus last year (−0.025 = −2.5%). */
  dsFloorRate: number
  /**
   * `percentOfPortfolio` only: a spending floor in **today's** euros per year.
   * The percentage rule alone can shrink spending without limit after a crash;
   * this is the "whatever happens I still spend this much" line, re-priced with
   * the path's realised inflation. 0 (the default) switches it off.
   */
  spendingFloorReal: number

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

/** Annual booked amounts. Means across paths are additive; percentiles are not. */
export interface AnnualCashFlow {
  openingAssets: number
  investmentReturn: number
  savings: number
  /** All pension/other income including one-off deposits, before income tax. */
  incomeGross: number
  incomeTax: number
  capitalGainsTax: number
  /** Requested spending; shortfall is the part that could not be funded. */
  expenses: number
  portfolioWithdrawal: number
  portfolioContribution: number
  shortfall: number
  closingAssets: number
  /**
   * Ledger detail, booked by the engine alongside the totals above so the
   * cash-flow diagram never has to re-derive it. Optional: results persisted
   * before these existed lack them, and consumers fall back to the totals.
   *
   * `pensionGross` and `oneOffIncomeGross` are parts of `incomeGross`;
   * `pensionTax` and `oneOffIncomeTax` are parts of `incomeTax`; the rest of
   * each is other scheduled income (part-time work, rent, …) and its tax.
   */
  pensionGross?: number
  pensionTax?: number
  oneOffIncomeGross?: number
  oneOffIncomeTax?: number
  /** Part of `expenses` from scheduled flows (windows, one-offs); the rest is the baseline budget. */
  scheduledExpenses?: number
  /**
   * The withdrawal rule's own numbers, so a displayed withdrawal rate is the
   * rate the rule used and not a re-derivation: the part of the baseline
   * spending the portfolio pays (net of pensions and recurring income, before
   * capital gains tax, without scheduled expenses) and the portfolio value the
   * rule measured it against (prior year-end assets plus the year's one-off
   * deposits). Both 0 before retirement. `ruleWithdrawal ÷ rulePortfolio` of
   * the mean rows is the mean rule rate; under `percentOfPortfolio` without a
   * binding floor it is `dsWithdrawalRate` at every age.
   */
  ruleWithdrawal?: number
  rulePortfolio?: number
}

export interface SimulationResults {
  ages: number[]
  assetPercentiles: PercentileData
  /**
   * Monthly-equivalent spending that was actually **paid** in each year: the
   * requested spending minus that year's shortfall. A path whose portfolio is
   * gone shows what its income still covers, not the budget it asked for.
   * (`cashFlowMeans[].expenses` keeps the request, next to the shortfall.)
   */
  spendingPercentiles: PercentileData
  /**
   * Same series expressed in today's purchasing power. Each Monte Carlo path is
   * deflated by its own realised inflation *before* percentiles are taken, so
   * these are genuine quantiles of the real-terms distribution rather than the
   * nominal band divided by an average price level.
   *
   * The two series sit at different points of the year and are deflated
   * accordingly. An asset value is the balance at the **end** of that age's
   * year and is divided by the price level at the end of that year. Spending
   * is paid **during** the year, at the level the year opened with. A
   * portfolio that earns exactly inflation therefore reads flat in real terms.
   *
   * Optional: results persisted before this field existed lack it, and the UI
   * falls back to the nominal series.
   */
  assetPercentilesReal?: PercentileData
  spendingPercentilesReal?: PercentileData
  /**
   * Median realised price level at the **start** of each age's year, relative
   * to the plan's first year (index 0 is always 1): what that year's flows are
   * priced at. Used to express nominally fixed amounts — a pension quoted in
   * euros — in real terms without re-running the simulation. A closing
   * balance of age `i` belongs to the level of index `i + 1`.
   */
  inflationIndexP50?: number[]
  /**
   * Share of runs (0..100) that met the plan's goal: every year's spending was
   * funded **and**, when `legacyTargetReal` is set, at least that much was
   * left in today's euros.
   *
   * "Funded" means no year's shortfall exceeded 1 % of the spending requested
   * for it (`UNFUNDED_SPENDING_TOLERANCE`). The balance reaching zero is not a
   * failure by itself: a household whose pension covers its budget succeeds
   * with no portfolio at all.
   */
  successRate: number
  /**
   * Share of runs (0..100) in which every year's spending was funded, ignoring
   * any bequest goal. Equal to `successRate` when `legacyTargetReal` is 0.
   *
   * Optional: results persisted before this field existed lack it, and every
   * consumer falls back to `successRate`.
   */
  depletionSuccessRate?: number
  /**
   * Median share of gross withdrawals lost to capital gains tax across runs
   * (0..1). Optional for the same reason. Undefined when no run ever had to
   * sell anything.
   */
  withdrawalTaxDrag?: number
  /**
   * Fraction of runs (0..1) that had their first unfunded year (same 1 %
   * tolerance as `successRate`) at or before each age — "the money lasts
   * until". Optional because results persisted before this field existed lack
   * it.
   */
  depletionByAge?: number[]
  /**
   * A handful of individual asset paths (the first few run indices), kept so
   * the fan chart can draw real sample trajectories on top of the percentile
   * bands. Deterministic seeding makes them stable across parameter changes.
   * Optional because results persisted before this field existed lack it.
   */
  sampleAssetPaths?: number[][]
  /** The same sample paths deflated by their own realised inflation. */
  sampleAssetPathsReal?: number[][]
  /** Per-age arithmetic means of actual booked annual money movements. */
  cashFlowMeans?: AnnualCashFlow[]
  /**
   * Deflated per path before averaging (not divided by median inflation).
   * Flows and the opening balance at the year's opening price level, the
   * closing balance at its closing level; `investmentReturn` is the real
   * return (closing − opening − contributions + withdrawals), so both ledger
   * identities hold in real terms too.
   */
  cashFlowMeansReal?: AnnualCashFlow[]
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

/**
 * A pre-plan parameter snapshot. Nothing creates these any more: the shape only
 * describes what the one-time legacy import reads (`bootstrapPlans`).
 */
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

/** Sync bookkeeping a cloud-sync merge hands to `applySyncedPlans`. */
export interface PlanSyncMeta {
  deletedPlans?: Record<string, number>
  syncedPlanStamps?: Record<string, number>
  /** Local plan id -> the id that plan lives under after the merge. */
  renamedIds?: Record<string, string>
}

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
  /**
   * Version of the calculation the remembered rates come from
   * (`CALC_VERSION` in `src/lib/simulation/calcVersion.ts`).
   */
  calcVersion: number
  /**
   * The rates an older calculation had remembered, kept until the user has
   * seen the "calculation corrected" notice; `null` when there is nothing to
   * explain.
   */
  ratesBeforeCalcChange: Record<string, number> | null
  /** Closes the "calculation corrected" notice for good. */
  dismissCalcNotice: () => void
  results: SimulationResults | null
  /**
   * Wall-clock time `results` were produced. Feeds the simulation context so
   * every surface can date the numbers it is showing.
   */
  resultsComputedAt: number | null
  isLoading: boolean
  error: string | null
  plans: Plan[]
  activePlanId: string
  /**
   * Plans deleted on this device (id -> time), so cloud sync can tell "deleted
   * here" from "never seen here" and a deletion is not undone by another
   * device. Persisted and synced; see `docs/specs/2026-11-09-sync-protocol.md`.
   */
  deletedPlans: Record<string, number>
  /**
   * `updatedAt` of every plan as the account last held it — the base cloud
   * sync merges against (which side changed since the last sync). Persisted,
   * device-local, written only by the sync loop.
   */
  syncedPlanStamps: Record<string, number>
  autoRunSuspended: boolean
  pendingRun: boolean

  // Draft (working copy) actions
  /** Commits the working copy into the active plan. No-op when clean. */
  savePlanDraft: () => void
  /** Throws the working copy away and restores the active plan's params. */
  revertPlanDraft: () => void
  /**
   * "Änderungen als neuen Plan speichern": stores the working copy as a new
   * plan in the background and puts the active plan back to its saved state.
   * The active plan stays active. Returns the new plan's id, or null when
   * there is nothing unsaved or the plan limit is reached.
   */
  saveDraftAsNewPlan: (name: string) => string | null

  // Plan actions
  /**
   * Creates a plan from `params` (defaults to the current params) and activates
   * it. Pass `{ activate: false }` to add the plan in the background — used by
   * the stress levers, which must not hijack the plan the user is editing.
   */
  createPlan: (
    name: string,
    params?: SimulationParams,
    options?: { activate?: boolean; nameKey?: string }
  ) => string | null
  renamePlan: (id: string, name: string) => void
  /** Copies a plan (params included) under a new name and activates the copy. */
  duplicatePlan: (id: string, name?: string) => string | null
  deletePlan: (id: string) => void
  setActivePlan: (id: string) => void
  getActivePlan: () => Plan | undefined
  /**
   * Replaces the plan list with the result of a cloud-sync merge.
   *
   * Unsaved edits are never discarded: while a working copy is dirty the active
   * plan (and the params on screen) stay put, and only the rest of the list is
   * reconciled. Returns true when anything actually changed.
   *
   * `sync` carries what the merge decided besides the plan list: the merged
   * deletion tombstones, the new sync base, and the ids of plans this device
   * kept under a new id (conflict copies) — the selection, and an unsaved
   * edit, follow such a plan to its new id.
   */
  applySyncedPlans: (plans: Plan[], activePlanId: string, sync?: PlanSyncMeta) => boolean

  // Actions
  updateParams: (partial: Partial<SimulationParams>) => void
  runSimulation: () => Promise<void>
  setAutoRunSuspended: (suspended: boolean) => void
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
  /** See {@link CashFlow.nameKey} — projected through from the flow. */
  nameKey?: string
}

export const CASHFLOW_FREQUENCIES = ['monthly', 'annual', 'once'] as const

export type CashFlowFrequency = (typeof CASHFLOW_FREQUENCIES)[number]

export const isCashFlowFrequency = (value: unknown): value is CashFlowFrequency =>
  typeof value === 'string' && (CASHFLOW_FREQUENCIES as readonly string[]).includes(value)

export const CASHFLOW_KINDS = ['income', 'expense', 'pension'] as const

export type CashFlowKind = (typeof CASHFLOW_KINDS)[number]

export const isCashFlowKind = (value: unknown): value is CashFlowKind =>
  typeof value === 'string' && (CASHFLOW_KINDS as readonly string[]).includes(value)

/** How an income flow is taxed: not at all (the amount is net), as ordinary income, or under § 34 EStG. */
export const INCOME_TAX_TREATMENTS = ['none', 'ordinary', 'oneFifth'] as const
export type IncomeTaxTreatment = (typeof INCOME_TAX_TREATMENTS)[number]
export const isIncomeTaxTreatment = (value: unknown): value is IncomeTaxTreatment =>
  typeof value === 'string' && (INCOME_TAX_TREATMENTS as readonly string[]).includes(value)

/** How a pension's taxable base is found: a static share, § 22 by start year, or § 19 Abs. 2 Versorgungsbezüge. */
export const PENSION_TAX_MODES = ['share', 'statutory', 'versorgungsbezuege'] as const
export type PensionTaxMode = (typeof PENSION_TAX_MODES)[number]
export const isPensionTaxMode = (value: unknown): value is PensionTaxMode =>
  typeof value === 'string' && (PENSION_TAX_MODES as readonly string[]).includes(value)

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
  /**
   * Translation key for a flow the app seeded (the eight default expenses).
   * Same contract as {@link Plan.nameKey}: while it is set the UI and the
   * report show the localised label, so a German user reads "Lebensmittel"
   * rather than "Groceries". It is dropped the moment the user edits the name,
   * after which their own text is shown verbatim in every language.
   *
   * `name` always holds a usable fallback, so a flow never renders blank.
   */
  nameKey?: string
  /**
   * Default true. False keeps the flow in the plan but out of every
   * calculation — an uncertain event (an inheritance, a lump sum, care costs)
   * switched off to see the plan without it. Stored only when false.
   */
  enabled?: boolean
  /** Amount per occurrence, in today's euros. */
  amount: number
  frequency: CashFlowFrequency
  /**
   * First age the flow applies to. Undefined = from `currentAge` (a pension:
   * from `legalRetirementAge`).
   *
   * The ages are kept exactly as written, also when they lie outside the
   * plan's `currentAge..endAge`: the engine counts the part of a recurring
   * flow that falls inside, and a single payment only if its age does. An age
   * before `currentAge` is the past — nothing is moved to today. For a pension
   * it is how "already in payment since 65" is said, and what its tax cohort
   * is read from.
   *
   * A recurring **expense** with neither `startAge` nor `endAge` is the
   * retirement budget: paid out of salary while working, charged from
   * `retirementAge` on and governed by the withdrawal rule — whatever its
   * `growthRate` or `inflationLinked` say. Giving an expense a window is what
   * makes it "scheduled": charged in exactly those years, working years
   * included, on top of the rule.
   */
  startAge?: number
  /** Last age the flow applies to. Undefined = through `endAge`; ignored for `once`. */
  endAge?: number
  /** Default true. False pins the amount to a fixed nominal € figure. */
  inflationLinked?: boolean
  /**
   * Extra growth per year (0 by default): on top of inflation for a linked
   * flow, nominal for a fixed one. Compounds from the flow's first year in the
   * plan; for the retirement budget that is the plan's first year, so the
   * item has grown by the time retirement starts.
   */
  growthRate?: number
  /**
   * Pension flows only: the share of this pension that counts as taxable
   * income (Besteuerungsanteil), 0–1. Undefined = the plan's
   * `pensionTaxablePortion`. A pension starting undefined (`startAge`) follows
   * the plan's statutory retirement age, and is a fixed nominal amount unless
   * `inflationLinked` is explicitly true.
   */
  taxablePortion?: number
  /**
   * Income flows only. `none` (default) means the amount is already net.
   * `ordinary` taxes it as income of the year it arrives, `oneFifth` applies
   * the § 34 EStG one-fifth rule for severance and lump sums — both on top of
   * whatever else is taxable that year.
   */
  taxTreatment?: IncomeTaxTreatment
  /**
   * Pension flows only. `share` (default) uses `taxablePortion`; `statutory`
   * takes the Besteuerungsanteil from the start year and freezes the tax-free
   * amount in euros (§ 22 EStG); `versorgungsbezuege` applies the
   * Versorgungsfreibetrag plus Zuschlag of the start year (§ 19 Abs. 2 EStG).
   */
  pensionTaxMode?: PensionTaxMode
  /**
   * Optional calendar month ("2033-01") a one-off was scheduled for. Display
   * only — `startAge` is what the model reads, derived from it when saved.
   */
  startDate?: string
  /** Free text ("source: Kapitaloption, gross €642,460"); never read by the model. */
  note?: string
}

declare global {
  interface Window {
    __APPLY_TOC__?: () => void
  }
}

/**
 * Abgeltungsteuer including the solidarity surcharge, in percentage points:
 * 25 % × 1.055 = 26.375 % — the figure the tax tooltip quotes. (Without church
 * tax; the shipped default used to be 26.25, which is no statutory rate.)
 */
export const DEFAULT_CAPITAL_GAINS_TAX = 26.375

/**
 * The calendar year the shipped default plan is written for. Only used to
 * read the default plan's own cohort from the tax tables below, so the
 * defaults stay one fixed plan instead of drifting with the wall clock.
 */
export const DEFAULT_PLAN_BASE_YEAR = 2026
const DEFAULT_CURRENT_AGE = 55
const DEFAULT_LEGAL_RETIREMENT_AGE = 67

/**
 * Besteuerungsanteil of the default plan's own statutory pension: 55 in 2026,
 * pension from 67, i.e. a 2038 start — 90 %. The default used to be 0.83,
 * the share of a pension that started in 2024.
 */
export const DEFAULT_PENSION_TAXABLE_PORTION = besteuerungsanteil(
  DEFAULT_PLAN_BASE_YEAR + (DEFAULT_LEGAL_RETIREMENT_AGE - DEFAULT_CURRENT_AGE)
)

// Default values
export const DEFAULT_PARAMS: SimulationParams = {
  currentAge: DEFAULT_CURRENT_AGE,
  retirementAge: 60,
  legalRetirementAge: DEFAULT_LEGAL_RETIREMENT_AGE,
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
  capitalGainsTax: DEFAULT_CAPITAL_GAINS_TAX,
  taxAllowanceAnnual: 1000,
  householdType: 'single',
  equityFundExemption: 0.3,
  pensionTaxablePortion: DEFAULT_PENSION_TAXABLE_PORTION,
  pensionTaxRate: 0.18,
  legacyTargetReal: 0,
  marketModel: 'monteCarlo',
  glidePathEnabled: false,
  equityAllocationStart: 0.8,
  equityAllocationEnd: 0.4,
  bondReturn: 0.03,
  bondVolatility: 0.06,
  // `nameKey` makes these eight follow the UI language (see `CashFlow.nameKey`);
  // the English `name` stays as the fallback and as the stable identity used by
  // the report's category matching.
  customExpenses: [
    {
      id: 'health',
      nameKey: 'health',
      name: 'Health Insurance',
      amount: 1300,
      interval: 'monthly',
    },
    { id: 'food', nameKey: 'food', name: 'Groceries', amount: 1200, interval: 'monthly' },
    {
      id: 'entertainment',
      nameKey: 'entertainment',
      name: 'Entertainment',
      amount: 300,
      interval: 'monthly',
    },
    { id: 'shopping', nameKey: 'shopping', name: 'Shopping', amount: 500, interval: 'monthly' },
    { id: 'utilities', nameKey: 'utilities', name: 'Utilities', amount: 400, interval: 'monthly' },
    { id: 'vacations', nameKey: 'vacations', name: 'Vacations', amount: 12000, interval: 'annual' },
    { id: 'repairs', nameKey: 'repairs', name: 'Home Repairs', amount: 5000, interval: 'annual' },
    {
      id: 'carMaintenance',
      nameKey: 'carMaintenance',
      name: 'Car Maintenance',
      amount: 1500,
      interval: 'annual',
    },
  ],
  // The same eight expenses as unified cash flows — `customExpenses` above is
  // the lifetime-expense projection of this list, regenerated on every write.
  cashFlows: [
    {
      id: 'pension-statutory',
      kind: 'pension',
      nameKey: 'statutoryPension',
      name: 'Statutory pension',
      amount: 5000,
      frequency: 'monthly',
      // No `startAge`: it follows `legalRetirementAge`. Nominal, as the
      // statutory pension has always been modelled here.
      inflationLinked: false,
    },
    {
      id: 'health',
      kind: 'expense',
      nameKey: 'health',
      name: 'Health Insurance',
      amount: 1300,
      frequency: 'monthly',
    },
    {
      id: 'food',
      kind: 'expense',
      nameKey: 'food',
      name: 'Groceries',
      amount: 1200,
      frequency: 'monthly',
    },
    {
      id: 'entertainment',
      kind: 'expense',
      nameKey: 'entertainment',
      name: 'Entertainment',
      amount: 300,
      frequency: 'monthly',
    },
    {
      id: 'shopping',
      kind: 'expense',
      nameKey: 'shopping',
      name: 'Shopping',
      amount: 500,
      frequency: 'monthly',
    },
    {
      id: 'utilities',
      kind: 'expense',
      nameKey: 'utilities',
      name: 'Utilities',
      amount: 400,
      frequency: 'monthly',
    },
    {
      id: 'vacations',
      kind: 'expense',
      nameKey: 'vacations',
      name: 'Vacations',
      amount: 12000,
      frequency: 'annual',
    },
    {
      id: 'repairs',
      kind: 'expense',
      nameKey: 'repairs',
      name: 'Home Repairs',
      amount: 5000,
      frequency: 'annual',
    },
    {
      id: 'carMaintenance',
      kind: 'expense',
      nameKey: 'carMaintenance',
      name: 'Car Maintenance',
      amount: 1500,
      frequency: 'annual',
    },
  ],
  withdrawalStrategy: 'vanguardDynamic',
  // 4%, not the 5% of the first releases: the rate is what the portfolio pays
  // on top of pensions and other income (see the strategy notes above), and at
  // 5% the shipped default plan ran dry in almost one path in five.
  dsWithdrawalRate: 0.04,
  dsCeilingRate: 0.05,
  dsFloorRate: -0.025,
  // Neutral: no floor, so adding the parameter changed no shipped scenario.
  spendingFloorReal: 0,
  simulationRuns: 500,
}
