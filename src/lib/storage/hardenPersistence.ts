import { createJSONStorage, type StateStorage } from 'zustand/middleware'
import { useComparisonStore } from '@/lib/stores/comparisonStore'
import { useDisplayStore } from '@/lib/stores/displayStore'
import { safeGetItem, safeRemoveItem, safeSetItem } from './safeStorage'

/** `localStorage` whose failures are swallowed (a full quota, revoked access). */
const tolerantStorage: StateStorage = {
  getItem: (name) => safeGetItem(name),
  setItem: (name, value) => {
    safeSetItem(name, value)
  },
  removeItem: (name) => safeRemoveItem(name),
}

let hardened = false

/**
 * Points the persisted stores at a storage that never throws.
 *
 * The persist middleware writes synchronously on every `setState` with the
 * default storage, so a full quota (or storage revoked mid-session) turned an
 * ordinary state change — the setup wizard suspending auto-run on mount — into
 * an exception that took the page down. With this the state change happens in
 * memory and the write is simply skipped; `StorageNotice` tells the user.
 *
 * Without usable storage at all (the `localStorage` getter throws) the
 * middleware is not installed (`persist` is undefined) and there is nothing
 * to point anywhere: the stores already run in memory. Idempotent.
 */
export function hardenPersistence(): void {
  if (hardened || typeof window === 'undefined') return
  hardened = true
  // `persist` is typed as always present; without storage it is not.
  // The simulation store is not in this list: it writes through its own
  // adapter (`planStorage`), which never throws either and also merges other
  // tabs' plans and guards newer builds' data. Replacing it here would switch
  // all of that off.
  useDisplayStore.persist?.setOptions({ storage: createJSONStorage(() => tolerantStorage) })
  useComparisonStore.persist?.setOptions({ storage: createJSONStorage(() => tolerantStorage) })
}
