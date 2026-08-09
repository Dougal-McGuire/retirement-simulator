import {
  annualTaxAllowance,
  computeGrossWithdrawal,
  computeWithdrawalTax,
  netAnnualPension,
  netPensionFactor,
  runMonteCarloSimulation,
} from '../engine'
import { DEFAULT_PARAMS, type SimulationParams } from '@/types'

/**
 * German tax realism: Sparerpauschbetrag, Teilfreistellung, Rentenbesteuerung.
 *
 * The scenarios below are deterministic on purpose — zero volatility, one run,
 * a single year where that is enough — so every euro can be traced by hand
 * instead of being averaged away by the Monte Carlo.
 */

/**
 * One retiree, one year, 10% return, no inflation, no pension. `legalRetirementAge`
 * matches the retirement age because the engine floors the horizon at it — a
 * plan cannot end before the pension it never draws would have started.
 */
const oneYearParams = (overrides: Partial<SimulationParams> = {}): SimulationParams => ({
  ...DEFAULT_PARAMS,
  currentAge: 60,
  retirementAge: 60,
  legalRetirementAge: 60,
  endAge: 60,
  currentAssets: 1000,
  annualSavings: 0,
  monthlyPension: 0,
  averageROI: 0.1,
  roiVolatility: 0,
  averageInflation: 0,
  inflationVolatility: 0,
  capitalGainsTax: 25,
  withdrawalStrategy: 'fixedReal',
  customExpenses: [{ id: 'living', name: 'Living', amount: 100, interval: 'annual' }],
  cashFlows: [{ id: 'living', kind: 'expense', name: 'Living', amount: 100, frequency: 'annual' }],
  simulationRuns: 1,
  ...overrides,
})

const terminalAssets = (params: SimulationParams) =>
  runMonteCarloSimulation(params).assetPercentiles.p50.at(-1) ?? 0

describe('capital gains tax shelters', () => {
  it('shields a small withdrawal completely: the gross equals the need', () => {
    // After growth: 1,100 with a 1,000 basis, so a €100 sale realises €9.09 of
    // gain — €6.36 after the 30% Teilfreistellung, far inside the €1,000
    // allowance. Nothing is grossed up, so the portfolio ends on exactly 1,000.
    const result = computeWithdrawalTax(1100, 1000, 100, 0.25, { exemption: 0.3, allowance: 1000 })

    expect(result.gross).toBe(100)
    expect(result.tax).toBe(0)
    expect(result.allowanceUsed).toBeCloseTo(100 * (100 / 1100) * 0.7, 10)
    expect(terminalAssets(oneYearParams())).toBeCloseTo(1000, 6)
  })

  it('taxes only the gain the allowance no longer covers', () => {
    const taxRate = 0.25
    const allowance = 1000
    // A big sale out of a portfolio that is 50% gain: €40k of taxable gain
    // against a €1,000 allowance, so almost all of it is taxed.
    const result = computeWithdrawalTax(200_000, 100_000, 50_000, taxRate, {
      exemption: 0,
      allowance,
    })

    expect(result.allowanceUsed).toBe(allowance)
    expect(result.tax).toBeCloseTo((result.gross * 0.5 - allowance) * taxRate, 6)
    // The defining property: the sale nets exactly what was needed.
    expect(result.gross - result.tax).toBeCloseTo(50_000, 6)
  })

  it('exhausts the allowance across a sequence of sales in one year', () => {
    const taxRate = 0.25
    // 100% gain, no exemption: every euro withdrawn is a taxable euro.
    const first = computeWithdrawalTax(100_000, 0, 600, taxRate, { allowance: 1000 })
    expect(first.tax).toBe(0)
    expect(first.gross).toBe(600)

    const remaining = 1000 - first.allowanceUsed
    expect(remaining).toBeCloseTo(400, 10)

    // The second sale in the same year only has €400 of shelter left.
    const second = computeWithdrawalTax(100_000, 0, 600, taxRate, { allowance: remaining })
    expect(second.allowanceUsed).toBeCloseTo(400, 6)
    expect(second.tax).toBeGreaterThan(0)
    expect(second.gross - second.tax).toBeCloseTo(600, 6)
    // ...and once the shelter is gone entirely, the gross-up is the full one.
    const third = computeWithdrawalTax(100_000, 0, 600, taxRate, { allowance: 0 })
    expect(third.gross).toBeCloseTo(600 / (1 - taxRate), 6)
    expect(third.gross).toBeGreaterThan(second.gross)
  })

  it('refills the allowance every year, so a small drawdown never pays tax', () => {
    // €100 of need a year for 20 years out of an all-gain portfolio: each year
    // starts with a fresh €1,000 shelter, so tax is never due.
    const results = runMonteCarloSimulation(
      oneYearParams({
        endAge: 79,
        currentAssets: 100_000,
        taxAllowanceAnnual: 1000,
        equityFundExemption: 0,
        averageROI: 0,
      })
    )

    expect(results.withdrawalTaxDrag).toBe(0)
  })

  it('reduces the taxable share by the Teilfreistellung', () => {
    const taxed = computeGrossWithdrawal(200_000, 100_000, 50_000, 0.25, { exemption: 0 })
    const exempt = computeGrossWithdrawal(200_000, 100_000, 50_000, 0.25, { exemption: 0.3 })

    expect(exempt).toBeLessThan(taxed)
    // 30% of the gain is untaxed, so 30% of the gross-up disappears with it.
    const grossUp = (exemption: number) => 1 / (1 - 0.25 * 0.5 * (1 - exemption))
    expect(exempt).toBeCloseTo(50_000 * grossUp(0.3), 6)
    expect(taxed).toBeCloseTo(50_000 * grossUp(0), 6)
  })

  it('doubles the allowance for a jointly assessed couple', () => {
    const single = { ...DEFAULT_PARAMS, taxAllowanceAnnual: 1000, householdType: 'single' as const }
    const couple = { ...single, householdType: 'couple' as const }

    expect(annualTaxAllowance(single)).toBe(1000)
    expect(annualTaxAllowance(couple)).toBe(2000)

    // A withdrawal whose taxable gain lands between the two allowances is taxed
    // for the single filer and free for the couple.
    const params = oneYearParams({
      currentAssets: 100_000,
      equityFundExemption: 0,
      customExpenses: [{ id: 'living', name: 'Living', amount: 20_000, interval: 'annual' }],
      cashFlows: [
        { id: 'living', kind: 'expense', name: 'Living', amount: 20_000, frequency: 'annual' },
      ],
    })
    const singleRun = runMonteCarloSimulation({ ...params, householdType: 'single' })
    const coupleRun = runMonteCarloSimulation({ ...params, householdType: 'couple' })

    expect(coupleRun.withdrawalTaxDrag).toBeLessThan(singleRun.withdrawalTaxDrag ?? 1)
    expect(terminalAssets({ ...params, householdType: 'couple' })).toBeGreaterThan(
      terminalAssets({ ...params, householdType: 'single' })
    )
  })

  it('reports the median tax drag as a share of gross withdrawals', () => {
    const results = runMonteCarloSimulation(DEFAULT_PARAMS)

    expect(results.withdrawalTaxDrag).toBeGreaterThan(0)
    // Can never exceed the headline rate: only the gain is taxed, and only the
    // part of it the shelters do not absorb.
    expect(results.withdrawalTaxDrag).toBeLessThan(DEFAULT_PARAMS.capitalGainsTax / 100)
  })

  it('leaves the drag undefined when the plan never sells anything', () => {
    const results = runMonteCarloSimulation(
      oneYearParams({
        monthlyPension: 1000,
        pensionTaxablePortion: 0,
        pensionTaxRate: 0,
      })
    )

    expect(results.withdrawalTaxDrag).toBeUndefined()
  })
})

describe('pension taxation', () => {
  it('nets the pension down by Besteuerungsanteil × income-tax rate', () => {
    const params = { ...DEFAULT_PARAMS, monthlyPension: 5000 }

    expect(netPensionFactor(params)).toBeCloseTo(1 - 0.83 * 0.18, 10)
    expect(netAnnualPension(params)).toBeCloseTo(5000 * 12 * (1 - 0.83 * 0.18), 6)
    expect(netAnnualPension(params)).toBeLessThan(5000 * 12)
  })

  it('leaves the pension whole when either factor is zero', () => {
    const untaxed = { ...DEFAULT_PARAMS, pensionTaxRate: 0 }
    const notTaxable = { ...DEFAULT_PARAMS, pensionTaxablePortion: 0 }

    expect(netAnnualPension(untaxed)).toBe(DEFAULT_PARAMS.monthlyPension * 12)
    expect(netAnnualPension(notTaxable)).toBe(DEFAULT_PARAMS.monthlyPension * 12)
  })

  it('spends the net pension, not the gross one', () => {
    // Pension covers the whole expense gross, but not net — so the taxed plan
    // has to sell something and ends with less.
    const params = oneYearParams({
      monthlyPension: 1000,
      currentAssets: 100_000,
      customExpenses: [{ id: 'living', name: 'Living', amount: 12_000, interval: 'annual' }],
      cashFlows: [
        { id: 'living', kind: 'expense', name: 'Living', amount: 12_000, frequency: 'annual' },
      ],
    })

    const untaxed = terminalAssets({ ...params, pensionTaxablePortion: 0, pensionTaxRate: 0 })
    const taxed = terminalAssets(params)

    expect(taxed).toBeLessThan(untaxed)
    // The shortfall is exactly the tax on the pension (no capital gains tax is
    // due: the plan starts with a fresh basis and a €1,000 allowance).
    expect(untaxed - taxed).toBeCloseTo(12_000 * 0.83 * 0.18, 4)
  })

  it('makes the whole plan worse once the pension is taxed', () => {
    const untaxed = runMonteCarloSimulation({
      ...DEFAULT_PARAMS,
      pensionTaxablePortion: 0,
      pensionTaxRate: 0,
    })
    const taxed = runMonteCarloSimulation(DEFAULT_PARAMS)

    expect(taxed.successRate).toBeLessThan(untaxed.successRate)
  })
})
