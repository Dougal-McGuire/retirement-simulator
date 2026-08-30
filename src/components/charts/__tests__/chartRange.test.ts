import { clampChartRange, sliceChartRange } from '../chartRange'

describe('chartRange', () => {
  it('clamps an index range to available data', () => {
    expect(clampChartRange({ startIndex: -3, endIndex: 99 }, 5)).toEqual({ startIndex: 0, endIndex: 4 })
  })

  it('keeps at least one point visible', () => {
    expect(clampChartRange({ startIndex: 4, endIndex: 2 }, 5)).toEqual({ startIndex: 4, endIndex: 4 })
  })

  it('returns the selected inclusive slice', () => {
    expect(sliceChartRange([10, 20, 30, 40], { startIndex: 1, endIndex: 2 })).toEqual([20, 30])
  })
})
