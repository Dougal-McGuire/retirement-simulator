// Renders report PDFs for real, with the real @react-pdf/renderer, in plain
// Node. Test support: `__tests__/renderReport.test.ts` builds the report
// content in Jest and runs this file as a child process (see
// `tsLoaderHooks.mjs` for why it cannot render in Jest itself).
//
//   node renderReports.mjs <jobs.json>
//
// jobs.json: { "fonts": { regular, medium, semibold, bold },   ← font file paths
//              "jobs":  [{ "name", "content", "out" }] }       ← ReportContent → PDF path
// stdout:    one JSON line  { "results": [{ name, out, bytes, ms }] }
import './tsLoaderHooks.mjs'
import { readFileSync, writeFileSync } from 'node:fs'

const [jobFile] = process.argv.slice(2)
if (!jobFile) {
  console.error('usage: node renderReports.mjs <jobs.json>')
  process.exit(2)
}

const { fonts, jobs } = JSON.parse(readFileSync(jobFile, 'utf8'))

// Dynamic imports: the hooks above must be registered before these resolve.
const React = (await import('react')).default
const { renderToBuffer } = await import('@react-pdf/renderer')
const { registerReportFonts } = await import('@/lib/pdf-generator/react-pdf/fonts')
const { RetirementReport } = await import('@/lib/pdf-generator/react-pdf/Report')

registerReportFonts(fonts)

const results = []
for (const job of jobs) {
  const started = Date.now()
  const buffer = await renderToBuffer(React.createElement(RetirementReport, { content: job.content }))
  writeFileSync(job.out, buffer)
  results.push({ name: job.name, out: job.out, bytes: buffer.byteLength, ms: Date.now() - started })
}

process.stdout.write(`${JSON.stringify({ results })}\n`)
