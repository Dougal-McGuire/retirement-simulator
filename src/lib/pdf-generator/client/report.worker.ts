import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import type { ReportFontSources } from '@/lib/pdf-generator/react-pdf/fonts'
import { renderReportPdf } from './renderReportPdf'
import { reportFailureOf, type ReportFailure } from './reportErrors'

/**
 * Renders reports off the main thread. One request at a time is enough: the
 * button does not start a second report while one is being built.
 */
export type ReportWorkerRequest = {
  id: number
  content: ReportContent
  fontUrls: ReportFontSources
}

export type ReportWorkerResponse =
  | { id: number; ok: true; blob: Blob }
  | { id: number; ok: false; code: ReportFailure; detail: string }

const describe = (error: unknown): string => {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error
  return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)
}

self.addEventListener('message', (event: MessageEvent<ReportWorkerRequest>) => {
  const { id, content, fontUrls } = event.data
  renderReportPdf(content, fontUrls).then(
    (blob) => self.postMessage({ id, ok: true, blob } satisfies ReportWorkerResponse),
    (error: unknown) =>
      self.postMessage({
        id,
        ok: false,
        code: reportFailureOf(error),
        // For the console of whoever debugs it; never shown to the reader.
        detail: describe(error),
      } satisfies ReportWorkerResponse)
  )
})

export {}
