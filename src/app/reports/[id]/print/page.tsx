import { notFound } from 'next/navigation'
import { ReportLayout } from '@/components/report/ReportLayout'
import { inlineReportScript } from '@/components/report/scripts'
import { prepareReport } from '@/lib/pdf-generator/reportRenderer'
import { ReportDataSchema } from '@/lib/pdf-generator/schema/reportData'
import { consumeReportFromCache } from '@/lib/pdf-generator/reportCache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function decodePayload(value: string): unknown {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
    const json = Buffer.from(normalized, 'base64').toString('utf-8')
    return JSON.parse(json)
  } catch (error) {
    throw new Error('Ungültiger Payload: ' + (error instanceof Error ? error.message : 'unbekannter Fehler'))
  }
}

interface PageParams {
  params: { id: string }
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function PrintReportPage({ searchParams }: PageParams) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const payloadParam = resolvedSearchParams?.payload
  const tokenParam = resolvedSearchParams?.token

  let dataInput: unknown

  if (tokenParam && typeof tokenParam === 'string') {
    const cached = consumeReportFromCache(tokenParam)
    if (!cached) {
      notFound()
    }
    dataInput = cached
  } else if (payloadParam && !Array.isArray(payloadParam)) {
    dataInput = decodePayload(payloadParam)
  } else {
    notFound()
  }

  const data = ReportDataSchema.parse(dataInput)

  const prepared = await prepareReport(data)

  return (
    <>
      <ReportLayout
        content={prepared.content}
        projectionSvg={prepared.projectionSvg}
        breakdownSvg={prepared.breakdownSvg}
      />
      <script dangerouslySetInnerHTML={{ __html: inlineReportScript() }} />
    </>
  )
}
