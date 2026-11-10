import {
  cashFlowDraftIssues,
  isCompleteMonth,
  joinMonth,
  splitMonth,
} from '../cashFlowDraftValidation'

describe('cash-flow draft validation', () => {
  const ok = { name: 'Miete', amount: 900, startDate: '', once: false }

  it('accepts a named flow with a positive amount', () => {
    expect(cashFlowDraftIssues(ok)).toEqual([])
  })

  it('lists every blocking field in form order', () => {
    expect(cashFlowDraftIssues({ name: '  ', amount: 0, startDate: '2031-', once: true })).toEqual([
      'name',
      'amount',
      'date',
    ])
    expect(cashFlowDraftIssues({ ...ok, amount: Number.NaN })).toEqual(['amount'])
    expect(cashFlowDraftIssues({ ...ok, amount: 0.4 })).toEqual(['amount'])
  })

  it('checks the month only for a one-off, and only when one was started', () => {
    expect(cashFlowDraftIssues({ ...ok, once: true, startDate: '' })).toEqual([])
    expect(cashFlowDraftIssues({ ...ok, once: true, startDate: '2031-03' })).toEqual([])
    expect(cashFlowDraftIssues({ ...ok, once: true, startDate: '-03' })).toEqual(['date'])
    expect(cashFlowDraftIssues({ ...ok, once: false, startDate: '-03' })).toEqual([])
  })

  it('round-trips the two selects through the stored YYYY-MM', () => {
    expect(joinMonth('2031', '03')).toBe('2031-03')
    expect(joinMonth('', '')).toBe('')
    expect(splitMonth('2031-03')).toEqual({ year: '2031', month: '03' })
    expect(splitMonth('-07')).toEqual({ year: '', month: '07' })
    expect(splitMonth('')).toEqual({ year: '', month: '' })
    expect(isCompleteMonth('2031-13')).toBe(false)
    expect(isCompleteMonth('2031-12')).toBe(true)
  })
})
