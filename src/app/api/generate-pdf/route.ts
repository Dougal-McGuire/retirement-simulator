import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer-core'
import Handlebars from 'handlebars'
import type { HelperOptions } from 'handlebars'
import IntlMessageFormat from 'intl-messageformat'
import { readFileSync } from 'fs'
import { join } from 'path'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { ReportDataSchema, type ReportData } from '@/lib/pdf-generator/schema/reportData'
import { renderLineChart, renderBarChart, type ChartSeries } from '@/lib/pdf-generator/charts/vega'
import { defaultLocale, locales, type Locale } from '@/i18n/config'
import { loadMessages } from '@/i18n/request'
import { createFormatterHelpers } from '@/lib/pdf-generator/utils/formatters'
import type { AbstractIntlMessages } from 'next-intl'

// Dynamic import for chromium to avoid issues in dev
let chromium: any = null
if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
  const ch = require('@sparticuz/chromium') as any
  // Set the headless mode for chromium
  ch.setHeadlessMode = true
  // Set graphics mode to false for serverless
  ch.setGraphicsMode = false
  chromium = ch
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Increase timeout for PDF generation

async function loadTemplates(baseDir: string, hbs: typeof Handlebars) {
  const templatesDir = join(baseDir, 'templates')

  // Register partial
  const kpiTilePartial = readFileSync(join(templatesDir, 'components', 'kpi-tile.hbs'), 'utf-8')
  hbs.registerPartial('kpi-tile', kpiTilePartial)

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
    base: hbs.compile(templates.base),
    cover: hbs.compile(templates.cover),
    toc: hbs.compile(templates.toc),
    exec: hbs.compile(templates.exec),
    profile: hbs.compile(templates.profile),
    assets: hbs.compile(templates.assets),
    spending: hbs.compile(templates.spending),
    risk: hbs.compile(templates.risk),
    recos: hbs.compile(templates.recos),
    appendix: hbs.compile(templates.appendix),
  }
}

type TranslateFn = (key: string, values?: Record<string, unknown>) => string

async function generateCharts(data: ReportData, t: TranslateFn) {
  // Assets projection chart
  const assetsSeries: ChartSeries[] = [
    {
      name: t('pdf.charts.assets.series.p10'),
      values: data.projections.milestones.map((m) => ({ x: m.age, y: m.p10 })),
    },
    {
      name: t('pdf.charts.assets.series.p20'),
      values: data.projections.milestones.map((m) => ({ x: m.age, y: m.p20 ?? m.p50 })),
      color: '#f59e0b',
    },
    {
      name: t('pdf.charts.assets.series.p50'),
      values: data.projections.milestones.map((m) => ({ x: m.age, y: m.p50 })),
    },
    {
      name: t('pdf.charts.assets.series.p80'),
      values: data.projections.milestones.map((m) => ({ x: m.age, y: m.p80 ?? m.p50 })),
      color: '#34d399',
    },
    {
      name: t('pdf.charts.assets.series.p90'),
      values: data.projections.milestones.map((m) => ({ x: m.age, y: m.p90 })),
    },
  ]

  const assetsChart = await renderLineChart(assetsSeries, {
    width: 560,
    height: 320,
    xTitle: t('pdf.charts.assets.axes.x'),
    yTitle: t('pdf.charts.assets.axes.y'),
    band: {
      values: data.projections.milestones.map((m) => ({ x: m.age, yTop: m.p80 ?? m.p50, yBottom: m.p20 ?? m.p50 })),
      color: '#60a5fa',
      opacity: 0.18,
    },
  })

  // Spending breakdown chart
  const spendingCategories = [
    t('pdf.charts.spending.categories.health'),
    t('pdf.charts.spending.categories.food'),
    t('pdf.charts.spending.categories.entertainment'),
    t('pdf.charts.spending.categories.shopping'),
    t('pdf.charts.spending.categories.utilities'),
    t('pdf.charts.spending.categories.vacations'),
    t('pdf.charts.spending.categories.repairs'),
    t('pdf.charts.spending.categories.car'),
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
    xTitle: t('pdf.charts.spending.axes.x'),
    yTitle: t('pdf.charts.spending.axes.y'),
  })

  return { assetsChart, spendingChart }
}

const PLAN_HEALTH_LABEL_MAP: Record<string, string> = {
  Strong: 'strong',
  Moderate: 'moderate',
  'Needs Attention': 'needsAttention',
}

const PLAN_HEALTH_REASON_MAP: Record<string, string> = {
  'solid savings rate': 'solidSavingsRate',
  'moderate bridge drawdown': 'moderateBridge',
  'high success probability': 'highSuccessProbability',
  'balanced assumptions': 'balancedAssumptions',
}

const RECOMMENDATION_TITLE_MAP: Record<string, string> = {
  'Increase Savings Rate': 'increaseSavingsRate',
  'Delay Retirement': 'delayRetirement',
  'Optimize Investment Mix': 'optimizeInvestmentMix',
  'Review Spending Plan': 'reviewSpendingPlan',
  'Maximize Tax-Deferred Contributions': 'maximizeTaxDeferred',
  'Consider Volatility Reduction': 'considerVolatilityReduction',
  'Review Insurance Coverage': 'reviewInsuranceCoverage',
}

const RECOMMENDATION_CATEGORY_MAP: Record<string, string> = {
  'Savings Strategy': 'savingsStrategy',
  Timing: 'timing',
  'Investment Strategy': 'investmentStrategy',
  'Expense Management': 'expenseManagement',
  'Tax Planning': 'taxPlanning',
  'Risk Management': 'riskManagement',
  Protection: 'protection',
}

const RECOMMENDATION_BODY_MAP: Record<string, string> = {
  'Your current success rate indicates potential challenges. Consider increasing your annual savings by 10-20% to improve retirement security.':
    'increaseSavingsRate',
  'Working an additional 2-3 years could significantly improve your success rate by allowing more time for asset accumulation.':
    'delayRetirement',
  'Review your asset allocation to ensure appropriate balance between growth and stability for your risk tolerance.':
    'optimizeInvestmentMix',
  'Your expenses are high relative to savings. Consider reviewing discretionary spending to improve financial flexibility.':
    'reviewSpendingPlan',
  'Ensure you are taking full advantage of tax-advantaged retirement accounts to reduce current tax liability and enhance long-term growth.':
    'maximizeTaxDeferred',
  'Your portfolio has high volatility. As you approach retirement, consider gradually shifting to more stable investments.':
    'considerVolatilityReduction',
  'Evaluate current insurance policies including health, long-term care, and life insurance to ensure adequate protection.':
    'reviewInsuranceCoverage',
}

const IMPACT_MAP: Record<string, string> = {
  High: 'high',
  Medium: 'medium',
  Low: 'low',
}

const IMPACT_PRIORITY_MAP: Record<string, number> = {
  High: 1,
  Medium: 2,
  Low: 3,
}

const IMPACT_TIMELINE_KEY_MAP: Record<string, string> = {
  High: 'immediate',
  Medium: 'months3to6',
  Low: 'months12',
}

const IMPACT_BENEFIT_KEY_MAP: Record<string, string> = {
  High: 'high',
  Medium: 'medium',
  Low: 'low',
}

function createTranslatorFn(locale: Locale, messages: AbstractIntlMessages): TranslateFn {
  const cache = new Map<string, IntlMessageFormat>()

  const resolveMessage = (path: string): unknown =>
    path.split('.').reduce<unknown>((acc, segment) => {
      if (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[segment]
      }
      return undefined
    }, messages)

  return (key, values = {}) => {
    const message = resolveMessage(key)
    if (typeof message !== 'string') {
      return key
    }

    let formatter = cache.get(key)
    if (!formatter) {
      formatter = new IntlMessageFormat(message, locale)
      cache.set(key, formatter)
    }

    const output = formatter.format(values)
    if (Array.isArray(output)) {
      return output.join('')
    }
    return String(output)
  }
}

function localizeReportData(data: ReportData, t: TranslateFn) {
  const summary = data.summary
    ? (() => {
        const planHealthLabelKey = PLAN_HEALTH_LABEL_MAP[data.summary.planHealthLabel]
        const planHealthLabelText = planHealthLabelKey
          ? t(`pdf.summary.planHealthLabel.${planHealthLabelKey}`)
          : data.summary.planHealthLabel

        const reasonsSource =
          data.summary.planHealthWhyBits && data.summary.planHealthWhyBits.length > 0
            ? data.summary.planHealthWhyBits
            : data.summary.planHealthWhy
              ? [data.summary.planHealthWhy]
              : []

        const planHealthWhyItems = reasonsSource.map((reason) => {
          const reasonKey = PLAN_HEALTH_REASON_MAP[reason]
          return reasonKey ? t(`pdf.summary.planHealthWhy.bits.${reasonKey}`) : reason
        })

        const planHealthWhyText = planHealthWhyItems.join(' + ')

        const topActionsText = (data.summary.topActions || []).map((title) => {
          const key = RECOMMENDATION_TITLE_MAP[title]
          return key ? t(`pdf.recommendations.titles.${key}`) : title
        })

        const topActionsDetailed = (data.summary.topActionsDetailed || []).map((item) => {
          const titleKey = RECOMMENDATION_TITLE_MAP[item.title]
          return {
            ...item,
            titleText: titleKey ? t(`pdf.recommendations.titles.${titleKey}`) : item.title,
            upliftRangeText: t('pdf.summary.topActions.range', {
              min: item.upliftMin,
              max: item.upliftMax,
            }),
          }
        })

        return {
          ...data.summary,
          planHealthLabelKey,
          planHealthLabelText,
          planHealthWhyItems,
          planHealthWhyText,
          topActionsText,
          topActionsDetailed,
        }
      })()
    : undefined

  const recommendations = data.recommendations.map((rec) => {
    const titleKey = RECOMMENDATION_TITLE_MAP[rec.title]
    const categoryKey = RECOMMENDATION_CATEGORY_MAP[rec.category]
    const bodyKey = RECOMMENDATION_BODY_MAP[rec.body]
    const impactKey = IMPACT_MAP[rec.impact]
    const timelineKey = IMPACT_TIMELINE_KEY_MAP[rec.impact]
    const benefitKey = IMPACT_BENEFIT_KEY_MAP[rec.impact]

    return {
      ...rec,
      titleText: titleKey ? t(`pdf.recommendations.titles.${titleKey}`) : rec.title,
      categoryText: categoryKey ? t(`pdf.recommendations.categories.${categoryKey}`) : rec.category,
      bodyText: bodyKey ? t(`pdf.recommendations.bodies.${bodyKey}`) : rec.body,
      impactText: impactKey ? t(`pdf.recommendations.impact.${impactKey}`) : rec.impact,
      priorityRank: IMPACT_PRIORITY_MAP[rec.impact] ?? 3,
      timelineText: timelineKey
        ? t(`pdf.recommendations.priority.timeline.${timelineKey}`)
        : t('pdf.recommendations.priority.timeline.default'),
      benefitText: benefitKey
        ? t(`pdf.recommendations.priority.benefit.${benefitKey}`)
        : t('pdf.recommendations.priority.benefit.default'),
    }
  })

  return {
    ...data,
    summary,
    recommendations,
  }
}

export async function POST(req: NextRequest) {
  let browser = null

  try {
    console.log('PDF generation started')
    console.log('Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      hasChromium: !!chromium,
    })

    // Parse request body
    const { params, results, locale: requestedLocale } = await req.json()

    if (!params || !results) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    const locale = locales.includes(requestedLocale as Locale)
      ? (requestedLocale as Locale)
      : defaultLocale

    const messages = await loadMessages(locale)
    const translator = createTranslatorFn(locale, messages)

    const hbs = Handlebars.create()
    const formatterHelpers = createFormatterHelpers(locale)

    Object.entries(formatterHelpers).forEach(([name, fn]) => {
      hbs.registerHelper(name, fn as (...args: unknown[]) => unknown)
    })

    hbs.registerHelper('eq', (a: unknown, b: unknown) => a === b)
    hbs.registerHelper('t', function (key: string, options?: HelperOptions) {
      return translator(key, options?.hash ?? {})
    })
    hbs.registerHelper('successBadgeLabel', (successRate: number) => {
      const badgeKey = formatterHelpers.getSuccessBadgeKey(successRate)
      return translator(`pdf.exec.badges.${badgeKey}`)
    })

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
    const templates = await loadTemplates(baseDir, hbs)

    // Generate charts
    const charts = await generateCharts(validatedData, translator)

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

    const localizedData = localizeReportData(validatedData, translator)

    const baseContext = { ...localizedData, locale, taxRateAdjusted }

    // Render sections in client-friendly order
    const sections = [
      templates.cover(baseContext),
      templates.exec(baseContext),
      templates.toc(baseContext),
      templates.profile(baseContext),
      templates.assets({ ...baseContext, ...charts }),
      templates.spending({ ...baseContext, ...charts }),
      templates.risk(baseContext),
      templates.recos(baseContext),
      templates.appendix(baseContext),
    ].join('\n')

    // Render full HTML
    const now = new Date()
    const reportDate = formatterHelpers.formatDate(now.toISOString())
    const html = templates.base({
      css: combinedCSS,
      content: sections,
      reportDate,
      locale,
    })

    // Launch Puppeteer with different settings for production/dev
    const isVercel = process.env.VERCEL === '1'

    if (isVercel && chromium) {
      // Production on Vercel: Use serverless chromium
      console.log('Using serverless chromium for PDF generation on Vercel')

      try {
        // Get the executable path - note the function call with parentheses
        const execPath = await chromium.executablePath()
        console.log('Chromium executable path:', execPath)
        console.log('Chromium args:', chromium.args)

        browser = await puppeteer.launch({
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath: execPath,
          headless: chromium.headless,
        })

        console.log('Browser launched successfully')
      } catch (launchError) {
        console.error('Failed to launch browser:', launchError)
        throw new Error(
          `Browser launch failed: ${launchError instanceof Error ? launchError.message : 'Unknown error'}`
        )
      }
    } else {
      // Development: Use local chromium
      console.log('Using local chromium for PDF generation')

      browser = await puppeteer.launch({
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
        executablePath: process.env.CHROME_PATH || '/usr/bin/chromium-browser',
        headless: true,
      })
    }

    const page = await browser.newPage()

    // Set viewport and media type
    await page.setViewport({ width: 794, height: 1123 })
    await page.emulateMediaType('print')

    // Load HTML
    await page.setContent(html, {
      waitUntil: 'networkidle0',
    })

    // Wait a bit for any async rendering
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Generate PDF with header/footer (page numbers, title, date)
    const headerTemplate = `
      <div style="font-size:8px; width:100%; padding:0 16px; color:#6b7280;">
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <span>${translator('pdf.header.title')}</span>
          <span>${reportDate}</span>
        </div>
      </div>`

    const footerTemplate = `
      <div style="font-size:8px; width:100%; padding:0 16px; color:#9ca3af;">
        <div style="display:flex; justify-content:center; width:100%;">
          <span>${translator('pdf.footer.title')} — ${reportDate} — ${translator('pdf.footer.page')} <span class="pageNumber"></span> ${translator('pdf.footer.of')} <span class="totalPages"></span></span>
        </div>
      </div>`

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: {
        top: '16mm',
        right: '12mm',
        bottom: '16mm',
        left: '12mm',
      },
    })

    // Convert to Buffer if needed
    const pdfBuffer = Buffer.from(pdf)

    // Return PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="retirement-report-${Date.now()}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')

    // Return more detailed error for debugging
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
        environment: {
          NODE_ENV: process.env.NODE_ENV,
          VERCEL: process.env.VERCEL,
          hasChromium: !!chromium,
        },
      },
      { status: 500 }
    )
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch (closeError) {
        console.error('Error closing browser:', closeError)
      }
    }
  }
}
