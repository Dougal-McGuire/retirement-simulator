import {
  GROUP_ALIASES,
  HASH_ALIASES,
  WORKSPACE_SECTIONS,
  WORKSPACE_TARGETS,
  formatWorkspaceHash,
  groupForTarget,
  parseWorkspaceHash,
  pickActiveSection,
  type WorkspaceHash,
} from '@/components/workspace/workspaceNav'
import { COLUMN_GROUP_IDS } from '@/components/plans/planSections'

describe('workspace hash grammar', () => {
  it.each<[string, WorkspaceHash]>([
    ['#result', { compare: false, section: 'result' }],
    ['#assumptions', { compare: false, section: 'assumptions' }],
    ['#cashflow:market', { compare: false, section: 'cashflow', group: 'market' }],
    ['#assumptions:flows', { compare: false, section: 'assumptions', group: 'flows' }],
    ['#withdrawal:rule', { compare: false, section: 'withdrawal', group: 'rule' }],
    ['#levers', { compare: false, section: 'levers' }],
    ['#compare', { compare: true }],
  ])('round-trips %s', (hash, state) => {
    expect(parseWorkspaceHash(hash)).toEqual(state)
    expect(formatWorkspaceHash(state)).toBe(hash)
  })

  it('names the canvas sections, and the column as a fifth target', () => {
    expect(WORKSPACE_SECTIONS).toEqual(['result', 'cashflow', 'withdrawal', 'levers'])
    expect(WORKSPACE_TARGETS).toEqual(['result', 'assumptions', 'cashflow', 'withdrawal', 'levers'])
  })

  it('accepts every column group after the colon', () => {
    for (const group of COLUMN_GROUP_IDS) {
      expect(parseWorkspaceHash(`#assumptions:${group}`)).toEqual({
        compare: false,
        section: 'assumptions',
        group,
      })
    }
  })

  it('accepts the German aliases on input and writes the English ids', () => {
    expect(parseWorkspaceHash('#ergebnis')).toEqual({ compare: false, section: 'result' })
    expect(parseWorkspaceHash('#annahmen:person')).toEqual({
      compare: false,
      section: 'assumptions',
      group: 'person',
    })
    expect(parseWorkspaceHash('#geldfluss')).toEqual({ compare: false, section: 'cashflow' })
    expect(parseWorkspaceHash('#entnahme')).toEqual({ compare: false, section: 'withdrawal' })
    expect(parseWorkspaceHash('#stellschrauben')).toEqual({ compare: false, section: 'levers' })
    expect(parseWorkspaceHash('#wirkung')).toEqual({ compare: false, section: 'levers' })
    expect(parseWorkspaceHash('#vergleich')).toEqual({ compare: true })
    expect(parseWorkspaceHash('#entnahme:regel')).toEqual({
      compare: false,
      section: 'withdrawal',
      group: 'rule',
    })
    expect(formatWorkspaceHash(parseWorkspaceHash('#geldfluss:markt')!)).toBe('#cashflow:market')
    // Every alias targets a real target (or compare), every group alias a real group.
    for (const target of Object.values(HASH_ALIASES)) {
      expect([...WORKSPACE_TARGETS, 'compare']).toContain(target)
    }
    for (const group of Object.values(GROUP_ALIASES)) {
      expect(COLUMN_GROUP_IDS).toContain(group)
    }
  })

  it('is lenient about case, a missing # and an unknown group', () => {
    expect(parseWorkspaceHash('Result')).toEqual({ compare: false, section: 'result' })
    expect(parseWorkspaceHash('#cashflow:bogus')).toEqual({ compare: false, section: 'cashflow' })
    expect(parseWorkspaceHash('#compare:market')).toEqual({ compare: true })
  })

  it.each(['', '#', '#main-content', '#navigation', '#edit-panel', '#person', '#%E0%A4%A'])(
    'ignores %p, which is not ours',
    (hash) => {
      expect(parseWorkspaceHash(hash)).toBeNull()
    }
  )

  it('opens the rule beside the Entnahme outcome, and nothing for the other sections', () => {
    expect(groupForTarget('withdrawal')).toBe('rule')
    for (const target of ['result', 'assumptions', 'cashflow', 'levers'] as const) {
      expect(groupForTarget(target)).toBeUndefined()
    }
  })
})

describe('pickActiveSection', () => {
  const tops = (values: number[]) =>
    WORKSPACE_SECTIONS.map((id, index) => ({ id, top: values[index] }))

  it('starts on the first section at the top of the page', () => {
    expect(pickActiveSection(tops([80, 900, 1600, 2400]), 250, false)).toBe('result')
  })

  it('also picks the first section when nothing has reached the line yet', () => {
    expect(pickActiveSection(tops([400, 900, 1600, 2400]), 250, false)).toBe('result')
  })

  it('picks the last section whose top passed the reading line', () => {
    expect(pickActiveSection(tops([-1800, 120, 800, 1600]), 250, false)).toBe('cashflow')
  })

  it('treats a top exactly on the reading line as reached', () => {
    expect(pickActiveSection(tops([-1800, 250, 900, 1800]), 250, false)).toBe('cashflow')
    expect(pickActiveSection(tops([-1800, 251, 900, 1800]), 250, false)).toBe('result')
  })

  it('hands the last section the index at the bottom of the page', () => {
    expect(pickActiveSection(tops([-4000, -2000, -300, 600]), 250, true)).toBe('levers')
    expect(pickActiveSection(tops([-4000, -2000, -300, 600]), 250, false)).toBe('withdrawal')
  })

  it('falls back to the first section without any measurements', () => {
    expect(pickActiveSection([], 250, false)).toBe('result')
  })
})
