export const THEME_STORAGE_KEY = 'retirement-simulator-theme'

export const THEME_OPTIONS = [
  {
    id: 'neo',
    translationKey: 'neo',
    swatches: ['#05080f', '#ffffff', '#0e67f6', '#f6c90e'],
  },
  {
    id: 'aurora',
    translationKey: 'aurora',
    swatches: ['#08111f', '#19e6ff', '#ff52b2', '#dcff4d'],
  },
  {
    id: 'ledger',
    translationKey: 'ledger',
    swatches: ['#123036', '#fafeff', '#0070c0', '#d3ff57'],
  },
  {
    id: 'prism',
    translationKey: 'prism',
    swatches: ['#322c63', '#6a56ff', '#43d6e6', '#ff4e89'],
  },
  {
    id: 'signal',
    translationKey: 'signal',
    swatches: ['#0c1826', '#00cfbe', '#ea46aa', '#ffdd46'],
  },
] as const

export type ThemeId = (typeof THEME_OPTIONS)[number]['id']

export const DEFAULT_THEME_ID: ThemeId = 'neo'
export const THEME_IDS = THEME_OPTIONS.map((theme) => theme.id)

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId)
}
