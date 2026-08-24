import {
  checkRange,
  evaluateNumericDraft,
  hasTimelineErrors,
  isPreviewable,
  parseNumericDraft,
  timelineIssues,
} from '@/lib/validation/fieldValidation'
import { DEFAULT_PARAMS } from '@/types'
import { activeSectionId, PLAN_SECTION_IDS } from '@/components/plans/planSections'

describe('parseNumericDraft', () => {
  it.each(['', '   ', '-', '.', ',', '-.', '+'])('treats %p as still being typed', (raw) => {
    expect(parseNumericDraft(raw)).toEqual({ kind: 'incomplete' })
  })

  it.each(['abc', '12abc', '1.2.3'])('rejects %p as not a number', (raw) => {
    expect(parseNumericDraft(raw)).toEqual({ kind: 'invalid' })
  })

  it('parses plain numbers, including negatives and decimals', () => {
    expect(parseNumericDraft('42')).toEqual({ kind: 'number', value: 42 })
    expect(parseNumericDraft('-3.5')).toEqual({ kind: 'number', value: -3.5 })
  })

  it('uses a supplied parser for grouped input', () => {
    const parse = (raw: string) => Number(raw.replace(/\./g, ''))
    expect(parseNumericDraft('630.000', parse)).toEqual({ kind: 'number', value: 630000 })
  })
})

describe('checkRange', () => {
  it('accepts the bounds themselves', () => {
    expect(checkRange(16, { min: 16, max: 100 })).toBeNull()
    expect(checkRange(100, { min: 16, max: 100 })).toBeNull()
  })

  it('names which side was breached', () => {
    expect(checkRange(15, { min: 16, max: 100 })).toBe('below')
    expect(checkRange(101, { min: 16, max: 100 })).toBe('above')
  })

  it('ignores an absent bound', () => {
    expect(checkRange(-5, { min: undefined, max: 100 })).toBeNull()
    expect(checkRange(1e9, { min: 0 })).toBeNull()
  })
})

describe('evaluateNumericDraft', () => {
  const ageBounds = { min: 16, max: 100 }

  it('commits a value inside the range', () => {
    expect(evaluateNumericDraft('42', ageBounds)).toEqual({ issue: null, value: 42 })
  })

  it('refuses an out-of-range value instead of clamping it', () => {
    // The regression this whole module exists for: typing 150 used to become
    // 100 on blur with nothing said about it.
    expect(evaluateNumericDraft('150', ageBounds)).toEqual({ issue: 'above', value: null })
    expect(evaluateNumericDraft('3', ageBounds)).toEqual({ issue: 'below', value: null })
  })

  it('stays quiet while the field is empty', () => {
    expect(evaluateNumericDraft('', ageBounds)).toEqual({ issue: null, value: null })
  })

  it('flags text that is not a number', () => {
    expect(evaluateNumericDraft('sixty', ageBounds)).toEqual({ issue: 'invalid', value: null })
  })
})

describe('timelineIssues', () => {
  const base = { currentAge: 40, retirementAge: 63, legalRetirementAge: 67, endAge: 90 }

  it('is silent for a coherent timeline', () => {
    expect(timelineIssues(base)).toEqual([])
    expect(hasTimelineErrors(base)).toBe(false)
  })

  it('flags a retirement age at or before today', () => {
    const issues = timelineIssues({ ...base, currentAge: 63 })
    expect(issues.map((issue) => issue.id)).toContain('retirementAfterCurrent')
    expect(hasTimelineErrors({ ...base, currentAge: 63 })).toBe(true)
  })

  it('flags the exact case from the audit: current age 100 against a horizon of 90', () => {
    const issues = timelineIssues({ ...base, currentAge: 100, endAge: 90 })
    expect(issues.map((issue) => issue.id)).toEqual(['retirementAfterCurrent'])
    expect(issues.every((issue) => issue.severity === 'error')).toBe(true)
  })

  it('reports both breaches when the whole timeline collapses', () => {
    const issues = timelineIssues({ ...base, currentAge: 100, retirementAge: 65, endAge: 64 })
    expect(issues.map((issue) => issue.id)).toEqual([
      'retirementAfterCurrent',
      'horizonAfterRetirement',
    ])
  })

  it('flags a horizon that does not outlast retirement', () => {
    expect(timelineIssues({ ...base, endAge: 63 }).map((i) => i.id)).toContain(
      'horizonAfterRetirement'
    )
  })

  it('treats retiring after the statutory age as a warning, not an error', () => {
    const issues = timelineIssues({ ...base, retirementAge: 69, legalRetirementAge: 67 })
    expect(issues).toEqual([
      {
        id: 'retirementAfterLegal',
        severity: 'warning',
        fields: ['retirementAge', 'legalRetirementAge'],
      },
    ])
    expect(hasTimelineErrors({ ...base, retirementAge: 69, legalRetirementAge: 67 })).toBe(false)
  })

  it('names the fields each message is about', () => {
    const issue = timelineIssues({ ...base, endAge: 60 }).find(
      (entry) => entry.id === 'horizonAfterRetirement'
    )
    expect(issue?.fields).toEqual(['retirementAge', 'endAge'])
  })

  it('passes the shipped defaults', () => {
    expect(timelineIssues(DEFAULT_PARAMS)).toEqual([])
  })
})

describe('activeSectionId', () => {
  it('prefers the first section in document order', () => {
    const visible = new Set([PLAN_SECTION_IDS[3], PLAN_SECTION_IDS[1]])
    expect(activeSectionId(PLAN_SECTION_IDS, visible, PLAN_SECTION_IDS[0])).toBe(
      PLAN_SECTION_IDS[1]
    )
  })

  it('keeps the previous choice when nothing is in the band', () => {
    expect(activeSectionId(PLAN_SECTION_IDS, new Set(), PLAN_SECTION_IDS[4])).toBe(
      PLAN_SECTION_IDS[4]
    )
  })

  it('ignores ids it does not know', () => {
    expect(
      activeSectionId(PLAN_SECTION_IDS, new Set(['something-else']), 'plan-editor-market')
    ).toBe('plan-editor-market')
  })
})

describe('wizard preview gate', () => {
  it('is open for the shipped defaults', () => {
    expect(isPreviewable(DEFAULT_PARAMS)).toBe(true)
  })

  it('stays shut while the ages contradict each other', () => {
    expect(isPreviewable({ ...DEFAULT_PARAMS, retirementAge: DEFAULT_PARAMS.currentAge })).toBe(
      false
    )
    expect(isPreviewable({ ...DEFAULT_PARAMS, endAge: DEFAULT_PARAMS.retirementAge })).toBe(false)
  })

  it('stays shut when there is no money in the plan at all', () => {
    expect(isPreviewable({ ...DEFAULT_PARAMS, currentAssets: 0, annualSavings: 0 })).toBe(false)
    expect(isPreviewable({ ...DEFAULT_PARAMS, currentAssets: 0, annualSavings: 1 })).toBe(true)
  })
})
