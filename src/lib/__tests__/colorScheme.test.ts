import fs from 'node:fs'
import path from 'node:path'
import {
  COLOR_SCHEME_ATTRIBUTE,
  COLOR_SCHEME_INIT_SCRIPT,
  COLOR_SCHEME_STORAGE_KEY,
  applyColorSchemePreference,
  colorSchemeAttribute,
  parseColorSchemePreference,
  readColorSchemePreference,
  resolveColorScheme,
  writeColorSchemePreference,
} from '@/lib/colorScheme'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

const throwingStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

function fakeRoot() {
  const attributes = new Map<string, string>()
  return {
    attributes,
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
  }
}

describe('colour scheme preference', () => {
  it('parses stored values, falling back to system', () => {
    expect(parseColorSchemePreference('light')).toBe('light')
    expect(parseColorSchemePreference('dark')).toBe('dark')
    expect(parseColorSchemePreference('system')).toBe('system')
    for (const junk of [null, undefined, '', 'DARK', 'elegant', 1, {}]) {
      expect(parseColorSchemePreference(junk)).toBe('system')
    }
  })

  it('resolves system against the OS setting and keeps explicit choices', () => {
    expect(resolveColorScheme('system', true)).toBe('dark')
    expect(resolveColorScheme('system', false)).toBe('light')
    expect(resolveColorScheme('light', true)).toBe('light')
    expect(resolveColorScheme('dark', false)).toBe('dark')
  })

  it('maps preferences to the root attribute (system removes it)', () => {
    expect(colorSchemeAttribute('system')).toBeNull()
    expect(colorSchemeAttribute('light')).toBe('light')
    expect(colorSchemeAttribute('dark')).toBe('dark')

    const root = fakeRoot()
    applyColorSchemePreference('dark', root)
    expect(root.attributes.get(COLOR_SCHEME_ATTRIBUTE)).toBe('dark')
    applyColorSchemePreference('light', root)
    expect(root.attributes.get(COLOR_SCHEME_ATTRIBUTE)).toBe('light')
    applyColorSchemePreference('system', root)
    expect(root.attributes.has(COLOR_SCHEME_ATTRIBUTE)).toBe(false)
  })

  it('round-trips through storage; system clears the key', () => {
    const storage = memoryStorage()
    expect(readColorSchemePreference(storage)).toBe('system')
    expect(writeColorSchemePreference('dark', storage)).toBe(true)
    expect(storage.data.get(COLOR_SCHEME_STORAGE_KEY)).toBe('dark')
    expect(readColorSchemePreference(storage)).toBe('dark')
    expect(writeColorSchemePreference('system', storage)).toBe(true)
    expect(storage.data.has(COLOR_SCHEME_STORAGE_KEY)).toBe(false)
    expect(readColorSchemePreference(storage)).toBe('system')
  })

  it('survives unavailable or throwing storage', () => {
    expect(readColorSchemePreference(null)).toBe('system')
    expect(writeColorSchemePreference('dark', null)).toBe(false)
    expect(readColorSchemePreference(throwingStorage)).toBe('system')
    expect(writeColorSchemePreference('dark', throwingStorage)).toBe(false)
    expect(writeColorSchemePreference('system', throwingStorage)).toBe(false)
  })

  it('pre-paint script applies only valid stored overrides and never throws', () => {
    const run = (storage: unknown) => {
      const root = fakeRoot()
      new Function('localStorage', 'document', COLOR_SCHEME_INIT_SCRIPT)(storage, {
        documentElement: root,
      })
      return root.attributes.get(COLOR_SCHEME_ATTRIBUTE)
    }
    expect(run(memoryStorage({ [COLOR_SCHEME_STORAGE_KEY]: 'dark' }))).toBe('dark')
    expect(run(memoryStorage({ [COLOR_SCHEME_STORAGE_KEY]: 'light' }))).toBe('light')
    expect(run(memoryStorage({ [COLOR_SCHEME_STORAGE_KEY]: 'elegant' }))).toBeUndefined()
    expect(run(memoryStorage())).toBeUndefined()
    expect(run(throwingStorage)).toBeUndefined()
  })
})

describe('interface.css dark tokens', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/app/interface.css'), 'utf8')

  /** Declarations of the first rule whose selector matches, comments stripped. */
  function declarations(selector: string): string[] {
    const start = css.indexOf(`${selector} {`)
    expect(start).toBeGreaterThan(-1)
    const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
    return body
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(';')
      .map((line) => line.trim())
      .filter(Boolean)
  }

  it('keeps the media-query and explicit-override dark blocks identical', () => {
    const media = declarations(":root:not([data-color-scheme='light'])")
    const explicit = declarations(":root[data-color-scheme='dark']")
    expect(media.length).toBeGreaterThan(50)
    expect(explicit).toEqual(media)
    expect(media).toContain('color-scheme: dark')
  })

  it('only redefines tokens that the light scheme declares', () => {
    const light = new Set(
      declarations(':root')
        .map((line) => line.split(':')[0])
        .filter((name) => name.startsWith('--'))
    )
    const dark = declarations(":root[data-color-scheme='dark']")
      .map((line) => line.split(':')[0])
      .filter((name) => name.startsWith('--'))
    expect(dark.filter((name) => !light.has(name))).toEqual([])
  })
})
