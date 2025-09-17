import { SimulationParams, SimulationResults, PercentileData } from '@/types'

/**
 * Box-Muller transform for generating normally distributed random numbers
 * @param mean - The mean of the normal distribution
 * @param stdDev - The standard deviation of the normal distribution
 * @returns A normally distributed random number
 */
export function boxMullerTransform(mean: number, stdDev: number): number {
  let u = 0,
    v = 0
  while (u === 0) u = Math.random() // Converting [0,1) to (0,1)
  while (v === 0) v = Math.random()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return mean + stdDev * z
}

/**
 * Sample a standard normal random variate using Box-Muller.
 */
export function sampleStandardNormal(): number {
  let u = 0,
    v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Compute (mu, sigma) of a lognormal factor X = 1 + r given arithmetic mean m = E[r] and stdev s = SD[r].
 * For lognormal Y ~ logN(mu, sigma^2): E[Y] = exp(mu + sigma^2/2), Var[Y] = (exp(sigma^2)-1)exp(2mu+sigma^2).
 * Here Y = 1 + r with E[Y] = 1 + m and SD[Y] = s.
 */
export function lognormalParamsFromArithmetic(mean: number, stdev: number): { mu: number; sigma: number } {
  const A = 1 + mean
  const variance = stdev * stdev
  const sigma2 = Math.log(1 + (variance / (A * A)))
  const sigma = Math.sqrt(Math.max(0, sigma2))
  const mu = Math.log(A) - 0.5 * sigma2
  return { mu, sigma }
}

/**
 * Sample a multiplicative lognormal factor given arithmetic mean and stdev of r where X = 1 + r.
 * Returns X such that r = X - 1.
 */
export function sampleLognormalFactorFromArithmetic(mean: number, stdev: number): number {
  const { mu, sigma } = lognormalParamsFromArithmetic(mean, stdev)
  const z = sampleStandardNormal()
  return Math.exp(mu + sigma * z)
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
export function calculatePercentiles(data: number[][]): PercentileData {
  const ageCount = data[0]?.length || 0
  const result: PercentileData = {
    p10: [],
    p20: [],
    p50: [],
    p80: [],
    p90: [],
  }

  for (let ageIndex = 0; ageIndex < ageCount; ageIndex++) {
    const valuesAtAge = data.map((run) => run[ageIndex])

    result.p10.push(calculatePercentile(valuesAtAge, 10))
    result.p20.push(calculatePercentile(valuesAtAge, 20))
    result.p50.push(calculatePercentile(valuesAtAge, 50))
    result.p80.push(calculatePercentile(valuesAtAge, 80))
    result.p90.push(calculatePercentile(valuesAtAge, 90))
  }

  return result
}

/**
 * Run a single Monte Carlo simulation
 *
 * Key improvements made:
 * - ROI returns are clamped at -100% to prevent impossible losses
 * - Proper cost basis tracking for accurate capital gains tax calculation
 * - Removed arbitrary 0.7 cap on taxable gains ratio
 * - Early termination when assets are exhausted to prevent negative compounding
 * - Proportional cost basis adjustment during withdrawals
 *
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
  let costBasis = params.currentAssets // Track original investment amount

  // Calculate total monthly and annual expenses
  const totalMonthlyExpense = Object.values(params.monthlyExpenses).reduce(
    (sum, expense) => sum + expense,
    0
  )
  const totalAnnualExpense = Object.values(params.annualExpenses).reduce(
    (sum, expense) => sum + expense,
    0
  )

  let currentMonthlyExpense = totalMonthlyExpense
  let currentAnnualExpense = totalAnnualExpense
  let runFailed = false

  const effectiveRetirementAge = Math.max(params.retirementAge, params.currentAge)

  for (let age = params.currentAge; age <= params.endAge; age++) {
    if (age < effectiveRetirementAge) {
      // Accumulation phase (working years)
      const roiFactor = sampleLognormalFactorFromArithmetic(
        params.averageROI,
        params.roiVolatility
      )

      // During accumulation, assume reinvestment without realizing gains
      currentAssets = currentAssets * roiFactor + params.annualSavings
      costBasis += params.annualSavings // Track additional investments
      spendingHistory.push(0) // No spending during accumulation for visualization

      // Inflate expenses so that retirement starts with age-adjusted spending
      const inflationFactor = sampleLognormalFactorFromArithmetic(
        params.averageInflation,
        params.inflationVolatility
      )
      currentMonthlyExpense *= inflationFactor
      currentAnnualExpense *= inflationFactor
    } else {
      // Distribution phase (retirement years)
      const totalAnnualExpenseThisYear = currentMonthlyExpense * 12 + currentAnnualExpense

      // Add pension income if at legal retirement age
      let annualIncome = 0
      if (age >= params.legalRetirementAge) {
        annualIncome = params.monthlyPension * 12
      }

      // Calculate how much we need to withdraw from investments
      const netNeeded = totalAnnualExpenseThisYear - annualIncome

      // Apply investment growth first
      const roiFactor = sampleLognormalFactorFromArithmetic(
        params.averageROI,
        params.roiVolatility
      )
      currentAssets = Math.max(0, currentAssets * roiFactor)

      if (netNeeded > 0) {
        // We need to sell investments to cover expenses, with tax gross-up on gains portion
        if (currentAssets <= 0) {
          runFailed = true
          currentAssets = 0
        } else {
          const t = Math.max(0, params.capitalGainsTax / 100)
          const totalWithdrawal = computeGrossWithdrawal(currentAssets, costBasis, netNeeded, t)
          const withdrawal = Math.min(totalWithdrawal, currentAssets)
          const withdrawalRatio = withdrawal > 0 && currentAssets > 0 ? withdrawal / currentAssets : 0
          costBasis = Math.max(0, costBasis * (1 - withdrawalRatio))
          currentAssets = Math.max(0, currentAssets - withdrawal)
          if (currentAssets <= 0) {
            runFailed = true
            currentAssets = 0
          }
        }
      } else {
        // Surplus income: reinvest surplus and increase cost basis accordingly
        const surplus = -netNeeded
        currentAssets = currentAssets + surplus
        costBasis += surplus
      }

      // Store total monthly-equivalent spending (includes annualized annual expenses)
      const monthlyEquivalentSpending = currentMonthlyExpense + currentAnnualExpense / 12
      spendingHistory.push(monthlyEquivalentSpending)

      // Apply inflation to expenses for next year
      const inflationFactor = sampleLognormalFactorFromArithmetic(
        params.averageInflation,
        params.inflationVolatility
      )
      currentMonthlyExpense *= inflationFactor
      currentAnnualExpense *= inflationFactor

      // Check for failure (running out of money)
      if (currentAssets <= 0) {
        runFailed = true
        currentAssets = 0
      }
    }

    assetHistory.push(currentAssets)
  }

  return {
    assetHistory,
    spendingHistory,
    failed: runFailed,
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
    params,
  }
}

/**
 * Compute the gross withdrawal needed to cover a net cash need when capital gains are taxed.
 * - currentAssets: portfolio value after growth
 * - costBasis: remaining cost basis before withdrawal
 * - netNeeded: net cash requirement (expenses - income), non-negative
 * - taxRate: capital gains tax rate in decimal, e.g., 0.25
 *
 * Returns the gross amount to withdraw so that after tax on the gains portion,
 * the net equals netNeeded. Caps at Infinity if denom <= 0; caller should min with currentAssets.
 */
export function computeGrossWithdrawal(
  currentAssets: number,
  costBasis: number,
  netNeeded: number,
  taxRate: number
): number {
  if (netNeeded <= 0 || currentAssets <= 0) return 0
  const basisRatio = Math.min(1, Math.max(0, costBasis / currentAssets))
  const gainsRatio = 1 - basisRatio
  const denom = 1 - taxRate * gainsRatio
  if (denom <= 0) return Number.POSITIVE_INFINITY
  return netNeeded / denom
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

/**
 * Calculate combined monthly and annual expense totals
 * @param monthlyExpenses - Object containing monthly expense categories
 * @param annualExpenses - Object containing annual expense categories
 * @returns Object with combined totals
 */
export function calculateCombinedExpenses(
  monthlyExpenses: Record<string, number>,
  annualExpenses: Record<string, number>
) {
  const totalMonthly = Object.values(monthlyExpenses).reduce((sum, expense) => sum + expense, 0)
  const totalAnnual = Object.values(annualExpenses).reduce((sum, expense) => sum + expense, 0)

  return {
    totalMonthly,
    totalAnnual,
    combinedMonthly: totalMonthly + totalAnnual / 12,
    combinedAnnual: totalMonthly * 12 + totalAnnual,
  }
}
