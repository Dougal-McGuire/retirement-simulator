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

// Saved setup interface
export interface SavedSetup {
  id: string
  name: string
  timestamp: number
  params: SimulationParams
}

// State management interfaces
export interface SimulationStore {
  params: SimulationParams
  results: SimulationResults | null
  isLoading: boolean
  error: string | null
  savedSetups: SavedSetup[]
  autoRunSuspended: boolean
  pendingRun: boolean

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
}

export type ExpenseInterval = 'monthly' | 'annual'

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
  spending_p20: number
  spending_p50: number
  spending_p80: number
  spending_p90: number
  withdrawal_rate_p50: number | null
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
  simulationRuns: 500,
}
