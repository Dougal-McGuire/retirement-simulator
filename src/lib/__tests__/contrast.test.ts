import fs from 'node:fs'
import path from 'node:path'

/**
 * WCAG contrast guard for the interface tokens (spec §6.8). Parses
 * src/app/interface.css, resolves every token in the light scheme and in the
 * dark scheme (light values overridden by the explicit dark block), and checks
 * the text and graphic pairs the workspace relies on.
 *
 * Understands the colour syntaxes the file uses: hex, `rgb()` (including
 * `rgb(var(--x-rgb))` channel tokens), `oklch()` (through OKLab to sRGB) and
 * `color-mix(in srgb, …)`.
 */

const css = fs.readFileSync(path.join(process.cwd(), 'src/app/interface.css'), 'utf8')

function declarations(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`selector not found: ${selector}`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const map = new Map<string, string>()
  for (const line of body.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const name = line.slice(0, colon).trim()
    if (name.startsWith('--')) map.set(name, line.slice(colon + 1).trim())
  }
  return map
}

const LIGHT = declarations(':root')
const DARK = new Map([...LIGHT, ...declarations(":root[data-color-scheme='dark']")])
const SCHEMES = { light: LIGHT, dark: DARK } as const
type Scheme = keyof typeof SCHEMES

/** Gamma-encoded sRGB channels in [0, 1] plus alpha. */
type Rgba = [number, number, number, number]

function resolve(value: string, tokens: Map<string, string>, depth = 0): string {
  if (depth > 12) throw new Error(`token cycle near ${value}`)
  return value.replace(/var\((--[a-z0-9-]+)\)/gi, (_, name: string) => {
    const next = tokens.get(name)
    if (next === undefined) throw new Error(`undefined token ${name}`)
    return resolve(next, tokens, depth + 1)
  })
}

/** Splits on commas that are not inside parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else current += char
  }
  parts.push(current.trim())
  return parts
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const encode = (linear: number) =>
  linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055
const decode = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)

function oklchToRgb(lightness: number, chroma: number, hue: number): [number, number, number] {
  const a = chroma * Math.cos((hue * Math.PI) / 180)
  const b = chroma * Math.sin((hue * Math.PI) / 180)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((linear) => encode(clamp01(linear))) as [number, number, number]
}

function parseColor(raw: string): Rgba {
  const value = raw.trim()
  const hex = value.match(/^#([0-9a-f]{3,8})$/i)
  if (hex) {
    let digits = hex[1]
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('')
    const channels = digits.match(/../g)!.map((pair) => parseInt(pair, 16) / 255)
    return [channels[0], channels[1], channels[2], channels[3] ?? 1]
  }
  const rgb = value.match(/^rgba?\((.*)\)$/i)
  if (rgb) {
    const [r, g, b, a] = rgb[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((part) => (part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part)))
    return [r / 255, g / 255, b / 255, a ?? 1]
  }
  const oklch = value.match(/^oklch\((.*)\)$/i)
  if (oklch) {
    const [l, c, h, alpha] = oklch[1].split(/[\s/]+/).filter(Boolean)
    const lightness = l.endsWith('%') ? parseFloat(l) / 100 : parseFloat(l)
    const [r, g, b] = oklchToRgb(lightness, parseFloat(c), parseFloat(h))
    return [r, g, b, alpha === undefined ? 1 : parseFloat(alpha)]
  }
  const mix = value.match(/^color-mix\(in srgb,(.*)\)$/i)
  if (mix) {
    const [first, second] = splitTopLevel(mix[1]).map((part) => {
      const weight = part.match(/\s(\d+(?:\.\d+)?)%$/)
      return {
        color: parseColor(weight ? part.slice(0, weight.index) : part),
        weight: weight ? parseFloat(weight[1]) / 100 : undefined,
      }
    })
    const p1 = first.weight ?? (second.weight === undefined ? 0.5 : 1 - second.weight)
    const p2 = second.weight ?? 1 - p1
    return [0, 1, 2, 3].map(
      (i) => (first.color[i] * p1 + second.color[i] * p2) / (p1 + p2)
    ) as Rgba
  }
  throw new Error(`unsupported colour: ${value}`)
}

function color(token: string, scheme: Scheme): Rgba {
  const tokens = SCHEMES[scheme]
  const value = tokens.get(token)
  if (value === undefined) throw new Error(`undefined token ${token}`)
  return parseColor(resolve(value, tokens))
}

function luminance([r, g, b]: Rgba): number {
  return 0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b)
}

/** Contrast of `fg` drawn on an opaque `bg` (a translucent fg is composited first). */
function contrast(fg: Rgba, bg: Rgba): number {
  const alpha = fg[3]
  const flat: Rgba = [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)).concat(1) as Rgba
  const [hi, lo] = [luminance(flat), luminance(bg)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

const TEXT = ['--ui-text', '--ui-muted', '--ui-accent']
const GROUNDS = ['--ui-bg', '--ui-surface', '--ui-subtle', '--surface-raised']

const TEXT_PAIRS: [string, string][] = [
  ...TEXT.flatMap((fg) => GROUNDS.map((bg) => [fg, bg] as [string, string])),
  ['--on-action', '--action'],
  ['--on-action', '--action-hover'],
  // Delta chips (ds-delta--ok / --danger / --warn / --neutral).
  ['--ok', '--green-50'],
  ['--danger', '--red-50'],
  ['--warn', '--amber-50'],
  ['--ui-muted', '--gray-50'],
  // Status callouts and selected options sit on these washes.
  ...['--ui-text', '--ui-muted'].flatMap((fg) =>
    ['--ui-tint-accent', '--ui-tint-warn', '--ui-tint-danger'].map(
      (bg) => [fg, bg] as [string, string]
    )
  ),
  // The reset action and validation copy are set in the status hue itself.
  ['--danger', '--ui-surface'],
  ['--danger', '--ui-bg'],
]

/** Non-text graphics (WCAG 1.4.11): the index marker against its track and ground. */
const GRAPHIC_PAIRS: [string, string][] = [
  ['--ui-accent', '--ui-border'],
  ['--ui-accent', '--ui-surface'],
  ['--ui-accent', '--ui-bg'],
]

describe('colour parsing', () => {
  it('reads hex, rgb channel tokens, oklch and color-mix', () => {
    expect(parseColor('#fff')).toEqual([1, 1, 1, 1])
    expect(parseColor('rgb(255 0 0 / 0.5)')).toEqual([1, 0, 0, 0.5])
    // oklch(62.8% 0.2577 29.23) is sRGB red.
    const red = parseColor('oklch(62.8% 0.2577 29.23)')
    expect(red[0]).toBeCloseTo(1, 2)
    expect(red[1]).toBeCloseTo(0, 2)
    expect(red[2]).toBeCloseTo(0, 2)
    expect(parseColor('color-mix(in srgb, #000000 25%, #ffffff)')[0]).toBeCloseTo(0.75, 5)
    expect(contrast(parseColor('#000'), parseColor('#fff'))).toBeCloseTo(21, 5)
  })

  it('resolves channel tokens such as rgb(var(--action-rgb))', () => {
    expect(resolve('rgb(var(--action-rgb))', LIGHT)).toBe('rgb(49 95 136)')
  })
})

describe.each(Object.keys(SCHEMES) as Scheme[])('%s scheme', (scheme) => {
  it.each(TEXT_PAIRS)('%s on %s meets WCAG AA (4.5:1)', (fg, bg) => {
    expect(contrast(color(fg, scheme), color(bg, scheme))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(GRAPHIC_PAIRS)('%s against %s meets 3:1 for graphics', (fg, bg) => {
    expect(contrast(color(fg, scheme), color(bg, scheme))).toBeGreaterThanOrEqual(3)
  })

  it('defines the workspace elevation and overlay tokens', () => {
    for (const token of [
      '--shadow-bar',
      '--shadow-sheet',
      '--shadow-sheet-up',
      '--scrim',
      '--skeleton-base',
      '--skeleton-sheen',
    ]) {
      expect(SCHEMES[scheme].get(token)).toBeTruthy()
    }
    // The scrim dims the page without hiding it.
    const scrim = color('--scrim', scheme)
    expect(scrim[3]).toBeGreaterThan(0.1)
    expect(scrim[3]).toBeLessThan(0.6)
  })
})
