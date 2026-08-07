/**
 * Per-user namespacing of the browser-local persistence keys.
 *
 * The simulator stores everything in `localStorage`; there is no server-side
 * database. When several Google accounts share one browser we still want each
 * account to keep its own plans and parameters, so every storage key gets a
 * suffix derived from a stable, non-reversible hash of the account id.
 *
 * Signed-out users keep the *original, unsuffixed* keys, which means existing
 * data is never migrated, moved or lost by introducing sign-in.
 */

/** Zustand `persist` key for the simulation store. */
export const BASE_STORE_KEY = 'retirement-simulator-store'
/** Legacy standalone params snapshot key (`saveToStorage` / `loadFromStorage`). */
export const BASE_PARAMS_KEY = 'retirement-simulator-params'
/** Saved setups key. */
export const BASE_SAVED_SETUPS_KEY = 'retirement-simulator-saved-setups'

const NAMESPACE_SEPARATOR = '::'
const USER_NAMESPACE_PREFIX = 'u-'

/**
 * 64-bit FNV-1a style hash rendered as 16 lowercase hex chars.
 *
 * Deliberately *not* a crypto hash: it runs synchronously in the browser and
 * only needs to be stable and collision-free for the handful of accounts that
 * ever share a device. It also guarantees the raw account id (which may be an
 * e-mail address) never lands in a localStorage key.
 */
export function hashUserId(userId: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x1000193

  for (let index = 0; index < userId.length; index += 1) {
    const code = userId.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ (code + index), 0x85ebca6b) >>> 0
  }

  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`
}

const normalizeUserId = (userId: string | null | undefined): string | null => {
  if (typeof userId !== 'string') return null
  const trimmed = userId.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Resolve the storage key for `baseKey` given an account id.
 * Returns `baseKey` unchanged for signed-out / unknown users.
 */
export function namespaceStorageKey(baseKey: string, userId: string | null | undefined): string {
  const normalized = normalizeUserId(userId)
  if (!normalized) return baseKey
  return `${baseKey}${NAMESPACE_SEPARATOR}${USER_NAMESPACE_PREFIX}${hashUserId(normalized)}`
}

let activeUserId: string | null = null

/**
 * Record the currently signed-in account id. Must be called *before*
 * re-pointing the persist middleware so auxiliary keys resolve consistently.
 */
export function setActiveAuthUserId(userId: string | null | undefined): void {
  activeUserId = normalizeUserId(userId)
}

export function getActiveAuthUserId(): string | null {
  return activeUserId
}

/** Storage key for `baseKey` scoped to whoever is currently signed in. */
export function storageKey(baseKey: string): string {
  return namespaceStorageKey(baseKey, activeUserId)
}
