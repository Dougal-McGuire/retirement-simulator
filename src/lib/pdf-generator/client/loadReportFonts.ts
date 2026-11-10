import { registerReportFonts, type ReportFontSources } from '@/lib/pdf-generator/react-pdf/fonts'

/**
 * Fetches the report's four font files and hands them to react-pdf.
 *
 * react-pdf would fetch a registered URL itself, but it neither checks the
 * HTTP status (a 404 page ends up in the font parser) nor forgets a failed
 * load — the rejected promise is cached on the font source, so a second
 * attempt could never succeed. Here the bytes are fetched first, checked, and
 * only then registered as in-memory `blob:` URLs: a failure is a clear
 * "fonts" error, nothing is registered, and the next click starts over.
 *
 * The bytes stay in memory for the page's life, so later reports need no
 * network at all; across visits the content-hashed asset URLs are served
 * from the HTTP cache.
 */

export class ReportFontError extends Error {
  constructor(
    readonly url: string,
    readonly detail: string
  ) {
    super(`Report font could not be loaded: ${url} (${detail})`)
    this.name = 'ReportFontError'
  }
}

const WEIGHTS = ['regular', 'medium', 'semibold', 'bold'] as const

let loaded: Promise<ReportFontSources> | null = null

async function fetchAsBlobUrl(url: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, { credentials: 'same-origin' })
  } catch (error) {
    throw new ReportFontError(url, error instanceof Error ? error.message : 'network error')
  }
  if (!response.ok) throw new ReportFontError(url, `HTTP ${response.status}`)
  const bytes = await response.arrayBuffer()
  // A TrueType file is a few hundred kB; an error page is not a font.
  if (bytes.byteLength < 1024) throw new ReportFontError(url, 'empty response')
  return URL.createObjectURL(new Blob([bytes], { type: 'font/ttf' }))
}

async function fetchAll(urls: ReportFontSources): Promise<ReportFontSources> {
  const settled = await Promise.allSettled(WEIGHTS.map((weight) => fetchAsBlobUrl(urls[weight])))
  const failed = settled.find((entry) => entry.status === 'rejected')
  if (failed) {
    // Nothing half-loaded is kept: the next attempt fetches all four again.
    for (const entry of settled) {
      if (entry.status === 'fulfilled') URL.revokeObjectURL(entry.value)
    }
    throw failed.reason
  }
  const [regular, medium, semibold, bold] = settled.map(
    (entry) => (entry as PromiseFulfilledResult<string>).value
  )
  return { regular, medium, semibold, bold }
}

/** Resolves once the report family is registered; rejects with `ReportFontError`. */
export function loadReportFonts(urls: ReportFontSources): Promise<void> {
  loaded ??= fetchAll(urls).catch((error: unknown) => {
    // Not cached: the next report tries again.
    loaded = null
    throw error
  })
  return loaded.then(registerReportFonts)
}
