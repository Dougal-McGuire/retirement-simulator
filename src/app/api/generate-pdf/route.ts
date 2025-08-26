import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer-core'
import Handlebars from 'handlebars'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { ReportDataSchema } from '@/lib/pdf-generator/schema/reportData'
import { renderLineChart, renderBarChart, type ChartSeries } from '@/lib/pdf-generator/charts/vega'
import * as formatters from '@/lib/pdf-generator/utils/formatters'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // Allow up to 30 seconds for PDF generation

// Register Handlebars helpers
Object.entries(formatters).forEach(([name, fn]) => {
  Handlebars.registerHelper(name, fn as any)
})
Handlebars.registerHelper('eq', (a: any, b: any) => a === b)

async function loadTemplates(baseDir: string) {
  const templatesDir = join(baseDir, 'templates')
  
  // Register partial
  const kpiTilePartial = readFileSync(join(templatesDir, 'components', 'kpi-tile.hbs'), 'utf-8')
  Handlebars.registerPartial('kpi-tile', kpiTilePartial)
  
  // Load templates
  const templates = {
    base: readFileSync(join(templatesDir, 'base.html'), 'utf-8'),
    cover: readFileSync(join(templatesDir, 'cover.hbs'), 'utf-8'),
    toc: readFileSync(join(templatesDir, 'toc.hbs'), 'utf-8'),
    exec: readFileSync(join(templatesDir, 'section-exec.hbs'), 'utf-8'),
    profile: readFileSync(join(templatesDir, 'section-profile.hbs'), 'utf-8'),
    assets: readFileSync(join(templatesDir, 'section-assets.hbs'), 'utf-8'),
    spending: readFileSync(join(templatesDir, 'section-spending.hbs'), 'utf-8'),
    risk: readFileSync(join(templatesDir, 'section-risk.hbs'), 'utf-8'),
    recos: readFileSync(join(templatesDir, 'section-recos.hbs'), 'utf-8'),
    appendix: readFileSync(join(templatesDir, 'section-appendix.hbs'), 'utf-8'),
  }
  
  return {
    base: Handlebars.compile(templates.base),
    cover: Handlebars.compile(templates.cover),
    toc: Handlebars.compile(templates.toc),
    exec: Handlebars.compile(templates.exec),
    profile: Handlebars.compile(templates.profile),
    assets: Handlebars.compile(templates.assets),
    spending: Handlebars.compile(templates.spending),
    risk: Handlebars.compile(templates.risk),
    recos: Handlebars.compile(templates.recos),
    appendix: Handlebars.compile(templates.appendix),
  }
}

async function generateCharts(data: any) {
  // Assets projection chart
  const assetsSeries: ChartSeries[] = [
    {
      name: 'P10 (Pessimistic)',
      values: data.projections.milestones.map((m: any) => ({ x: m.age, y: m.p10 })),
    },
    {
      name: 'P50 (Median)',
      values: data.projections.milestones.map((m: any) => ({ x: m.age, y: m.p50 })),
    },
    {
      name: 'P90 (Optimistic)',
      values: data.projections.milestones.map((m: any) => ({ x: m.age, y: m.p90 })),
    },
  ]

  const assetsChart = await renderLineChart(assetsSeries, {
    width: 560,
    height: 320,
    xTitle: 'Age (Years)',
    yTitle: 'Portfolio Value (€)',
  })

  // Spending breakdown chart
  const spendingCategories = [
    'Healthcare',
    'Food & Groceries',
    'Entertainment',
    'Shopping',
    'Utilities',
    'Vacations',
    'Home Repairs',
    'Car',
  ]

  const spendingValues = [
    data.spending.monthly.health * 12,
    data.spending.monthly.food * 12,
    data.spending.monthly.entertainment * 12,
    data.spending.monthly.shopping * 12,
    data.spending.monthly.utilities * 12,
    data.spending.annual.vacations,
    data.spending.annual.homeRepairs,
    data.spending.annual.car,
  ]

  const spendingChart = await renderBarChart(spendingCategories, spendingValues, {
    width: 560,
    height: 320,
    xTitle: 'Expense Category',
    yTitle: 'Annual Amount (€)',
  })

  return { assetsChart, spendingChart }
}

export async function POST(req: NextRequest) {
  let browser = null
  
  try {
    // Parse request body
    const { params, results } = await req.json()
    
    if (!params || !results) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }
    
    // Transform data to PDF generator format
    const reportData = transformToReportData(params, results)
    
    // Validate data
    const validatedData = ReportDataSchema.parse(reportData)
    
    // Check if tax rate was adjusted
    const originalTaxRate = params.capitalGainsTax
    const taxRateAdjusted = originalTaxRate > 100
    
    // Get the base directory for templates
    const baseDir = join(process.cwd(), 'src', 'lib', 'pdf-generator')
    
    // Load templates
    const templates = await loadTemplates(baseDir)
    
    // Generate charts
    const charts = await generateCharts(validatedData)
    
    // Load CSS
    const stylesDir = join(baseDir, 'styles')
    const tokensCSS = readFileSync(join(stylesDir, 'tokens.css'), 'utf-8')
    const printCSS = readFileSync(join(stylesDir, 'print.css'), 'utf-8')
    
    // Update font paths in CSS to use web fonts
    const updatedPrintCSS = printCSS
      .replace(/url\("\.\.\/\.\.\/assets\/fonts\//g, 'url("https://fonts.gstatic.com/s/inter/v12/')
      .replace(/Inter-Regular\.woff2/g, 'UcC73FwrK3iLTcr9SEhqVAtK.woff2')
      .replace(/Inter-Medium\.woff2/g, 'UcC73FwrK3iLTcrfSEhqVAtK.woff2')
      .replace(/Inter-SemiBold\.woff2/g, 'UcC73FwrK3iLTcrdSEhqVAtK.woff2')
      .replace(/Inter-Bold\.woff2/g, 'UcC73FwrK3iLTcr-SEhqVAtK.woff2')
      .replace(/Source Serif Pro/g, 'Georgia') // Fallback for Source Serif
      .replace(/SourceSerif-.*\.woff2/g, '') // Remove Source Serif references
    
    const combinedCSS = tokensCSS + '\n' + updatedPrintCSS
    
    // Render sections
    const sections = [
      templates.cover(validatedData),
      templates.toc(validatedData),
      templates.exec(validatedData),
      templates.profile({ ...validatedData, taxRateAdjusted }),
      templates.assets({ ...validatedData, ...charts }),
      templates.spending({ ...validatedData, ...charts }),
      templates.risk(validatedData),
      templates.recos(validatedData),
      templates.appendix(validatedData),
    ].join('\n')
    
    // Render full HTML
    const html = templates.base({
      css: combinedCSS,
      content: sections,
      reportDate: new Date().toLocaleDateString('de-DE'),
    })
    
    // Launch Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium-browser',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    })
    
    const page = await browser.newPage()
    
    // Set viewport and media type
    await page.setViewport({ width: 794, height: 1123 })
    await page.emulateMediaType('print')
    
    // Load HTML
    await page.setContent(html, {
      waitUntil: 'networkidle0',
    })
    
    // Wait a bit for any async rendering
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Generate PDF
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      },
    })
    
    // Return PDF
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="retirement-report-${Date.now()}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
    
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to generate PDF',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}