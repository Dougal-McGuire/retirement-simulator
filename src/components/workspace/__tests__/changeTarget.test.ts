import { DEFAULT_PARAMS } from '@/types'
import { buildDraftChanges } from '@/lib/simulation/draftChanges'
import { changeEditTarget } from '../changeTarget'

describe('changeEditTarget', () => {
  it('maps ordinary plan fields to their column panel and editor field id', () => {
    const changes = buildDraftChanges(DEFAULT_PARAMS, {
      ...DEFAULT_PARAMS,
      retirementAge: DEFAULT_PARAMS.retirementAge + 2,
      annualSavings: DEFAULT_PARAMS.annualSavings + 5000,
      inflationVolatility: 0.015,
    })

    expect(changes.map(changeEditTarget)).toEqual([
      { panel: 'person', fieldId: 'editor-retirementAge' },
      { panel: 'savings', fieldId: 'editor-annualSavings' },
      { panel: 'market', fieldId: 'editor-inflationVolatility' },
    ])
  })

  it('maps withdrawal rule changes to the withdrawal section and planner controls', () => {
    const changes = buildDraftChanges(DEFAULT_PARAMS, {
      ...DEFAULT_PARAMS,
      withdrawalStrategy: 'guytonKlinger',
      dsWithdrawalRate: 0.045,
      lifestyleFloorMonthlyReal: 3200,
    })

    expect(changes.map(changeEditTarget)).toEqual([
      { section: 'withdrawal', fieldId: 'withdrawal-strategy-guytonKlinger' },
      { section: 'withdrawal', fieldId: 'planner-dsWithdrawalRate' },
      { section: 'withdrawal', fieldId: 'planner-lifestyleFloorMonthlyReal' },
    ])
  })

  it('maps flow switches/edits to the flow switch id and removed flows to the flows panel', () => {
    const [first, second, ...rest] = DEFAULT_PARAMS.cashFlows!
    const changes = buildDraftChanges(DEFAULT_PARAMS, {
      ...DEFAULT_PARAMS,
      cashFlows: [
        { ...first, enabled: false },
        ...rest,
        {
          id: 'added-flow',
          kind: 'income',
          name: 'Side income',
          amount: 500,
          frequency: 'monthly',
        },
      ],
    })

    const targets = Object.fromEntries(changes.map((c) => [c.id, changeEditTarget(c)]))
    expect(targets[`flow:${first.id}:switch`]).toEqual({
      panel: 'flows',
      fieldId: `cashflow-switch-${first.id}`,
    })
    expect(targets[`flow:${second.id}:removed`]).toEqual({ panel: 'flows' })
    expect(targets['flow:added-flow:added']).toEqual({
      panel: 'flows',
      fieldId: 'cashflow-switch-added-flow',
    })
  })

  it('falls back to panel-level focus for fields without standalone editor inputs', () => {
    const changes = buildDraftChanges(DEFAULT_PARAMS, {
      ...DEFAULT_PARAMS,
      legacyTargetReal: 100000,
    })

    expect(changes.map(changeEditTarget)).toEqual([{ panel: 'market' }])
  })
})
