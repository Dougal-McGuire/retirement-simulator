/**
 * `localStorage` without the exceptions.
 *
 * Safari's "Block all cookies", some embedded browsers and locked-down
 * profiles throw on the `window.localStorage` getter itself; a full quota
 * throws on `setItem`. The workspace must keep working in memory either way
 * (the persisted store then simply has no storage), so every access the UI
 * makes goes through these helpers.
 */

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function safeGetItem(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

/** Returns false when the value could not be stored. */
export function safeSetItem(key: string, value: string): boolean {
  try {
    const target = storage()
    if (!target) return false
    target.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function safeRemoveItem(key: string): void {
  try {
    storage()?.removeItem(key)
  } catch {
    // Nothing stored, nothing to remove.
  }
}

const PROBE_KEY = '__storage-probe__'
let probed: boolean | null = null

/**
 * Whether this browser lets the page keep anything between visits: the getter
 * works and a write succeeds. Probed once per page life.
 */
export function isPersistentStorageAvailable(): boolean {
  if (probed !== null) return probed
  if (typeof window === 'undefined') return true
  const target = storage()
  if (!target) return (probed = false)
  try {
    target.setItem(PROBE_KEY, '1')
    target.removeItem(PROBE_KEY)
    probed = true
  } catch {
    probed = false
  }
  return probed
}

/** Test hook: forget the probe result. */
export function resetStorageProbe(): void {
  probed = null
}
