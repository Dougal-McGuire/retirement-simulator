import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer-core'
import type { Browser, Viewport } from 'puppeteer-core'
import { existsSync } from 'node:fs'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { ReportDataSchema } from '@/lib/pdf-generator/schema/reportData'
import { prepareReport } from '@/lib/pdf-generator/reportRenderer'
import { renderReportHtml } from '@/lib/pdf-generator/renderReportHtml'

type ChromiumModule = (
  typeof import('@sparticuz/chromium') & {
    setHeadlessMode?: boolean
    setGraphicsMode?: boolean
  }
) & {
  args: string[]
  defaultViewport: unknown
  executablePath: () => Promise<string>
  headless: boolean
}

let chromium: ChromiumModule | null = null
if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
  const ch: ChromiumModule = require('@sparticuz/chromium')
  ch.setHeadlessMode = true
  ch.setGraphicsMode = false
  chromium = ch
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function launchBrowser() {
  if (chromium) {
    const executablePath = await chromium.executablePath()
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport as Viewport | null | undefined,
      executablePath,
      headless: chromium.headless,
    })
  }

  const executablePath = resolveExecutablePath()
  if (!executablePath) {
    throw new Error(
      'Kein lokaler Chrome-/Chromium-Pfad gefunden. Setze CHROME_PATH oder installiere Google Chrome/Chromium.'
    )
  }
  return puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    executablePath,
    headless: true,
  })
}

function resolveExecutablePath(): string | undefined {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH
  }

  const candidates: string[] = []
  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'
    )
  } else if (process.platform === 'win32') {
    candidates.push(
      process.env['PROGRAMFILES'] + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env['LOCALAPPDATA'] + '\\Google\\Chrome\\Application\\chrome.exe'
    )
  } else {
    candidates.push('/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable')
  }

  const found = candidates.find((candidate) => typeof candidate === 'string' && existsSync(candidate))
  return found
}

export async function POST(req: NextRequest) {
  let browser: Browser | null = null

  try {
    const body = await req.json()
    const { params, results, reportData } = body
    const requestedLocale = typeof body.locale === 'string' ? body.locale : 'de'

    let validated
    if (reportData) {
      validated = ReportDataSchema.parse({ ...reportData, locale: requestedLocale })
    } else if (params && results) {
      const generated = transformToReportData(params, results)
      validated = ReportDataSchema.parse({ ...generated, locale: requestedLocale })
    } else {
      return NextResponse.json({ error: 'Parameter fehlen' }, { status: 400 })
    }

    const reportId = encodeURIComponent(validated.metadata?.reportId ?? `report-${Date.now()}`)

    // Get base URL for font loading
    const host = req.headers.get('host')
    const protocol = req.headers.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http')
    const baseUrl = host ? `${protocol}://${host}` : ''

    // Prepare report data (render charts server-side)
    const prepared = await prepareReport(validated)

    // Render HTML server-side (eliminates need for separate HTTP request)
    const html = renderReportHtml({
      content: prepared.content,
      projectionSvg: prepared.projectionSvg,
      breakdownSvg: prepared.breakdownSvg,
      baseUrl,
    })

    browser = await launchBrowser()
    const page = await browser.newPage()
    page.on('console', (message) => {
      try {
        console.log('[pdf-console]', message.type(), message.text())
      } catch (err) {
        console.error('Failed to read console message from PDF page', err)
      }
    })

    // Use setContent instead of goto - eliminates serverless cache issues
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 20000 })
    await page.emulateMediaType('print')

    // Wait for fonts to load
    await page.evaluate(() => {
      const doc = document as Document & { fonts?: FontFaceSet }
      if (doc.fonts) {
        return doc.fonts.ready.then(() => true)
      }
      return true
    })

    // Wait for report initialization script
    await page.waitForFunction('window.__REPORT_READY__ === true', { timeout: 10000 })

    // Wait for TOC page numbers (non-blocking)
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('[data-toc-page]')).every((el) =>
            el.getAttribute('data-page-number')
          ),
        { timeout: 3000 }
      )
      .catch(() => {
        console.log('TOC page numbers not fully populated within timeout')
      })

    // Apply TOC values
    await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('[data-toc-page]'))
      spans.forEach((span) => {
        const preferred = span.getAttribute('data-page-number') || span.getAttribute('data-toc-computed')
        if (preferred) {
          span.setAttribute('data-page-number', preferred)
          span.textContent = preferred
        }
      })
    })

    await page.evaluate(() => {
      if (typeof window.__APPLY_TOC__ === 'function') {
        window.__APPLY_TOC__()
      }
    })

    const tocDebug = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-toc-page]')).map((el) => ({
        text: el.textContent,
        attr: (el as HTMLElement).getAttribute('data-page-number'),
        computed: (el as HTMLElement).getAttribute('data-toc-computed'),
      }))
    )
    console.log('TOC debug', tocDebug)

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })

    await page.close()

    const pdfArrayBuffer = new ArrayBuffer(pdf.byteLength)
    new Uint8Array(pdfArrayBuffer).set(pdf)
    const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' })

    return new NextResponse(pdfBlob.stream(), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="rentenplan-${reportId}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Length': pdfBlob.size.toString(),
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
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch (closeError) {
        console.error('Browser konnte nicht geschlossen werden:', closeError)
      }
    }
  }
}
