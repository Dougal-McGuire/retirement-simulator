/** A field of the cash-flow form that blocks saving. */
export type CashFlowDraftIssue = 'name' | 'amount' | 'date'

/** Form order: the first issue is the field that gets focus. */
const ORDER: CashFlowDraftIssue[] = ['name', 'amount', 'date']

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/** "YYYY-MM" from the two selects; either part may still be empty while editing. */
export function joinMonth(year: string, month: string): string {
  return year === '' && month === '' ? '' : `${year}-${month}`
}

export function splitMonth(value: string): { year: string; month: string } {
  const [year = '', month = ''] = value.split('-')
  return { year, month }
}

export function isCompleteMonth(value: string): boolean {
  return MONTH_PATTERN.test(value.trim())
}

/**
 * Why a draft cannot be saved, in form order (empty when it can). The form
 * used to return silently and reset anyway, so a typo threw the whole entry
 * away; now each issue marks its field and the form stays open.
 */
export function cashFlowDraftIssues(draft: {
  name: string
  /** Parsed amount (NaN when unreadable). */
  amount: number
  /** One-off only: "YYYY-MM", or "" for age-based. */
  startDate: string
  once: boolean
}): CashFlowDraftIssue[] {
  const issues = new Set<CashFlowDraftIssue>()
  if (draft.name.trim() === '') issues.add('name')
  if (!Number.isFinite(draft.amount) || Math.round(draft.amount) <= 0) issues.add('amount')
  if (draft.once && draft.startDate.trim() !== '' && !isCompleteMonth(draft.startDate))
    issues.add('date')
  return ORDER.filter((issue) => issues.has(issue))
}
