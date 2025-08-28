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
  
  // Market parameters
  averageROI: number
  roiVolatility: number
  averageInflation: number
  inflationVolatility: number
  capitalGainsTax: number
  
  // Expenses (monthly)
  monthlyExpenses: {
    health: number
    food: number
    entertainment: number
    shopping: number
    utilities: number
  }
  
  // Expenses (annual)
  annualExpenses: {
    vacations: number
    repairs: number
    carMaintenance: number
  }
  
  // Simulation settings
  simulationRuns: number
}

// Results interfaces
export interface PercentileData {
  p10: number[]
  p50: number[]
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
}

export interface MonthlyExpensesStep {
  health: number
  food: number
  entertainment: number
  shopping: number
  utilities: number
}

export interface AnnualExpensesStep {
  vacations: number
  repairs: number
  carMaintenance: number
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
  
  // Actions
  updateParams: (partial: Partial<SimulationParams>) => void
  runSimulation: () => Promise<void>
  saveToStorage: () => void
  loadFromStorage: () => void
  saveSetup: (name: string) => void
  loadSetup: (id: string) => void
  deleteSetup: (id: string) => void
  getSavedSetups: () => SavedSetup[]
  clearResults: () => void
}

// Chart data interfaces
export interface ChartDataPoint {
  age: number
  assets_p10: number
  assets_p50: number
  assets_p90: number
  spending_p10: number
  spending_p50: number
  spending_p90: number
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
  averageROI: 0.07,
  roiVolatility: 0.15,
  averageInflation: 0.025,
  inflationVolatility: 0.01,
  capitalGainsTax: 26.25,
  monthlyExpenses: {
    health: 1300,
    food: 1200,
    entertainment: 300,
    shopping: 500,
    utilities: 400,
  },
  annualExpenses: {
    vacations: 12000,
    repairs: 5000,
    carMaintenance: 1500,
  },
  simulationRuns: 500,
};