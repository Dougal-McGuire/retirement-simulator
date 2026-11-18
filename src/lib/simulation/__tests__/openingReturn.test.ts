import { parsePercentInput } from '@/lib/utils/numberFormat'
import { DEFAULT_PARAMS } from '@/types'
import { buildDraftChanges } from '../draftChanges'
import { buildAssumptionRows } from '../planDiff'
import { gainFromOpeningReturn, openingReturnPercent, resizeOpeningGain } from '../openingReturn'

describe('opening return on acquisition cost', () => {
  it.each([
    ['+25,5 %', 25.5],
    ['25.5%', 25.5],
    ['−2,75', -2.75],
    ['1,2,3', NaN],
    ['1x2', NaN],
  ])('reads the broker percentage %s without silently dropping separators', (raw, expected) =>
    expect(parsePercentInput(String(raw))).toBe(expected)
  )

  it.each([
    [125000, 25, 25000],
    [80000, -20, -20000],
    [25000, 150, 15000],
    [4000, -96, -96000],
    [10000, 0, 0],
  ])(
    'converts a portfolio of %i with a return of %i%% to its original euro gain',
    (assets, percent, gain) => {
      expect(gainFromOpeningReturn(assets, percent)).toBeCloseTo(gain)
      expect(
        openingReturnPercent({ currentAssets: assets, initialUnrealizedGain: gain })
      ).toBeCloseTo(percent)
    }
  )

  it('preserves a legacy portfolio with zero acquisition cost until the user supplies a return', () => {
    const oldPlan = { ...DEFAULT_PARAMS, currentAssets: 10000, initialUnrealizedGain: 10000 }
    expect(openingReturnPercent(oldPlan)).toBeNull()
    expect(resizeOpeningGain(oldPlan, 15000)).toBe(15000)
    expect(resizeOpeningGain(oldPlan, 0)).toBe(0)
  })

  it('compares percentages and reverts the return at the current portfolio value', () => {
    const saved = { ...DEFAULT_PARAMS, currentAssets: 12000, initialUnrealizedGain: 2000 }
    const resized = {
      ...saved,
      currentAssets: 24000,
      initialUnrealizedGain: resizeOpeningGain(saved, 24000),
    }
    expect(buildDraftChanges(saved, resized).map((change) => change.id)).toEqual([
      'field:currentAssets',
    ])
    const draft = { ...resized, initialUnrealizedGain: -6000 }
    const gain = buildDraftChanges(saved, draft).find(
      (change) => change.id === 'field:initialUnrealizedGain'
    )
    expect(gain).toMatchObject({ from: 20, to: -20, kind: 'percentPoints' })
    expect(gain?.revert(draft)).toEqual({ initialUnrealizedGain: 4000 })
    expect(
      buildAssumptionRows([saved, draft]).find((row) => row.key === 'initialUnrealizedGain')
    ).toMatchObject({
      kind: 'percentPoints',
      values: [20, -20],
    })
  })
})
