/**
 * Colour-scheme preference: "system" (default, follows the OS), or an explicit
 * "light" / "dark" override.
 *
 * The CSS does the actual theming at token level (src/app/interface.css):
 * without an attribute the `prefers-color-scheme` media query decides; an
 * explicit choice is written to `<html data-color-scheme="light|dark">`, which
 * both forces the dark tokens and suppresses the media query for "light".
 *
 * The stored preference is applied before first paint by the inline script in
 * the root layout (`COLOR_SCHEME_INIT_SCRIPT`), so there is no flash of the
 * wrong scheme. Every storage access is wrapped: private windows, blocked site
 * data and previews may throw or come back empty, and the page must still
 * render (it then simply follows the OS).
 */

export const COLOR_SCHEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ColorSchemePreference = (typeof COLOR_SCHEME_PREFERENCES)[number]
export type ResolvedColorScheme = 'light' | 'dark'

export const COLOR_SCHEME_STORAGE_KEY = 'color-scheme-preference'
export const COLOR_SCHEME_ATTRIBUTE = 'data-color-scheme'
/** Same-tab change notification (the `storage` event only fires in other tabs). */
export const COLOR_SCHEME_CHANGE_EVENT = 'color-scheme-preference-change'

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem' | 'removeItem'>

/** Normalises anything read from storage; unknown values mean "system". */
export function parseColorSchemePreference(value: unknown): ColorSchemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/** The scheme actually shown for a preference, given the OS setting. */
export function resolveColorScheme(
  preference: ColorSchemePreference,
  systemPrefersDark: boolean
): ResolvedColorScheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

/**
 * Value for the `data-color-scheme` attribute, or `null` to remove it and let
 * the media query decide.
 */
export function colorSchemeAttribute(preference: ColorSchemePreference): 'light' | 'dark' | null {
  return preference === 'system' ? null : preference
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readColorSchemePreference(
  storage: ReadableStorage | null = defaultStorage()
): ColorSchemePreference {
  if (!storage) return 'system'
  try {
    return parseColorSchemePreference(storage.getItem(COLOR_SCHEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

/** Persists a preference ("system" clears the key). Returns false if storage failed. */
export function writeColorSchemePreference(
  preference: ColorSchemePreference,
  storage: WritableStorage | null = defaultStorage()
): boolean {
  if (!storage) return false
  try {
    if (preference === 'system') storage.removeItem(COLOR_SCHEME_STORAGE_KEY)
    else storage.setItem(COLOR_SCHEME_STORAGE_KEY, preference)
    return true
  } catch {
    return false
  }
}

/** Reflects a preference on the root element (no-op outside the browser). */
export function applyColorSchemePreference(
  preference: ColorSchemePreference,
  root: Pick<Element, 'setAttribute' | 'removeAttribute'> | null = typeof document === 'undefined'
    ? null
    : document.documentElement
): void {
  if (!root) return
  const attribute = colorSchemeAttribute(preference)
  if (attribute) root.setAttribute(COLOR_SCHEME_ATTRIBUTE, attribute)
  else root.removeAttribute(COLOR_SCHEME_ATTRIBUTE)
}

/**
 * Inline, dependency-free twin of `readColorSchemePreference` +
 * `applyColorSchemePreference`, run in <head> before the body paints.
 */
export const COLOR_SCHEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  COLOR_SCHEME_STORAGE_KEY
)});if(p==="light"||p==="dark")document.documentElement.setAttribute(${JSON.stringify(
  COLOR_SCHEME_ATTRIBUTE
)},p)}catch(e){}})();`
