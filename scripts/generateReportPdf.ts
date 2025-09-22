#!/usr/bin/env ts-node
import { readFile, writeFile } from 'fs/promises'
import { Command } from 'commander'
import { transformToReportData } from '../src/lib/transformers/reportDataTransformer'
import { ReportDataSchema, type ReportData } from '../src/lib/pdf-generator/schema/reportData'

interface RawInput {
  params?: unknown
  results?: unknown
  reportData?: ReportData
}

const program = new Command()
  .name('generateReportPdf')
  .description('Erzeugt einen PDF-Rentenplan über die API /api/generate-pdf')
  .requiredOption('-i, --input <file>', 'Pfad zur JSON-Datei mit Simulationsergebnis')
  .option('-o, --output <file>', 'Zielfile für das PDF', 'report.pdf')
  .option('-b, --base-url <url>', 'Basis-URL des Next.js-Servers', 'http://localhost:3000')
  .option('-l, --locale <locale>', 'Sprache des Berichts (de oder en)', 'de')
  .parse(process.argv)

const options = program.opts<{ input: string; output: string; baseUrl: string; locale: string }>()

async function loadReportData(): Promise<ReportData> {
  const rawContent = await readFile(options.input, 'utf-8')
  const parsed: RawInput = JSON.parse(rawContent)

  if (parsed.reportData) {
    return ReportDataSchema.parse(parsed.reportData)
  }

  if (parsed.params && parsed.results) {
    const transformed = transformToReportData(parsed.params as any, parsed.results as any)
    return ReportDataSchema.parse(transformed)
  }

  throw new Error('JSON muss entweder reportData oder params/results enthalten')
}

async function run() {
  const reportData = await loadReportData()
  const baseUrl = options.baseUrl.replace(/\/?$/, '')

  const response = await fetch(`${baseUrl}/api/generate-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportData: { ...reportData, locale: options.locale } }),
  })

  if (!response.ok) {
    let details: unknown = null
    try {
      details = await response.json()
    } catch (error) {
      console.error('Antwort konnte nicht geparst werden:', error)
    }
    throw new Error(`API-Fehler (${response.status}): ${JSON.stringify(details)}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(options.output, buffer)
  console.log(`PDF gespeichert unter ${options.output}`)
}

run().catch((error) => {
  console.error('Fehler bei der PDF-Erzeugung:', error)
  process.exitCode = 1
})
