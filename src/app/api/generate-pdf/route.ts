import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { ReportDataSchema, type ReportData } from '@/lib/pdf-generator/schema/reportData'
import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { RetirementReport } from '@/lib/pdf-generator/react-pdf'
import React from 'react'
import { ZodError } from 'zod'
import type { SimulationParams, SimulationResults } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Reduced from 60s since react-pdf is much faster

interface GeneratePdfRequestBody {
  params?: SimulationParams
  results?: SimulationResults
  reportData?: ReportData
  locale?: string
}

class ClientRequestError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly details?: unknown
  ) {
    super(message)
    this.name = 'ClientRequestError'
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: GeneratePdfRequestBody
    try {
      body = await req.json() as GeneratePdfRequestBody
    } catch {
      throw new ClientRequestError('Invalid JSON payload')
    }

    const { params, results, reportData } = body
    const requestedLocale = body.locale === 'en' || body.locale === 'de' ? body.locale : 'de'

    if (body.locale !== undefined && body.locale !== 'en' && body.locale !== 'de') {
      throw new ClientRequestError('Unsupported locale')
    }

    // Validate input data
    let validated: ReportData
    if (results) {
      const freshParams = results.params ?? params
      if (!freshParams) {
        throw new ClientRequestError('Parameter fehlen')
      }
      const generated = transformToReportData(freshParams, results)
      const parsed = ReportDataSchema.safeParse({ ...generated, locale: requestedLocale })
      if (!parsed.success) {
        throw new ClientRequestError('Ungueltige Berichtsdaten', 400, parsed.error.flatten())
      }
      validated = parsed.data
    } else if (reportData) {
      const parsed = ReportDataSchema.safeParse({ ...reportData, locale: requestedLocale })
      if (!parsed.success) {
        throw new ClientRequestError('Ungueltige Berichtsdaten', 400, parsed.error.flatten())
      }
      validated = parsed.data
    } else {
      throw new ClientRequestError('Parameter fehlen')
    }

    const reportId = encodeURIComponent(validated.metadata?.reportId ?? `report-${Date.now()}`)

    // Transform to report content format
    const content = mapReportDataToContent(validated)

    console.log('[pdf-debug] Generating PDF with react-pdf for report:', reportId)
    const startTime = Date.now()

    // Generate PDF using react-pdf (much faster than Puppeteer!)
    // Type assertion needed because RetirementReport wraps Document component
    // but TypeScript can't infer this through the component boundary
    const pdfBuffer = await renderToBuffer(
      React.createElement(RetirementReport, { content }) as React.ReactElement<DocumentProps>
    )

    const duration = Date.now() - startTime
    console.log(`[pdf-debug] PDF generated in ${duration}ms (${pdfBuffer.byteLength} bytes)`)

    // Return the PDF - Convert Buffer to Uint8Array for NextResponse compatibility
    const uint8Array = new Uint8Array(pdfBuffer)
    return new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="rentenplan-${reportId}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Length': uint8Array.byteLength.toString(),
      },
    })
  } catch (error) {
    if (error instanceof ClientRequestError || error instanceof ZodError) {
      const details =
        error instanceof ZodError
          ? error.flatten()
          : error instanceof ClientRequestError
            ? error.details
            : undefined

      return NextResponse.json(
        {
          error: error.message,
          details,
        },
        {
          status: error instanceof ClientRequestError ? error.status : 400,
        }
      )
    }

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
