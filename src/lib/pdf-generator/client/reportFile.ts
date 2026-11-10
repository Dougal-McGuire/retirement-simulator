import { reportFailureOf } from './reportErrors'

/**
 * The parts of "Bericht erstellen" that are plain functions: what the file is
 * called and which catalog message an error becomes. Kept apart from the
 * button so they can be tested without React.
 */

/** Filename-safe slug of a plan name, e.g. "Retire 2 years later" → "retire-2-years-later". */
export function planFilenameSlug(name: string | undefined | null): string {
  if (!name) return ''
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * `retirement-report[-<plan>][<unit suffix>]-<yyyy-mm-dd>.pdf` — the unit
 * suffix is `euroUnitFilenameSuffix` (`-heutige-euro` / `-todays-euros`, empty
 * for a nominal report).
 */
export function reportFilename(
  planName: string | undefined | null,
  unitSuffix: string,
  date: Date = new Date()
): string {
  const slug = planFilenameSlug(planName)
  return `retirement-report${slug ? `-${slug}` : ''}${unitSuffix}-${
    date.toISOString().split('T')[0]
  }.pdf`
}

/**
 * Why a report could not be produced, in the words of the message catalog
 * (`report.errors.*`). Raw exception text never reaches the reader: it is
 * logged for whoever opens the console, and the reader gets a sentence that
 * says what to do.
 */
export type ReportErrorKey = 'chunkLoad' | 'fonts' | 'generic'

/** Maps anything thrown while generating to a catalog key. */
export function reportErrorKey(error: unknown): ReportErrorKey {
  const failure = reportFailureOf(error)
  return failure === 'render' ? 'generic' : failure
}
