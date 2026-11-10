import { clearUndos, pruneUndos, registerUndo, runLatestUndo } from '../undoRegistry'

describe('undo registry (Ctrl/Cmd+Z on toasts)', () => {
  beforeEach(() => clearUndos())

  it('runs the newest undo once, then the one before', () => {
    const calls: string[] = []
    registerUndo('a', () => calls.push('a'))
    registerUndo('b', () => calls.push('b'))
    expect(runLatestUndo()).toBe(true)
    expect(runLatestUndo()).toBe(true)
    expect(runLatestUndo()).toBe(false)
    expect(calls).toEqual(['b', 'a'])
  })

  it('forgets the undo of a toast that left the screen, not of a brand-new one', () => {
    const calls: string[] = []
    registerUndo('gone', () => calls.push('gone'))
    registerUndo('fresh', () => calls.push('fresh'))
    const later = Date.now() + 5000
    pruneUndos(new Set(['fresh']), later)
    expect(runLatestUndo()).toBe(true)
    expect(runLatestUndo()).toBe(false)
    expect(calls).toEqual(['fresh'])

    registerUndo('new', () => calls.push('new'))
    pruneUndos(new Set())
    expect(runLatestUndo()).toBe(true)
    expect(calls).toEqual(['fresh', 'new'])
  })
})
