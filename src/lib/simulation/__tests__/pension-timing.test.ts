import { buildCashFlowSeries, netPensionAnnualAtAge } from '../cashFlows'
import type { CashFlow } from '@/types'

const flow: CashFlow = {
  id: 'p',
  kind: 'pension',
  name: 'Pension',
  frequency: 'annual',
  amount: 20_000,
  startAge: 67,
  pensionTaxMode: 'statutory',
}

describe('pension cohort timing', () => {
  it('uses the original start year for a pension already in payment', () => {
    const series = buildCashFlowSeries([flow], 70, 72, {
      legalRetirementAge: 67,
      baseYear: 2026,
      pensionTaxRate: 0.2,
    })
    // Started three years ago, in 2023: taxable share 82.5%, not 84% (2026).
    expect(series.incomeFixed[0]).toBeCloseTo(20_000 * (1 - 0.825 * 0.2), 8)
  })

  it('uses the plan base age for a future pension preview', () => {
    const net = netPensionAnnualAtAge([flow], 67, {
      currentAge: 60,
      legalRetirementAge: 67,
      baseYear: 2026,
      pensionTaxRate: 0.2,
    })
    // Starts in 2033: 87.5% taxable.
    expect(net).toBeCloseTo(20_000 * (1 - 0.875 * 0.2), 8)
  })
})
