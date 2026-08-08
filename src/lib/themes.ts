export const THEME_STORAGE_KEY = 'retirement-simulator-theme'

export const THEME_OPTIONS = [
  {
    id: 'neo',
    translationKey: 'neo',
    swatches: ['#05080f', '#ffffff', '#0e67f6', '#f6c90e'],
  },
  {
    id: 'klar',
    translationKey: 'klar',
    swatches: ['#f7f9fc', '#161c29', '#1747c9', '#0e8a5f'],
  },
  {
    id: 'elegant',
    translationKey: 'elegant',
    swatches: ['#0b0f17', '#131924', '#c9a961', '#3280dd'],
  },
  {
    id: 'spiel',
    translationKey: 'spiel',
    swatches: ['#fff6ec', '#e54d42', '#f6b93b', '#118f94'],
  },
] as const

export type ThemeId = (typeof THEME_OPTIONS)[number]['id']

export const DEFAULT_THEME_ID: ThemeId = 'neo'
export const THEME_IDS = THEME_OPTIONS.map((theme) => theme.id)

/**
 * Themes that no longer exist, mapped to their nearest surviving neighbour.
 *
 * A stored value from an earlier build must not silently reset every returning
 * visitor to the default: `aurora` was the dark option, so it lands on the new
 * dark theme; the three light experiments land on the light analytical one.
 */
export const LEGACY_THEME_ALIASES: Record<string, ThemeId> = {
  aurora: 'elegant',
  signal: 'klar',
  prism: 'klar',
  ledger: 'klar',
}

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId)
}

/** Resolve a persisted (possibly stale) theme id to one this build can render. */
export function resolveThemeId(value: string | null | undefined): ThemeId {
  if (isThemeId(value)) return value
  if (value && value in LEGACY_THEME_ALIASES) return LEGACY_THEME_ALIASES[value]
  return DEFAULT_THEME_ID
}
