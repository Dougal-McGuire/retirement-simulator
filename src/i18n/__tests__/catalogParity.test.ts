import en from '@/i18n/messages/en.json'
import de from '@/i18n/messages/de.json'

/**
 * The two catalogs must describe the same messages: a key that exists in only
 * one locale renders as the raw key path in the other, and a placeholder that
 * one translation forgets silently drops a number from the sentence.
 */

type Catalog = { [key: string]: string | Catalog }

function leafEntries(catalog: Catalog, prefix = ''): Array<[string, unknown]> {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return value !== null && typeof value === 'object'
      ? leafEntries(value, path)
      : [[path, value] as [string, unknown]]
  })
}

/**
 * Names of the ICU arguments a message reads (`{age}`, `{count, plural, …}`),
 * including those nested inside plural/select branches. Branch bodies are
 * messages, not arguments, so `{count, plural, one {fund} other {funds}}`
 * yields only `count`.
 */
function messageArguments(message: string): Set<string> {
  const names = new Set<string>()
  let i = 0

  const fail = (reason: string): never => {
    throw new Error(`${reason} at ${i} in "${message}"`)
  }
  const skipSpace = () => {
    while (i < message.length && /\s/.test(message[i])) i++
  }

  const readArgument = () => {
    i++ // "{"
    skipSpace()
    const name = /^[^\s,{}]+/.exec(message.slice(i))?.[0] ?? fail('Missing argument name')
    names.add(name)
    i += name.length
    skipSpace()
    if (message[i] === '}') {
      i++
      return
    }
    if (message[i] !== ',') fail('Expected "," or "}"')
    i++
    skipSpace()
    const type = /^\w+/.exec(message.slice(i))?.[0] ?? fail('Missing argument type')
    i += type.length
    skipSpace()

    if (type === 'plural' || type === 'select' || type === 'selectordinal') {
      if (message[i] !== ',') fail('Expected "," before the options')
      i++
      for (;;) {
        skipSpace()
        if (message[i] === '}') {
          i++
          return
        }
        const selector = /^[^\s{}]+/.exec(message.slice(i))?.[0] ?? fail('Missing selector')
        i += selector.length
        if (selector.startsWith('offset:')) continue
        skipSpace()
        if (message[i] !== '{') fail(`Expected "{" after "${selector}"`)
        i++
        readMessage(true)
      }
    }

    // number / date / time, with an optional style: skip to the closing brace.
    let depth = 1
    while (depth > 0) {
      if (i >= message.length) fail('Unterminated argument')
      if (message[i] === '{') depth++
      if (message[i] === '}') depth--
      i++
    }
  }

  const readMessage = (nested: boolean) => {
    while (i < message.length) {
      const char = message[i]
      const next = message[i + 1] ?? ''
      // ICU quoting: '' is a literal apostrophe; '{…}' is literal text.
      if (char === "'" && next === "'") {
        i += 2
        continue
      }
      if (char === "'" && /[{}#|]/.test(next)) {
        const end = message.indexOf("'", i + 1)
        i = end === -1 ? message.length : end + 1
        continue
      }
      if (char === '{') {
        readArgument()
        continue
      }
      if (char === '}') {
        if (!nested) fail('Unbalanced "}"')
        i++
        return
      }
      i++
    }
    if (nested) fail('Unterminated branch')
  }

  readMessage(false)
  return names
}

const enEntries = new Map(leafEntries(en as Catalog))
const deEntries = new Map(leafEntries(de as Catalog))

describe('message catalogs', () => {
  test('en.json and de.json have identical key sets', () => {
    const onlyEn = [...enEntries.keys()].filter((key) => !deEntries.has(key))
    const onlyDe = [...deEntries.keys()].filter((key) => !enEntries.has(key))
    expect({ onlyEn, onlyDe }).toEqual({ onlyEn: [], onlyDe: [] })
  })

  test('every message is a non-empty string in both locales', () => {
    const invalid = [...enEntries, ...deEntries]
      .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
      .map(([key]) => key)
    expect(invalid).toEqual([])
  })

  test('both translations of a message read the same placeholders', () => {
    const mismatched: string[] = []
    for (const [key, enValue] of enEntries) {
      const deValue = deEntries.get(key)
      if (typeof enValue !== 'string' || typeof deValue !== 'string') continue
      const enArgs = [...messageArguments(enValue)].sort().join(', ')
      const deArgs = [...messageArguments(deValue)].sort().join(', ')
      if (enArgs !== deArgs) mismatched.push(`${key}: en {${enArgs}} ≠ de {${deArgs}}`)
    }
    expect(mismatched).toEqual([])
  })
})

describe('messageArguments', () => {
  test('reads simple, formatted and nested arguments', () => {
    expect([...messageArguments('Age {age}')]).toEqual(['age'])
    expect([...messageArguments('{rate, number, percent} of {runs}')]).toEqual(['rate', 'runs'])
    expect([
      ...messageArguments('{count, plural, =0 {none} one {# plan for {name}} other {# plans}}'),
    ]).toEqual(['count', 'name'])
  })

  test('does not mistake branch bodies or quoted braces for arguments', () => {
    expect([...messageArguments('{count, plural, one {fund} other {funds}}')]).toEqual(['count'])
    expect([...messageArguments("Type '{name}' literally, it''s fine")]).toEqual([])
  })

  test('rejects malformed messages', () => {
    expect(() => messageArguments('Age {age')).toThrow()
    expect(() => messageArguments('Age age}')).toThrow()
  })
})
