import {
  DEFAULT_PARAMS,
  MARKET_MODELS,
  WITHDRAWAL_STRATEGIES,
  type SimulationParams,
} from '@/types'
import en from '@/i18n/messages/en.json'
import de from '@/i18n/messages/de.json'
import {
  buildAssumptionGroups,
  buildAssumptionRows,
  comparisonFingerprint,
  diffParams,
} from '../planDiff'

const withParams = (overrides: Partial<SimulationParams>): SimulationParams => ({
  ...DEFAULT_PARAMS,
  customExpenses: DEFAULT_PARAMS.customExpenses.map((expense) => ({ ...expense })),
  oneTimeIncomes: [],
  ...overrides,
})

const rowByKey = (rows: ReturnType<typeof buildAssumptionRows>, key: string) =>
  rows.find((row) => row.key === key)

describe('assumption rows', () => {
  it('marks nothing as differing when the plans are identical', () => {
    const rows = buildAssumptionRows([withParams({}), withParams({})])
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((row) => row.differs)).toBe(false)
  })

  it('flags only the parameters that actually moved', () => {
    const rows = buildAssumptionRows([
      withParams({}),
      withParams({ retirementAge: 63, annualSavings: 52800 }),
    ])

    expect(
      rows
        .filter((row) => row.differs)
        .map((row) => row.key)
        .sort()
    ).toEqual(['annualSavings', 'bridgeYears', 'retirementAge'])
    expect(rowByKey(rows, 'annualSavings')?.values).toEqual([48000, 52800])
    expect(rowByKey(rows, 'annualSavings')?.kind).toBe('currency')
  })

  it('derives spending totals from the expense list', () => {
    const rows = buildAssumptionRows([
      withParams({
        customExpenses: [
          { id: 'a', name: 'Living', amount: 2000, interval: 'monthly' },
          { id: 'b', name: 'Trips', amount: 6000, interval: 'annual' },
        ],
      }),
    ])

    expect(rowByKey(rows, 'monthlySpending')?.values).toEqual([2500])
    expect(rowByKey(rows, 'annualSpending')?.values).toEqual([30000])
  })

  it('compares three plans at once', () => {
    const rows = buildAssumptionRows([
      withParams({ averageROI: 0.07 }),
      withParams({ averageROI: 0.05 }),
      withParams({ averageROI: 0.07 }),
    ])

    expect(rowByKey(rows, 'averageROI')?.values).toEqual([0.07, 0.05, 0.07])
    expect(rowByKey(rows, 'averageROI')?.differs).toBe(true)
  })

  it('drops optional rows that carry no information', () => {
    const rows = buildAssumptionRows([withParams({ oneTimeIncomes: [] }), withParams({})])
    expect(rowByKey(rows, 'oneTimeIncomes')).toBeUndefined()

    const withIncome = buildAssumptionRows([
      withParams({ oneTimeIncomes: [{ age: 65, amount: 50000, name: 'Bonus' }] }),
      withParams({}),
    ])
    expect(rowByKey(withIncome, 'oneTimeIncomes')?.values).toEqual([50000, 0])
  })

  it('hides dynamic-spending guardrails when no plan uses that strategy', () => {
    const fixed = buildAssumptionRows([
      withParams({ withdrawalStrategy: 'fixedReal' }),
      withParams({ withdrawalStrategy: 'fixedReal' }),
    ])
    expect(rowByKey(fixed, 'dsWithdrawalRate')).toBeUndefined()

    const mixed = buildAssumptionRows([
      withParams({ withdrawalStrategy: 'fixedReal' }),
      withParams({ withdrawalStrategy: 'vanguardDynamic' }),
    ])
    expect(rowByKey(mixed, 'withdrawalStrategy')?.differs).toBe(true)
    expect(rowByKey(mixed, 'dsWithdrawalRate')?.values).toEqual([0.05, 0.05])
  })

  it('hides the market model until a plan leaves Monte Carlo', () => {
    const bothDefault = buildAssumptionRows([withParams({}), withParams({})])
    expect(rowByKey(bothDefault, 'marketModel')).toBeUndefined()

    const mixed = buildAssumptionRows([withParams({}), withParams({ marketModel: 'historical' })])
    expect(rowByKey(mixed, 'marketModel')?.values).toEqual(['monteCarlo', 'historical'])
    expect(rowByKey(mixed, 'marketModel')?.differs).toBe(true)
    expect(rowByKey(mixed, 'marketModel')?.kind).toBe('marketModel')
  })

  it('hides the allocation rows until a plan runs a glide path', () => {
    const flat = buildAssumptionRows([withParams({}), withParams({})])
    expect(rowByKey(flat, 'glidePathEnabled')).toBeUndefined()
    expect(rowByKey(flat, 'equityAllocationStart')).toBeUndefined()
    expect(rowByKey(flat, 'bondReturn')).toBeUndefined()

    const glided = buildAssumptionRows([
      withParams({}),
      withParams({ glidePathEnabled: true, equityAllocationEnd: 0.3 }),
    ])
    expect(rowByKey(glided, 'glidePathEnabled')?.values).toEqual(['off', 'on'])
    expect(rowByKey(glided, 'glidePathEnabled')?.kind).toBe('toggle')
    expect(rowByKey(glided, 'equityAllocationEnd')?.values).toEqual([0.4, 0.3])
  })

  it('groups rows in display order and skips empty groups', () => {
    const groups = buildAssumptionGroups([withParams({}), withParams({})])
    expect(groups.map((group) => group.key)).toEqual([
      'timeline',
      'income',
      'spending',
      'market',
      'tax',
      'strategy',
    ])
    // `goals` only materialises once a plan has a bequest target.
    const withGoal = buildAssumptionGroups([
      withParams({ legacyTargetReal: 300000 }),
      withParams({}),
    ])
    expect(withGoal.map((group) => group.key)).toContain('goals')
    expect(
      rowByKey(buildAssumptionRows([withParams({}), withParams({})]), 'legacyTargetReal')
    ).toBeUndefined()
    expect(groups.every((group) => group.rows.length > 0)).toBe(true)
  })
})

describe('diffParams', () => {
  it('returns the changed parameters as from/to pairs', () => {
    const changes = diffParams(
      withParams({}),
      withParams({ annualSavings: Math.round(48000 * 1.1) })
    )

    expect(changes).toEqual([{ key: 'annualSavings', kind: 'currency', from: 48000, to: 52800 }])
  })

  it('reports scaled expenses once, through the monthly total', () => {
    const changes = diffParams(
      withParams({
        customExpenses: [{ id: 'a', name: 'Living', amount: 2000, interval: 'monthly' }],
      }),
      withParams({
        customExpenses: [{ id: 'a', name: 'Living', amount: 1800, interval: 'monthly' }],
      })
    )

    // The annual total and the pension bridge follow from other rows: they show
    // up in the full table but must not pad the short change list.
    expect(changes.map((change) => change.key)).toEqual(['monthlySpending'])
    expect(changes[0]).toMatchObject({ from: 2000, to: 1800 })
  })

  it('leaves derived rows out of the change list', () => {
    const changes = diffParams(withParams({}), withParams({ retirementAge: 62 }))
    expect(changes.map((change) => change.key)).toEqual(['retirementAge'])
  })

  it('caps the number of reported changes', () => {
    const changes = diffParams(
      withParams({}),
      withParams({ retirementAge: 62, annualSavings: 1, monthlyPension: 1, averageROI: 0.01 }),
      3
    )
    expect(changes).toHaveLength(3)
  })

  it('is empty when nothing changed', () => {
    expect(diffParams(withParams({}), withParams({}))).toEqual([])
  })
})

describe('comparisonFingerprint', () => {
  it('ignores the run count, which the comparison clamps itself', () => {
    expect(comparisonFingerprint(withParams({ simulationRuns: 500 }))).toBe(
      comparisonFingerprint(withParams({ simulationRuns: 1200 }))
    )
  })

  it('changes when a compared parameter changes', () => {
    expect(comparisonFingerprint(withParams({}))).not.toBe(
      comparisonFingerprint(withParams({ retirementAge: 61 }))
    )
  })

  it('changes when an expense item is edited without moving the total', () => {
    const before = withParams({
      customExpenses: [
        { id: 'a', name: 'A', amount: 1000, interval: 'monthly' },
        { id: 'b', name: 'B', amount: 1000, interval: 'monthly' },
      ],
    })
    const after = withParams({
      customExpenses: [
        { id: 'a', name: 'A', amount: 1500, interval: 'monthly' },
        { id: 'b', name: 'B', amount: 500, interval: 'monthly' },
      ],
    })

    expect(comparisonFingerprint(before)).not.toBe(comparisonFingerprint(after))
  })

  it('changes when a one-time income moves', () => {
    const before = withParams({ oneTimeIncomes: [{ age: 65, amount: 50000, name: 'Bonus' }] })
    const after = withParams({ oneTimeIncomes: [{ age: 70, amount: 50000, name: 'Bonus' }] })

    expect(comparisonFingerprint(before)).not.toBe(comparisonFingerprint(after))
  })
})

/**
 * The diff layer emits raw values plus a unit tag; the comparison table looks
 * every one of them up in the message catalogue. A row without a label renders
 * as a raw key in production, which no type checks and no snapshot would catch.
 */
describe('cash flows in the comparison', () => {
  const windowed = withParams({
    cashFlows: [
      ...DEFAULT_PARAMS.cashFlows,
      {
        id: 'rent',
        kind: 'income' as const,
        name: 'Rent',
        amount: 900,
        frequency: 'monthly' as const,
        startAge: 62,
        endAge: 70,
      },
    ],
  })

  it('adds scheduled-flow rows only when a plan has some', () => {
    const withoutFlows = buildAssumptionRows([withParams({}), withParams({})])
    expect(rowByKey(withoutFlows, 'scheduledIncome')).toBeUndefined()

    const rows = buildAssumptionRows([windowed, withParams({})])
    const income = rowByKey(rows, 'scheduledIncome')
    // Nine years of €900/month, in today's euros.
    expect(income?.values).toEqual([900 * 12 * 9, 0])
    expect(income?.differs).toBe(true)
    expect(rowByKey(rows, 'scheduledItems')?.values).toEqual([1, 0])
  })

  it('treats a windowed flow as a comparison-relevant change', () => {
    expect(comparisonFingerprint(windowed)).not.toBe(comparisonFingerprint(withParams({})))
    // ...while reordering the same flows is not a change.
    const reordered = withParams({ cashFlows: [...windowed.cashFlows].reverse() })
    expect(comparisonFingerprint(reordered)).toBe(comparisonFingerprint(windowed))
  })
})

describe('assumption rows are translatable', () => {
  const catalogues = [
    ['en', en],
    ['de', de],
  ] as const

  const allRows = buildAssumptionRows([
    withParams({
      marketModel: 'historical',
      glidePathEnabled: true,
      householdType: 'couple',
      legacyTargetReal: 250000,
      // Also forces the optional cash-flow rows to be emitted.
      cashFlows: [
        ...DEFAULT_PARAMS.cashFlows,
        {
          id: 'rent',
          kind: 'income',
          name: 'Rent',
          amount: 900,
          frequency: 'monthly',
          startAge: 62,
          endAge: 70,
        },
        {
          id: 'roof',
          kind: 'expense',
          name: 'Roof',
          amount: 30000,
          frequency: 'once',
          startAge: 64,
        },
      ],
    }),
    withParams({}),
  ])

  it.each(catalogues)('%s labels every row the diff can emit', (_locale, messages) => {
    const rowLabels = messages.plans.comparison.assumptions.rows as Record<string, string>
    for (const row of allRows) {
      expect(rowLabels[row.key]).toBeTruthy()
    }
  })

  it.each(catalogues)('%s names every enumerated value', (_locale, messages) => {
    const controls = messages.parameterControls as unknown as {
      toggle: Record<string, string>
      fields: {
        marketModel: { options: Record<string, { label: string }> }
        withdrawalStrategy: { options: Record<string, { label: string }> }
      }
    }

    expect(controls.toggle.on).toBeTruthy()
    expect(controls.toggle.off).toBeTruthy()
    for (const model of MARKET_MODELS) {
      expect(controls.fields.marketModel.options[model]?.label).toBeTruthy()
    }
    for (const strategy of WITHDRAWAL_STRATEGIES) {
      expect(controls.fields.withdrawalStrategy.options[strategy]?.label).toBeTruthy()
    }
  })
})
