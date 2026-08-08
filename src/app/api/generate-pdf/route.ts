import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import {
  DEFAULT_REPORT_LOCALE,
  ReportDataSchema,
  ReportLocaleSchema,
  type ReportData,
  type ReportLocale,
} from '@/lib/pdf-generator/schema/reportData'
import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { RetirementReport } from '@/lib/pdf-generator/react-pdf'
import React from 'react'
import { z, ZodError } from 'zod'
import {
  CASHFLOW_FREQUENCIES,
  CASHFLOW_KINDS,
  EXPENSE_INTERVALS,
  HOUSEHOLD_TYPES,
  MARKET_MODELS,
  WITHDRAWAL_STRATEGIES,
} from '@/types'
import type { SimulationParams, SimulationResults } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Reduced from 60s since react-pdf is much faster

const PERCENTILE_KEYS = ['p10', 'p20', 'p50', 'p80', 'p90'] as const
const PERCENTILE_GROUPS = ['assetPercentiles', 'spendingPercentiles'] as const

const CustomExpenseSchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number(),
  interval: z.enum(EXPENSE_INTERVALS),
})

const CashFlowSchema = z.object({
  id: z.string(),
  kind: z.enum(CASHFLOW_KINDS),
  name: z.string(),
  amount: z.number(),
  frequency: z.enum(CASHFLOW_FREQUENCIES),
  startAge: z.number().optional(),
  endAge: z.number().optional(),
  inflationLinked: z.boolean().optional(),
  growthRate: z.number().optional(),
})

const OneTimeIncomeSchema = z.object({
  age: z.number(),
  amount: z.number(),
  name: z.string(),
})

const SimulationParamsSchema = z.object({
  currentAge: z.number(),
  retirementAge: z.number(),
  legalRetirementAge: z.number(),
  endAge: z.number(),
  currentAssets: z.number(),
  annualSavings: z.number(),
  annualSavingsGrowthRate: z.number(),
  monthlyPension: z.number(),
  oneTimeIncomes: z.array(OneTimeIncomeSchema),
  averageROI: z.number(),
  roiVolatility: z.number(),
  averageInflation: z.number(),
  inflationVolatility: z.number(),
  capitalGainsTax: z.number(),
  // Defaulted: a client on an older build posts params without the German tax
  // detail or a bequest goal, and the neutral values below reproduce exactly
  // the flat "every gain taxed, pension untaxed, no goal" model it ran.
  taxAllowanceAnnual: z.number().default(0),
  householdType: z.enum(HOUSEHOLD_TYPES).default('single'),
  equityFundExemption: z.number().default(0),
  pensionTaxablePortion: z.number().default(0),
  pensionTaxRate: z.number().default(0),
  legacyTargetReal: z.number().default(0),
  // Defaulted: a client on an older build posts params without a market model
  // or glide path, and "Monte Carlo, single asset" is exactly what it meant.
  marketModel: z.enum(MARKET_MODELS).default('monteCarlo'),
  glidePathEnabled: z.boolean().default(false),
  equityAllocationStart: z.number().default(0.8),
  equityAllocationEnd: z.number().default(0.4),
  bondReturn: z.number().default(0.03),
  bondVolatility: z.number().default(0.06),
  customExpenses: z.array(CustomExpenseSchema),
  // Defaulted for the same reason: older clients post the projections only, and
  // the report never needs the flows to be reconstructed to render them.
  cashFlows: z.array(CashFlowSchema).default([]),
  withdrawalStrategy: z.enum(WITHDRAWAL_STRATEGIES),
  dsWithdrawalRate: z.number(),
  dsCeilingRate: z.number(),
  dsFloorRate: z.number(),
  simulationRuns: z.number(),
})

const PercentileDataSchema = z.object({
  p10: z.array(z.number()).nonempty(),
  p20: z.array(z.number()).nonempty(),
  p50: z.array(z.number()).nonempty(),
  p80: z.array(z.number()).nonempty(),
  p90: z.array(z.number()).nonempty(),
})

const SimulationResultsSchema = z
  .object({
    ages: z.array(z.number()).nonempty(),
    assetPercentiles: PercentileDataSchema,
    spendingPercentiles: PercentileDataSchema,
    successRate: z.number(),
    params: SimulationParamsSchema.optional(),
  })
  .superRefine((results, ctx) => {
    const expectedLength = results.ages.length

    for (const group of PERCENTILE_GROUPS) {
      for (const key of PERCENTILE_KEYS) {
        const actualLength = results[group][key].length
        if (actualLength !== expectedLength) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [group, key],
            message: `Expected ${expectedLength} values to match ages, received ${actualLength}`,
          })
        }
      }
    }
  })

const GeneratePdfRequestBodySchema = z
  .object({
    params: z.unknown().optional(),
    results: z.unknown().optional(),
    reportData: z.unknown().optional(),
    locale: ReportLocaleSchema.optional(),
    // Optional so older clients and the legacy print route keep working.
    planName: z.string().trim().min(1).max(80).optional(),
  })
  .passthrough()

type GeneratePdfRequestBody = z.infer<typeof GeneratePdfRequestBodySchema>

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

function validateSimulationParams(value: unknown): SimulationParams {
  const parsed = SimulationParamsSchema.safeParse(value)
  if (!parsed.success) {
    throw new ClientRequestError('Ungueltige Parameter', 400, parsed.error.flatten())
  }

  return parsed.data
}

function validateSimulationResults(value: unknown): Omit<SimulationResults, 'params'> & {
  params?: SimulationParams
} {
  const parsed = SimulationResultsSchema.safeParse(value)
  if (!parsed.success) {
    throw new ClientRequestError('Ungueltige Simulationsergebnisse', 400, parsed.error.flatten())
  }

  return parsed.data
}

function withLocale(value: unknown, locale: ReportLocale, planName?: string) {
  const base = value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {}
  const metadata = base.metadata && typeof base.metadata === 'object' ? base.metadata : undefined

  return {
    ...base,
    locale,
    // A plan name sent alongside a pre-built payload still reaches the cover.
    ...(planName ? { metadata: { ...(metadata ?? {}), planName } } : {}),
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: GeneratePdfRequestBody
    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      throw new ClientRequestError('Invalid JSON payload')
    }

    const parsedBody = GeneratePdfRequestBodySchema.safeParse(rawBody)
    if (!parsedBody.success) {
      const details = parsedBody.error.flatten()
      if (details.fieldErrors.locale) {
        throw new ClientRequestError('Unsupported locale', 400, details)
      }
      throw new ClientRequestError('Invalid request payload', 400, details)
    }
    body = parsedBody.data

    const { params, results, reportData, planName } = body
    const requestedLocale = body.locale ?? DEFAULT_REPORT_LOCALE

    // Validate input data
    let validated: ReportData
    if (results) {
      const validResults = validateSimulationResults(results)
      const freshParams = validResults.params ?? (params ? validateSimulationParams(params) : null)
      if (!freshParams) {
        throw new ClientRequestError('Parameter fehlen')
      }
      const generated = transformToReportData(
        freshParams,
        { ...validResults, params: freshParams },
        planName
      )
      const parsed = ReportDataSchema.safeParse({ ...generated, locale: requestedLocale })
      if (!parsed.success) {
        throw new ClientRequestError('Ungueltige Berichtsdaten', 400, parsed.error.flatten())
      }
      validated = parsed.data
    } else if (reportData) {
      const parsed = ReportDataSchema.safeParse(withLocale(reportData, requestedLocale, planName))
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
