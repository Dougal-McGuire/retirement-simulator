/**
 * Why a report could not be produced — as far as the reader can act on it.
 *
 * - `chunkLoad`: the report code itself could not be fetched (offline, or a
 *   deploy replaced the files this tab still points at).
 * - `fonts`: the report's font files could not be fetched.
 * - `render`: anything else; a defect, not something the reader can fix.
 *
 * Dependency-free on purpose: the button maps these codes to catalog messages
 * without pulling the report chunk in, and the worker posts them as plain
 * strings.
 */
export type ReportFailure = 'chunkLoad' | 'fonts' | 'render'

export class ReportGenerationError extends Error {
  constructor(
    readonly code: ReportFailure,
    cause?: unknown
  ) {
    super(`Report generation failed (${code})`, cause === undefined ? undefined : { cause })
    this.name = 'ReportGenerationError'
  }
}

/** The failure code of anything thrown along the report pipeline. */
export function reportFailureOf(error: unknown): ReportFailure {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
  return code === 'chunkLoad' || code === 'fonts' ? code : 'render'
}
