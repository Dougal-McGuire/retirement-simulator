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

// State management interfaces
export interface SimulationStore {
  params: SimulationParams
  results: SimulationResults | null
  isLoading: boolean
  error: string | null
  
  // Actions
  updateParams: (partial: Partial<SimulationParams>) => void
  runSimulation: () => Promise<void>
  saveToStorage: () => void
  loadFromStorage: () => void
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
  currentAge: 54,
  retirementAge: 60,
  legalRetirementAge: 67,
  endAge: 90,
  currentAssets: 600000,
  annualSavings: 18000,
  monthlyPension: 5000,
  averageROI: 0.07,
  roiVolatility: 0.02,
  averageInflation: 0.03,
  inflationVolatility: 0.005,
  capitalGainsTax: 26.25,
  monthlyExpenses: {
    health: 300,
    food: 500,
    entertainment: 200,
    shopping: 100,
    utilities: 200,
  },
  annualExpenses: {
    vacations: 3000,
    repairs: 2000,
    carMaintenance: 1500,
  },
  simulationRuns: 1000,
};