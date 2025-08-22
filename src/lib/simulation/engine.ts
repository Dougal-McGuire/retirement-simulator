import { SimulationParams, SimulationResults, PercentileData } from '@/types'

/**
 * Box-Muller transform for generating normally distributed random numbers
 * @param mean - The mean of the normal distribution
 * @param stdDev - The standard deviation of the normal distribution
 * @returns A normally distributed random number
 */
export function boxMullerTransform(mean: number, stdDev: number): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random() // Converting [0,1) to (0,1)
  while (v === 0) v = Math.random()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return mean + stdDev * z
}

/**
 * Calculate percentiles from a sorted array
 * @param arr - Array of numbers
 * @param percentile - Percentile to calculate (0-100)
 * @returns The value at the given percentile
 */
export function calculatePercentile(arr: number[], percentile: number): number {
  const sorted = arr.slice().sort((a, b) => a - b)
  const index = (percentile / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  
  if (lower === upper) {
    return sorted[lower]
  } else {
    return sorted[lower] * (upper - index) + sorted[upper] * (index - lower)
  }
}

/**
 * Calculate percentiles for each age across all simulation runs
 * @param data - 2D array where data[run][age] contains the value for that run and age
 * @param percentiles - Array of percentiles to calculate
 * @returns Object containing arrays of percentile values for each age
 */
export function calculatePercentiles(
  data: number[][],
  percentiles: number[] = [10, 50, 90]
): PercentileData {
  const ageCount = data[0]?.length || 0
  const result: PercentileData = {
    p10: [],
    p50: [],
    p90: []
  }
  
  for (let ageIndex = 0; ageIndex < ageCount; ageIndex++) {
    const valuesAtAge = data.map(run => run[ageIndex])
    
    result.p10.push(calculatePercentile(valuesAtAge, 10))
    result.p50.push(calculatePercentile(valuesAtAge, 50))
    result.p90.push(calculatePercentile(valuesAtAge, 90))
  }
  
  return result
}

/**
 * Run a single Monte Carlo simulation
 * @param params - Simulation parameters
 * @returns Object containing asset history and spending history for this run
 */
function runSingleSimulation(params: SimulationParams): {
  assetHistory: number[]
  spendingHistory: number[]
  failed: boolean
} {
  const assetHistory: number[] = []
  const spendingHistory: number[] = []
  let currentAssets = params.currentAssets
  
  // Calculate total monthly and annual expenses
  const totalMonthlyExpense = Object.values(params.monthlyExpenses).reduce((sum, expense) => sum + expense, 0)
  const totalAnnualExpense = Object.values(params.annualExpenses).reduce((sum, expense) => sum + expense, 0)
  
  let currentMonthlyExpense = totalMonthlyExpense
  let currentAnnualExpense = totalAnnualExpense
  let runFailed = false
  
  for (let age = params.currentAge; age <= params.endAge; age++) {
    if (age < params.retirementAge) {
      // Accumulation phase (working years)
      const roi = boxMullerTransform(params.averageROI, params.roiVolatility)
      currentAssets = currentAssets * (1 + roi) + params.annualSavings
      spendingHistory.push(0) // No spending during accumulation for visualization
    } else {
      // Distribution phase (retirement years)
      const totalAnnualExpenseThisYear = currentMonthlyExpense * 12 + currentAnnualExpense
      
      // Add pension income if at legal retirement age
      let annualIncome = 0
      if (age >= params.legalRetirementAge) {
        annualIncome = params.monthlyPension * 12
      }
      
      // Apply expenses and income
      currentAssets = currentAssets + annualIncome - totalAnnualExpenseThisYear
      
      // Apply inflation to expenses for next year
      const inflation = boxMullerTransform(params.averageInflation, params.inflationVolatility)
      currentMonthlyExpense *= (1 + inflation)
      currentAnnualExpense *= (1 + inflation)
      
      // Store total monthly-equivalent spending (includes annualized annual expenses)
      const monthlyEquivalentSpending = currentMonthlyExpense + (currentAnnualExpense / 12)
      spendingHistory.push(monthlyEquivalentSpending)
      
      // Check for failure (running out of money)
      if (currentAssets < 0) {
        runFailed = true
      }
    }
    
    assetHistory.push(Math.max(0, currentAssets)) // Don't show negative assets
  }
  
  return {
    assetHistory,
    spendingHistory,
    failed: runFailed
  }
}

/**
 * Run the complete Monte Carlo simulation
 * @param params - Simulation parameters
 * @returns Complete simulation results including percentiles and success rate
 */
export function runMonteCarloSimulation(params: SimulationParams): SimulationResults {
  const ages: number[] = []
  const assetRuns: number[][] = []
  const spendingRuns: number[][] = []
  let successfulRuns = 0
  
  // Initialize age array
  for (let age = params.currentAge; age <= params.endAge; age++) {
    ages.push(age)
  }
  
  // Run all simulations
  for (let run = 0; run < params.simulationRuns; run++) {
    const result = runSingleSimulation(params)
    
    if (!result.failed) {
      successfulRuns++
    }
    
    assetRuns.push(result.assetHistory)
    spendingRuns.push(result.spendingHistory)
  }
  
  // Calculate percentiles
  const assetPercentiles = calculatePercentiles(assetRuns)
  const spendingPercentiles = calculatePercentiles(spendingRuns)
  
  // Calculate success rate
  const successRate = (successfulRuns / params.simulationRuns) * 100
  
  return {
    ages,
    assetPercentiles,
    spendingPercentiles,
    successRate,
    params
  }
}

/**
 * Format currency values for display
 * @param value - Numeric value
 * @returns Formatted currency string
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Format percentage values for display
 * @param value - Numeric value (as decimal, e.g., 0.07 for 7%)
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}