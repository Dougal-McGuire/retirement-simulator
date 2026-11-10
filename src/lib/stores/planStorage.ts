/**
 * The localStorage adapter behind the simulation store's `persist` middleware.
 *
 * `persist` rewrites its whole entry on every `set()`, and its stock JSON
 * storage does so blindly. In a real browser that loses data in three ways,
 * and this adapter is the answer to each:
 *
 *  1. ANOTHER TAB. Two tabs share one entry; the last one to write used to win
 *     with its whole plan list. The adapter looks before it writes: when the
 *     entry is not the one this tab last read or wrote, the store gets both
 *     versions first (`onForeignChange`) and merges the plans — nothing is
 *     written over an entry this tab has not seen.
 *  2. ANOTHER BUILD. Every entry is stamped with the plan schema version of
 *     the build that wrote it. An entry from a *newer* build (store version or
 *     plan schema) is never written over: the key goes read-only for this
 *     page, the store runs from what it could read, and `onReadOnly` asks for
 *     a reload. An old tab can no longer "migrate" newer plans downwards.
 *  3. A FAILING WRITE. Quota, private mode, blocked storage: `setItem` throws,
 *     and used to throw straight through the store action that called `set()`.
 *     The adapter never throws; the failure lands in `useLocalSaveStore`, and
 *     the action carries on in memory.
 *
 * WHO OWNS WHAT IN THE ENTRY. Part of the entry is shared by every tab (the
 * plans), part of it is one tab's session: which plan is open and the unsaved
 * draft on it (`sessionFields`). A tab only writes its session part when that
 * part changed *in this tab*; any other write — a merge, a success rate, a
 * plan saved from a menu — stores the shared part and leaves the session part
 * on disk alone. So a tab sitting in the background never replaces the draft
 * of the tab being worked in, and a reload brings back the session that was
 * edited last.
 *
 * A `set()` that changes nothing stored (a run starting, results landing)
 * costs neither a serialization nor a write.
 */

import { create } from 'zustand'
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { isRecord } from '@/lib/isRecord'

/** A store entry as it sits in localStorage. */
export interface StoredBlob {
  state: Record<string, unknown>
  /** `persist` store version; `null` when the entry states none. */
  version: number | null
  /**
   * Plan schema version of the build that wrote the entry; `null` for entries
   * from before the stamp existed.
   */
  planSchema: number | null
}

/** Tolerant parse of a store entry: anything unusable reads as absent. */
export function parseStoredBlob(raw: string | null | undefined): StoredBlob | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null

  const version = parsed.version
  const planSchema = parsed.planSchema
  return {
    state: isRecord(parsed.state) ? parsed.state : {},
    version: typeof version === 'number' && Number.isFinite(version) ? version : null,
    planSchema: typeof planSchema === 'number' && Number.isFinite(planSchema) ? planSchema : null,
  }
}

/** An entry another tab wrote, next to the one this tab last knew. */
export interface ForeignChange {
  theirs: StoredBlob
  /** What this tab last read from, or wrote to, the entry; `null` if nothing. */
  base: StoredBlob | null
}

/**
 * Why the plans are not reaching this device's storage right now.
 *
 *  - `write-failed`: the browser refused the write (full, private mode, blocked).
 *  - `read-only`: the entry belongs to a newer build; this tab must not touch it.
 */
export type LocalSaveProblem = 'write-failed' | 'read-only'

interface LocalSaveState {
  /** Set by a write that did not happen, cleared by the next one that did. */
  problem: LocalSaveProblem | null
}

/** Status of local persistence, for the notice (`LocalSaveNotice`). Not persisted. */
export const useLocalSaveStore = create<LocalSaveState>()(() => ({ problem: null }))

const reportProblem = (problem: LocalSaveProblem | null): void => {
  if (useLocalSaveStore.getState().problem !== problem) useLocalSaveStore.setState({ problem })
}

export interface PlanStorageOptions<S> {
  /** This build's `persist` version. */
  storeVersion: number
  /** This build's plan schema version, stamped on every entry it writes. */
  planSchema: number
  /** State fields that are one tab's session rather than shared data. */
  sessionFields: readonly string[]
  /** Called once when an entry turns out to be from a newer build. */
  onReadOnly?: (name: string) => void
  /**
   * Called, with writes switched off, when a write finds an entry this tab has
   * not seen. Merges it into the store; returns whether the store changed.
   */
  onForeignChange?: (change: ForeignChange) => boolean
  /** The store's persisted fields as they are now. */
  snapshot?: () => S
}

export interface PlanStorage<S> extends PersistStorage<S> {
  /**
   * The entry under `name` if another tab changed it since this tab last
   * looked, together with the version this tab knew. Marks it as seen.
   */
  takeForeignChange: (name: string) => ForeignChange | null
  /**
   * Tells the adapter that, as far as this tab is concerned, the entry holds
   * `state`: after loading it, or after adopting another tab's version. The
   * next write then happens only for what changes from here.
   */
  remember: (name: string, state: S) => void
  /** Makes the next `set()` write even if nothing changed in this tab. */
  markStale: (name: string) => void
  /** Whether the entry under `name` belongs to a newer build. */
  isReadOnly: (name: string) => boolean
  /** Runs `fn` with writes switched off, for state changes that are memory-only. */
  withoutWriting: <T>(fn: () => T) => T
}

const sameFields = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]))
}

/**
 * Builds the adapter. Returns `undefined` without a `window` (server render),
 * where `persist` then runs without storage — as it does with its stock one.
 */
export function createPlanStorage<S>(options: PlanStorageOptions<S>): PlanStorage<S> | undefined {
  if (typeof window === 'undefined') return undefined

  // Merely touching `localStorage` throws where storage is blocked. The store
  // must still hydrate (to its defaults) and work in memory.
  let area: Storage | null = null
  try {
    area = window.localStorage ?? null
  } catch {
    area = null
  }

  /** Raw entry per key as this tab last read or wrote it. */
  const lastSeen = new Map<string, string | null>()
  /** This tab's persisted fields per key, as of its last write or `remember`. */
  const known = new Map<string, Record<string, unknown>>()
  const stale = new Set<string>()
  const readOnly = new Set<string>()
  let writing = true

  const read = (name: string): string | null => {
    if (!area) return null
    try {
      return area.getItem(name)
    } catch {
      return null
    }
  }

  const isNewer = (blob: StoredBlob): boolean =>
    (blob.version ?? 0) > options.storeVersion || (blob.planSchema ?? 0) > options.planSchema

  const markReadOnly = (name: string): void => {
    if (readOnly.has(name)) return
    readOnly.add(name)
    options.onReadOnly?.(name)
  }

  const withoutWriting = <T>(fn: () => T): T => {
    const before = writing
    writing = false
    try {
      return fn()
    } finally {
      writing = before
    }
  }

  const takeForeignChange = (name: string): ForeignChange | null => {
    if (!writing || readOnly.has(name)) return null

    const raw = read(name)
    const seen = lastSeen.get(name) ?? null
    if (raw === seen) return null
    lastSeen.set(name, raw)

    const theirs = parseStoredBlob(raw)
    if (!theirs) {
      // Removed (storage cleared) or unreadable: the next write puts it back.
      stale.add(name)
      return null
    }
    if (isNewer(theirs)) {
      markReadOnly(name)
      return null
    }
    return { theirs, base: parseStoredBlob(seen) }
  }

  return {
    getItem: (name) => {
      const raw = read(name)
      lastSeen.set(name, raw)
      known.delete(name)
      stale.delete(name)

      const blob = parseStoredBlob(raw)
      if (blob && isNewer(blob)) markReadOnly(name)
      else readOnly.delete(name)

      if (!blob) return null
      const value: StorageValue<S> = { state: blob.state as S }
      if (blob.version !== null) value.version = blob.version
      return value
    },

    setItem: (name, value) => {
      if (!writing) return
      if (readOnly.has(name)) {
        reportProblem('read-only')
        return
      }

      let state = value.state as Record<string, unknown>
      const before = known.get(name)
      if (before && !stale.has(name) && sameFields(before, state)) return

      const change = takeForeignChange(name)
      if (readOnly.has(name)) {
        reportProblem('read-only')
        return
      }
      if (change && options.onForeignChange && options.snapshot) {
        // The store merges the other tab's plans into its state, in memory;
        // the write below then stores the result in one go.
        const merge = options.onForeignChange
        if (withoutWriting(() => merge(change))) {
          state = options.snapshot() as Record<string, unknown>
        }
      }

      // The session part is this tab's to write only if it changed here; the
      // one on disk is only worth keeping if it has this build's shape.
      const disk = parseStoredBlob(lastSeen.get(name))
      const keepsDiskSession =
        before !== undefined &&
        disk !== null &&
        disk.version === options.storeVersion &&
        options.sessionFields.every((field) => Object.is(before[field], state[field]))
      const stored: Record<string, unknown> = { ...state }
      if (keepsDiskSession) {
        for (const field of options.sessionFields) {
          if (field in disk.state) stored[field] = disk.state[field]
        }
      }

      try {
        if (!area) throw new Error('localStorage is unavailable')
        const raw = JSON.stringify({
          state: stored,
          version: value.version,
          planSchema: options.planSchema,
        })
        area.setItem(name, raw)
        lastSeen.set(name, raw)
        known.set(name, state)
        stale.delete(name)
        reportProblem(null)
      } catch {
        // `known` stays as it was: everything since the last write that
        // worked is still owed, and the next `set()` tries again.
        stale.add(name)
        reportProblem('write-failed')
      }
    },

    removeItem: (name) => {
      if (!writing || readOnly.has(name) || !area) return
      try {
        area.removeItem(name)
        lastSeen.set(name, null)
        known.delete(name)
      } catch {
        // Nothing to undo: the entry simply stays.
      }
    },

    takeForeignChange,
    remember: (name, state) => {
      // Not while a failed write is still owed: that state is in no entry.
      if (useLocalSaveStore.getState().problem === 'write-failed') return
      known.set(name, state as Record<string, unknown>)
    },
    markStale: (name) => {
      stale.add(name)
    },
    isReadOnly: (name) => readOnly.has(name),
    withoutWriting,
  }
}
