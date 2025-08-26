import { NextRequest } from 'next/server'
import chromium from '@sparticuz/chromium'
import puppeteer, { Browser } from 'puppeteer-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const url = new URL(req.url)
  const dataParam = url.searchParams.get('data')
  
  // Pass the data parameter to the report URL if it exists
  const reportUrl = new URL(`/reports/${resolvedParams.id}?print=1${dataParam ? `&data=${dataParam}` : ''}`, url.origin).toString()

  let browser: Browser | null = null
  
  try {
    console.log('Launching browser for PDF generation...')
    const executablePath = await chromium.executablePath()

    browser = await puppeteer.launch({
      executablePath,
      args: chromium.args,
      headless: true,
      defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
    })

    console.log('Navigating to report URL:', reportUrl)
    const page = await browser.newPage()
    
    // Wait for the page to load completely
    await page.goto(reportUrl, { waitUntil: 'networkidle0', timeout: 30000 })
    
    // Set print media type to apply print styles
    await page.emulateMediaType('print')
    
    // Wait a bit more for any dynamic content (charts) to render
    await new Promise(resolve => setTimeout(resolve, 2000))

    console.log('Generating PDF...')
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,          // let @page size/margins win
      margin: { top: '12mm', right: '12mm', bottom: '20mm', left: '12mm' },
      displayHeaderFooter: true,
      footerTemplate: `
        <div style="width: 100%; font-size: 10px; color: #666; text-align: center; margin: 0 12mm;">
          <span>Retirement Planning Analysis Report</span>
          <span style="float: right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `,
      headerTemplate: '<div></div>', // Empty header
    })

    console.log('PDF generated successfully')

    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="retirement-report-${resolvedParams.id}.pdf"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
      },
    })
  } catch (err: unknown) {
    console.error('PDF generation error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ 
      error: 'Failed to generate PDF', 
      details: message,
      reportUrl 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  } finally {
    if (browser) {
      console.log('Closing browser')
      await browser.close()
    }
  }
}