import React from 'react'
import { pdf } from '@react-pdf/renderer'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import type { ReportFontSources } from '@/lib/pdf-generator/react-pdf/fonts'
import { RetirementReport } from '@/lib/pdf-generator/react-pdf/Report'
import { loadReportFonts, ReportFontError } from './loadReportFonts'
import { ReportGenerationError } from './reportErrors'

/**
 * Content → PDF bytes. The one place react-pdf is called in the app.
 *
 * Layout and PDF encoding are a few hundred milliseconds of uninterruptible
 * work (several seconds on a slow phone), so this normally runs in
 * `report.worker.ts`, off the main thread. It has no dependency on the DOM and
 * runs unchanged on the main thread where a worker is not available.
 */
export async function renderReportPdf(
  content: ReportContent,
  fontUrls: ReportFontSources
): Promise<Blob> {
  try {
    await loadReportFonts(fontUrls)
  } catch (error) {
    throw new ReportGenerationError(error instanceof ReportFontError ? 'fonts' : 'render', error)
  }

  try {
    const document = <RetirementReport content={content} />
    // `RetirementReport` renders a <Document>; react-pdf's typings want the
    // element type itself to be Document.
    return await pdf(document as Parameters<typeof pdf>[0]).toBlob()
  } catch (error) {
    throw new ReportGenerationError('render', error)
  }
}
