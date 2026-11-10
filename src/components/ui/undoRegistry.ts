/**
 * The Undo actions of the toasts on screen, newest last.
 *
 * Ctrl/Cmd+Z (handled by `ToastProvider`) runs the newest one, so an undo is
 * one keystroke away from the control that caused it — a keyboard user never
 * has to travel to the toast stack in the corner first.
 */
interface UndoEntry {
  toastId: string
  run: () => void
  at: number
}

let entries: UndoEntry[] = []

export function registerUndo(toastId: string, run: () => void): void {
  entries = [
    ...entries.filter((entry) => entry.toastId !== toastId),
    { toastId, run, at: Date.now() },
  ]
}

export function unregisterUndo(toastId: string): void {
  entries = entries.filter((entry) => entry.toastId !== toastId)
}

/** Runs (and forgets) the newest Undo; false when there is none. */
export function runLatestUndo(): boolean {
  const latest = entries[entries.length - 1]
  if (!latest) return false
  entries = entries.slice(0, -1)
  latest.run()
  return true
}

/** Test hook. */
export function clearUndos(): void {
  entries = []
}

/** Drops the Undo of every toast that is no longer on screen. */
export function pruneUndos(visibleToastIds: ReadonlySet<string>, now = Date.now()): void {
  // A toast registered this very moment may not have reached the stack yet.
  const keep = (entry: UndoEntry) => visibleToastIds.has(entry.toastId) || now - entry.at < 1000
  if (entries.every(keep)) return
  entries = entries.filter(keep)
}
