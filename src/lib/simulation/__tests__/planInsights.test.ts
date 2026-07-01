import { DEFAULT_PARAMS } from '@/types'
import { areSimulationParamsEqual } from '../planInsights'

describe('plan insights', () => {
  it('treats matching parameter snapshots as equal', () => {
    expect(
      areSimulationParamsEqual(
        {
          ...DEFAULT_PARAMS,
          customExpenses: DEFAULT_PARAMS.customExpenses.map((expense) => ({ ...expense })),
          oneTimeIncomes: [{ age: 65, amount: 50000, name: 'Bonus' }],
        },
        {
          ...DEFAULT_PARAMS,
          customExpenses: DEFAULT_PARAMS.customExpenses.map((expense) => ({ ...expense })),
          oneTimeIncomes: [{ age: 65, amount: 50000, name: 'Bonus' }],
        }
      )
    ).toBe(true)
  })

  it('detects stale results when a scalar parameter changes', () => {
    expect(
      areSimulationParamsEqual(DEFAULT_PARAMS, {
        ...DEFAULT_PARAMS,
        retirementAge: DEFAULT_PARAMS.retirementAge + 1,
      })
    ).toBe(false)
  })

  it('detects stale results when nested cashflow entries change', () => {
    expect(
      areSimulationParamsEqual(DEFAULT_PARAMS, {
        ...DEFAULT_PARAMS,
        customExpenses: [
          {
            ...DEFAULT_PARAMS.customExpenses[0],
            amount: DEFAULT_PARAMS.customExpenses[0].amount + 100,
          },
          ...DEFAULT_PARAMS.customExpenses.slice(1),
        ],
      })
    ).toBe(false)
  })
})
