/**
 * Field-level range checks and cross-field timeline checks, shared by the setup
 * wizard and the plan editor.
 *
 * These exist because silently clamping an out-of-range entry on blur is a lie:
 * the user typed 150, the store kept 100, and every derived chip on the card
 * carried on describing a plan nobody asked for. The rule here is the opposite —
 * an unusable entry is *never* committed, it stays on screen with a message
 * next to it, and the last value that made sense keeps driving the simulation.
 */

/** Why a typed value cannot become the field's value. */
export type RangeIssue = 'invalid' | 'below' | 'above'

export interface RangeBounds {
  min?: number
  max?: number
}

/**
 * What the raw text in a number field currently means.
 *
 * `incomplete` is the important one: an empty box, a lone minus sign or a bare
 * decimal point is somebody mid-keystroke, not an error to shout about.
 */
export type DraftParse =
  | { kind: 'incomplete' }
  | { kind: 'invalid' }
  | { kind: 'number'; value: number }

const INCOMPLETE_DRAFTS = new Set(['', '-', '.', ',', '-.', '-,', '+'])

/**
 * Turns the text in a number input into one of the three things it can be.
 *
 * `parse` lets a grouped field ("630.000") hand over its own locale-aware
 * parser; without one this is plain `Number()`.
 */
export function parseNumericDraft(raw: string, parse?: (value: string) => number): DraftParse {
  const trimmed = raw.trim()
  if (INCOMPLETE_DRAFTS.has(trimmed)) return { kind: 'incomplete' }

  const parsed = parse ? parse(trimmed) : Number(trimmed)
  if (!Number.isFinite(parsed)) return { kind: 'invalid' }
  return { kind: 'number', value: parsed }
}

/** `null` when the value is inside the bounds. */
export function checkRange(value: number, bounds: RangeBounds): RangeIssue | null {
  if (bounds.min !== undefined && value < bounds.min) return 'below'
  if (bounds.max !== undefined && value > bounds.max) return 'above'
  return null
}

/**
 * The single verdict a number field needs: `null` means "commit this", anything
 * else means "keep showing what they typed and say why it was refused".
 */
export function evaluateNumericDraft(
  raw: string,
  bounds: RangeBounds,
  parse?: (value: string) => number
): { issue: RangeIssue | null; value: number | null } {
  const parsed = parseNumericDraft(raw, parse)
  if (parsed.kind === 'incomplete') return { issue: null, value: null }
  if (parsed.kind === 'invalid') return { issue: 'invalid', value: null }

  const issue = checkRange(parsed.value, bounds)
  return { issue, value: issue === null ? parsed.value : null }
}

/**
 * True once a parameter set says enough to be worth simulating for a preview.
 *
 * Below this bar the wizard's live strip stays hidden: reporting "0% success"
 * to somebody who has filled in two fields of step one is noise, not feedback.
 */
export function isPreviewable(params: {
  currentAge: number
  retirementAge: number
  endAge: number
  currentAssets: number
  annualSavings: number
}): boolean {
  return (
    Number.isFinite(params.currentAge) &&
    params.currentAge < params.retirementAge &&
    params.retirementAge < params.endAge &&
    params.currentAssets + params.annualSavings > 0
  )
}

/** The ages that have to agree with each other for a plan to mean anything. */
export interface TimelineAges {
  currentAge: number
  retirementAge: number
  legalRetirementAge: number
  endAge: number
}

export type TimelineIssueId =
  | 'retirementAfterCurrent'
  | 'horizonAfterRetirement'
  | 'retirementAfterLegal'

export interface TimelineIssue {
  id: TimelineIssueId
  /** `error` breaks the projection; `warning` is merely unusual. */
  severity: 'error' | 'warning'
  /** DOM ids of the fields the message is about, for focus and highlighting. */
  fields: TimelineField[]
}

export type TimelineField = 'currentAge' | 'retirementAge' | 'legalRetirementAge' | 'endAge'

/**
 * Cross-field checks over the four ages.
 *
 * Ordered hardest-first so a callout that shows only the top issue still shows
 * the one that actually stops the plan from being simulable.
 */
export function timelineIssues(ages: TimelineAges): TimelineIssue[] {
  const issues: TimelineIssue[] = []

  if (ages.retirementAge <= ages.currentAge) {
    issues.push({
      id: 'retirementAfterCurrent',
      severity: 'error',
      fields: ['currentAge', 'retirementAge'],
    })
  }

  if (ages.endAge <= ages.retirementAge) {
    issues.push({
      id: 'horizonAfterRetirement',
      severity: 'error',
      fields: ['retirementAge', 'endAge'],
    })
  }

  // Retiring after the statutory age is legal and occasionally deliberate, so
  // this is a plausibility nudge rather than a refusal.
  if (ages.retirementAge > ages.legalRetirementAge) {
    issues.push({
      id: 'retirementAfterLegal',
      severity: 'warning',
      fields: ['retirementAge', 'legalRetirementAge'],
    })
  }

  return issues
}

/** True when nothing about the timeline is outright broken. */
export function hasTimelineErrors(ages: TimelineAges): boolean {
  return timelineIssues(ages).some((issue) => issue.severity === 'error')
}
