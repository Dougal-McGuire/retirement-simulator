import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer-core'
import type { Browser, Viewport } from 'puppeteer-core'
import { existsSync } from 'node:fs'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { ReportDataSchema, type ReportData } from '@/lib/pdf-generator/schema/reportData'

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

function encodePayload(data: ReportData): string {
  const json = JSON.stringify(data)
  // Use URL-safe base64 encoding
  const base64 = Buffer.from(json, 'utf-8').toString('base64')
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function POST(req: NextRequest) {
  let browser: Browser | null = null

  try {
    const body = await req.json()
    const { params, results, reportData } = body
    const requestedLocale = typeof body.locale === 'string' ? body.locale : 'de'

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

    const host = req.headers.get('host')
    if (!host) {
      return NextResponse.json({ error: 'Host-Header fehlt' }, { status: 400 })
    }

    const protocol = req.headers.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http')

    // Encode the report data as a URL-safe base64 payload
    // This avoids serverless cache issues where different instances don't share memory
    const payload = encodePayload(validated)

    // Build target URL with optional bypass secret as query param (fallback for when headers are stripped)
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    const bypassParam = bypassSecret ? `&x-vercel-protection-bypass=${encodeURIComponent(bypassSecret)}` : ''
    const targetUrl = `${protocol}://${host}/reports/${reportId}/print?payload=${payload}${bypassParam}`

    browser = await launchBrowser()
    const page = await browser.newPage()

    // Bypass Vercel deployment protection for preview deployments
    // See: https://vercel.com/docs/security/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
    if (bypassSecret) {
      console.log('[pdf-debug] Using Vercel automation bypass secret')
      await page.setExtraHTTPHeaders({
        'x-vercel-protection-bypass': bypassSecret,
        'x-vercel-set-bypass-cookie': 'samesitenone',
      })
    } else if (process.env.VERCEL) {
      console.warn('[pdf-debug] Running on Vercel but VERCEL_AUTOMATION_BYPASS_SECRET is not set - deployment protection may block PDF generation')
    }

    // Log sanitized URL (hide payload and bypass secret)
    console.log('[pdf-debug] Target URL:', targetUrl.replace(/payload=[^&]+/, 'payload=<hidden>').replace(/x-vercel-protection-bypass=[^&]+/, 'x-vercel-protection-bypass=<hidden>'))

    page.on('console', (message) => {
      try {
        console.log('[pdf-console]', message.type(), message.text())
      } catch (err) {
        console.error('Failed to read console message from PDF page', err)
      }
    })
    await page.setCacheEnabled(false)
    const response = await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 30000 })

    // Check for Vercel deployment protection (returns 401/403)
    const status = response?.status()
    if (status && status >= 400) {
      console.error(`[pdf-debug] Page returned status ${status} - likely blocked by Vercel deployment protection`)
    }

    // Detect if we landed on Vercel's protection page instead of the report
    const isProtectionPage = await page.evaluate(() => {
      const bodyText = document.body?.textContent || ''
      return bodyText.includes('vercel.com/oss') || bodyText.includes('Vercel Protection')
    })

    if (isProtectionPage) {
      console.error('[pdf-debug] Detected Vercel deployment protection page instead of report')
      throw new Error(
        'PDF generation blocked by Vercel deployment protection. ' +
        'Please configure VERCEL_AUTOMATION_BYPASS_SECRET in your Vercel project settings ' +
        'and add it as an environment variable.'
      )
    }

    await page.emulateMediaType('print')
    await page.evaluate(() => {
      const doc = document as Document & { fonts?: FontFaceSet }
      if (doc.fonts) {
        return doc.fonts.ready.then(() => true)
      }
      return true
    })
    await page.waitForFunction('window.__REPORT_READY__ === true', { timeout: 15000 })
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-toc-page]')).every((el) => el.getAttribute('data-page-number')), { timeout: 5000 }).catch(() => null)
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
