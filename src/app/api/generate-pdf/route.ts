import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { ReportDataSchema, type ReportData } from '@/lib/pdf-generator/schema/reportData'
import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { RetirementReport } from '@/lib/pdf-generator/react-pdf'
import React from 'react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Reduced from 60s since react-pdf is much faster

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { params, results, reportData } = body
    const requestedLocale = typeof body.locale === 'string' ? body.locale : 'de'

    // Validate input data
    let validated: ReportData
    if (reportData) {
      validated = ReportDataSchema.parse({ ...reportData, locale: requestedLocale })
    } else if (params && results) {
      const generated = transformToReportData(params, results)
      validated = ReportDataSchema.parse({ ...generated, locale: requestedLocale })
    } else {
      return NextResponse.json({ error: 'Parameter fehlen' }, { status: 400 })
    }

    const reportId = encodeURIComponent(validated.metadata?.reportId ?? `report-${Date.now()}`)

    // Transform to report content format
    const content = mapReportDataToContent(validated)

    console.log('[pdf-debug] Generating PDF with react-pdf for report:', reportId)
    const startTime = Date.now()

    // Generate PDF using react-pdf (much faster than Puppeteer!)
    const pdfBuffer = await renderToBuffer(
      React.createElement(RetirementReport, { content })
    )

    const duration = Date.now() - startTime
    console.log(`[pdf-debug] PDF generated in ${duration}ms (${pdfBuffer.byteLength} bytes)`)

    // Return the PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="rentenplan-${reportId}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Length': pdfBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('PDF-Erstellung fehlgeschlagen:', error)
    return NextResponse.json(
      {
        error: 'Fehler bei der PDF-Erstellung',
        details: error instanceof Error ? error.message : 'Unbekannter Fehler',
      },
      { status: 500 }
    )
  }
}
