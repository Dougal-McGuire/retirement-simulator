import { inflateSync } from 'node:zlib'

/**
 * Reads the text back out of a PDF produced by react-pdf — test support for
 * asserting on what a report really prints.
 *
 * Not a general PDF parser. It relies on what pdfkit writes: uncompressed
 * object dictionaries, Flate-compressed content streams, and embedded fonts
 * addressed by two-byte glyph ids with a `ToUnicode` map (`beginbfchar` /
 * `beginbfrange`). That is enough to recover every string the report shows,
 * in page order, exactly as the reader's PDF viewer would on copy-and-paste.
 */
export interface PdfInspection {
  /** `%PDF-1.x` header present. */
  isPdf: boolean
  pageCount: number
  /** Text of each page, in page order; line breaks between text runs. */
  pages: string[]
  /** All pages joined, whitespace collapsed (incl. no-break spaces) to single spaces. */
  text: string
}

interface PdfObject {
  dictionary: string
  stream: Buffer | null
}

function parseObjects(raw: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>()
  const pattern = /(\d+) 0 obj\s*([\s\S]*?)endobj/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw)) !== null) {
    const body = match[2]
    const streamAt = body.search(/stream\r?\n/)
    if (streamAt === -1) {
      objects.set(Number(match[1]), { dictionary: body, stream: null })
      continue
    }
    const dictionary = body.slice(0, streamAt)
    const start = streamAt + (body.slice(streamAt).match(/^stream\r?\n/)?.[0].length ?? 0)
    // The dictionary states the exact length; only without it is the end
    // found by the keyword (and the separating line break dropped).
    const length = dictionary.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/)
    const slice = length
      ? body.slice(start, start + Number(length[1]))
      : body.slice(start, body.lastIndexOf('endstream')).replace(/\r?\n$/, '')
    let data: Buffer = Buffer.from(slice, 'latin1')
    if (/\/FlateDecode/.test(dictionary)) {
      try {
        data = inflateSync(data)
      } catch {
        // Not a stream this reader needs (e.g. a font program it cannot inflate).
        data = Buffer.alloc(0)
      }
    }
    objects.set(Number(match[1]), { dictionary, stream: data })
  }
  return objects
}

const hexToText = (hex: string): string => {
  let out = ''
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
  }
  return out
}

/** glyph id → the text it stands for, from a font's ToUnicode CMap. */
function parseToUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>()
  const charBlocks = cmap.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []
  for (const block of charBlocks) {
    const pair = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g
    let entry: RegExpExecArray | null
    while ((entry = pair.exec(block)) !== null) {
      map.set(parseInt(entry[1], 16), hexToText(entry[2]))
    }
  }
  const rangeBlocks = cmap.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []
  for (const block of rangeBlocks) {
    const listed = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([^\]]*)\]/g
    let entry: RegExpExecArray | null
    while ((entry = listed.exec(block)) !== null) {
      const first = parseInt(entry[1], 16)
      const targets = entry[3].match(/<([0-9a-fA-F]*)>/g) ?? []
      targets.forEach((target, offset) => map.set(first + offset, hexToText(target.slice(1, -1))))
    }
    const sequential = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g
    while ((entry = sequential.exec(block)) !== null) {
      const first = parseInt(entry[1], 16)
      const last = parseInt(entry[2], 16)
      const target = parseInt(entry[3], 16)
      for (let code = first; code <= last; code++) {
        map.set(code, String.fromCharCode(target + (code - first)))
      }
    }
  }
  return map
}

const reference = (dictionary: string, key: string): number | null => {
  const match = dictionary.match(new RegExp(`/${key}\\s+(\\d+) 0 R`))
  return match ? Number(match[1]) : null
}

export function inspectPdf(bytes: Uint8Array): PdfInspection {
  const raw = Buffer.from(bytes).toString('latin1')
  const objects = parseObjects(raw)

  // Font resource name (/F1 …) → ToUnicode map. pdfkit numbers fonts once per
  // document, so a name means the same font on every page. A font without a
  // map is one of the standard fonts (the charts' SVG text is set in
  // Helvetica): its strings are single WinAnsi bytes — `null` here.
  const fonts = new Map<string, Map<number, string> | null>()
  const winAnsi = new TextDecoder('windows-1252')
  for (const { dictionary } of objects.values()) {
    const fontDict = dictionary.match(/\/Font\s*<<([\s\S]*?)>>/)
    if (!fontDict) continue
    const entry = /\/(F\d+)\s+(\d+) 0 R/g
    let match: RegExpExecArray | null
    while ((match = entry.exec(fontDict[1])) !== null) {
      if (fonts.has(match[1])) continue
      const font = objects.get(Number(match[2]))
      const toUnicode = font ? reference(font.dictionary, 'ToUnicode') : null
      const cmap = toUnicode !== null ? objects.get(toUnicode)?.stream : null
      fonts.set(match[1], cmap ? parseToUnicode(cmap.toString('latin1')) : null)
    }
  }

  // Pages in reading order: the Kids of the page tree root.
  const pageIds: number[] = []
  for (const { dictionary } of objects.values()) {
    if (!/\/Type\s*\/Pages\b/.test(dictionary)) continue
    const kids = dictionary.match(/\/Kids\s*\[([^\]]*)\]/)
    for (const kid of kids?.[1].match(/(\d+) 0 R/g) ?? []) pageIds.push(parseInt(kid, 10))
  }

  const pages = pageIds.map((id) => {
    const page = objects.get(id)
    const contents = page ? reference(page.dictionary, 'Contents') : null
    const stream = contents !== null ? objects.get(contents)?.stream : null
    if (!stream) return ''
    const content = stream.toString('latin1')
    const token = /\/(F\d+)\s+[\d.]+\s+Tf|\[((?:[^\]])*)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj|\bET\b/g
    let current: Map<number, string> | null | undefined
    let text = ''
    let match: RegExpExecArray | null
    const decode = (hex: string) => {
      if (current === null) {
        text += winAnsi.decode(Buffer.from(hex, 'hex'))
        return
      }
      for (let i = 0; i + 4 <= hex.length; i += 4) {
        text += current?.get(parseInt(hex.slice(i, i + 4), 16)) ?? ''
      }
    }
    while ((match = token.exec(content)) !== null) {
      if (match[1]) current = fonts.get(match[1])
      else if (match[2] !== undefined) {
        for (const piece of match[2].match(/<([0-9a-fA-F]+)>/g) ?? []) decode(piece.slice(1, -1))
      } else if (match[3]) decode(match[3])
      else text += '\n'
    }
    return text
  })

  return {
    isPdf: /^%PDF-1\.\d/.test(raw),
    pageCount: pageIds.length,
    pages,
    text: pages
      .join('\n')
      .replace(/[\u00a0\u202f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }
}
