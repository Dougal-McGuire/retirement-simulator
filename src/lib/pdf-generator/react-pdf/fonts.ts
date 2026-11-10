import { Font } from '@react-pdf/renderer'

/**
 * Fonts of the PDF report.
 *
 * The report is set in Inter (SIL Open Font License, the TTFs live in
 * `./fonts`). This module only knows the *family*; where the four files come
 * from is the caller's business, because that differs by runtime:
 *
 * - the browser registers URLs of the app's own static assets
 *   (see `fontAssets.ts` and `client/loadReportFonts.ts`);
 * - Node (the render test) registers file paths.
 *
 * There is deliberately no fallback family. The built-in Helvetica has no
 * glyph for the narrow no-break space German figures use ("1.234 €"), so a
 * report that silently fell back would be wrong on every page; a font that
 * cannot be loaded is an error the caller reports and the user retries.
 */
export const SANS = 'Inter'

/** One source per weight the report uses: a URL in the browser, a path in Node. */
export interface ReportFontSources {
  regular: string
  medium: string
  semibold: string
  bold: string
}

let registered: ReportFontSources | null = null
let hyphenationDisabled = false

const sameSources = (a: ReportFontSources, b: ReportFontSources) =>
  a.regular === b.regular && a.medium === b.medium && a.semibold === b.semibold && a.bold === b.bold

/**
 * Registers the report family. Idempotent for the same sources; different
 * sources replace the earlier registration (react-pdf resolves the first
 * source it finds for a weight, so a stale one must not stay in the list).
 */
export function registerReportFonts(sources: ReportFontSources): void {
  if (!hyphenationDisabled) {
    // Whole words only: hyphenated figures and names read badly in a report.
    Font.registerHyphenationCallback((word) => [word])
    hyphenationDisabled = true
  }
  if (registered && sameSources(registered, sources)) return

  const families = Font.getRegisteredFonts() as Record<string, unknown>
  delete families[SANS]
  Font.register({
    family: SANS,
    fonts: [
      { src: sources.regular, fontWeight: 400 },
      { src: sources.medium, fontWeight: 500 },
      { src: sources.semibold, fontWeight: 600 },
      { src: sources.bold, fontWeight: 700 },
    ],
  })
  registered = sources
}

/** True once `registerReportFonts` has run. */
export function reportFontsRegistered(): boolean {
  return registered !== null
}

/** Family name used by every style in the report. */
export function sansFamily(): string {
  return SANS
}
