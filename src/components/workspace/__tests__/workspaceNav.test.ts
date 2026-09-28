import {
  HASH_ALIASES,
  WORKSPACE_SECTIONS,
  formatWorkspaceHash,
  parseWorkspaceHash,
  pickActiveSection,
  type WorkspaceHash,
} from '@/components/workspace/workspaceNav'

describe('workspace hash grammar', () => {
  it.each<[string, WorkspaceHash]>([
    ['#result', { compare: false, section: 'result' }],
    ['#assumptions', { compare: false, section: 'assumptions' }],
    ['#cashflow:market', { compare: false, section: 'cashflow', panel: 'market' }],
    ['#assumptions:flows', { compare: false, section: 'assumptions', panel: 'flows' }],
    ['#levers', { compare: false, section: 'levers' }],
    ['#compare', { compare: true }],
  ])('round-trips %s', (hash, state) => {
    expect(parseWorkspaceHash(hash)).toEqual(state)
    expect(formatWorkspaceHash(state)).toBe(hash)
  })

  it('accepts the German aliases on input and writes the English ids', () => {
    expect(parseWorkspaceHash('#ergebnis')).toEqual({ compare: false, section: 'result' })
    expect(parseWorkspaceHash('#annahmen:person')).toEqual({
      compare: false,
      section: 'assumptions',
      panel: 'person',
    })
    expect(parseWorkspaceHash('#geldfluss')).toEqual({ compare: false, section: 'cashflow' })
    expect(parseWorkspaceHash('#entnahme')).toEqual({ compare: false, section: 'withdrawal' })
    expect(parseWorkspaceHash('#stellschrauben')).toEqual({ compare: false, section: 'levers' })
    expect(parseWorkspaceHash('#vergleich')).toEqual({ compare: true })
    expect(formatWorkspaceHash(parseWorkspaceHash('#geldfluss:market')!)).toBe('#cashflow:market')
    // Every alias targets a real section (or compare).
    for (const target of Object.values(HASH_ALIASES)) {
      expect([...WORKSPACE_SECTIONS, 'compare']).toContain(target)
    }
  })

  it('is lenient about case, a missing # and an unknown panel', () => {
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
})

describe('pickActiveSection', () => {
  const tops = (values: number[]) =>
    WORKSPACE_SECTIONS.map((id, index) => ({ id, top: values[index] }))

  it('starts on the first section at the top of the page', () => {
    expect(pickActiveSection(tops([80, 900, 1600, 2400, 3200]), 250, false)).toBe('result')
  })

  it('also picks the first section when nothing has reached the line yet', () => {
    expect(pickActiveSection(tops([400, 900, 1600, 2400, 3200]), 250, false)).toBe('result')
  })

  it('picks the last section whose top passed the reading line', () => {
    expect(pickActiveSection(tops([-1800, -900, 120, 800, 1600]), 250, false)).toBe('cashflow')
  })

  it('treats a top exactly on the reading line as reached', () => {
    expect(pickActiveSection(tops([-1800, 250, 900, 1800, 2600]), 250, false)).toBe('assumptions')
    expect(pickActiveSection(tops([-1800, 251, 900, 1800, 2600]), 250, false)).toBe('result')
  })

  it('hands the last section the index at the bottom of the page', () => {
    expect(pickActiveSection(tops([-4000, -3000, -2000, -300, 600]), 250, true)).toBe('levers')
    expect(pickActiveSection(tops([-4000, -3000, -2000, -300, 600]), 250, false)).toBe('withdrawal')
  })

  it('falls back to the first section without any measurements', () => {
    expect(pickActiveSection([], 250, false)).toBe('result')
  })
})
