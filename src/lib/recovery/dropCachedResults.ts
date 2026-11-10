import { BASE_STORE_KEY } from '@/lib/stores/persistenceKey'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * Removes the cached simulation results from every persisted copy of the
 * workspace store (the signed-out key and each account's namespaced key),
 * leaving plans, the working copy and everything else untouched.
 *
 * Used by the error screens' "discard saved results and reload": a payload
 * that crashes the charts would otherwise crash them again on every reload,
 * while the plans are the user's work and are never at fault for a render
 * error. Deliberately store-free (plain storage access) so it still works when
 * the store module itself is what failed. Returns how many copies changed.
 */
export function dropCachedResults(storage: StorageLike | null = defaultStorage()): number {
  if (!storage) return 0
  let changed = 0
  let keys: string[] = []
  try {
    keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string =>
        key !== null && (key === BASE_STORE_KEY || key.startsWith(`${BASE_STORE_KEY}::`))
    )
  } catch {
    return 0
  }
  for (const key of keys) {
    try {
      const raw = storage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as unknown
      if (typeof parsed !== 'object' || parsed === null) continue
      const state = (parsed as { state?: unknown }).state
      if (typeof state !== 'object' || state === null) continue
      if (!('results' in state) || (state as { results?: unknown }).results === null) continue
      ;(state as { results: unknown }).results = null
      storage.setItem(key, JSON.stringify(parsed))
      changed += 1
    } catch {
      // An unreadable copy stays as it is; the store's own rehydration copes.
    }
  }
  return changed
}
