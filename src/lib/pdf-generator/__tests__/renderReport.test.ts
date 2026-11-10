import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_PARAMS, type CashFlow, type SimulationParams } from '@/types'
import { applyCashFlows } from '@/lib/simulation/cashFlows'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { measureLeverEffects } from '@/lib/insights/leverEffects'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { mapReportDataToContent, type ReportContent } from '@/lib/pdf-generator/reportTypes'
import { ReportDataSchema, type ReportLocale } from '@/lib/pdf-generator/schema/reportData'
import { inspectPdf, type PdfInspection } from '@/lib/pdf-generator/testing/pdfText'

/**
 * The report, rendered for real.
 *
 * Every variant below goes through the actual `<RetirementReport/>` and the
 * actual @react-pdf/renderer (in a child Node process — its packages are ES
 * modules Jest cannot load, see `testing/tsLoaderHooks.mjs`), and the
 * resulting bytes are read back: header, size, page count and the text a
 * reader would see. The route test this replaces mocked `renderToBuffer`, so
 * a report that crashed the renderer, printed "NaN €" or addressed the reader
 * as "du" passed it.
 *
 * Set REPORT_RENDER_OUT=<dir> to keep the PDFs for a look.
 */

const TESTING_DIR = path.resolve(__dirname, '..', 'testing')
const FONT_DIR = path.resolve(__dirname, '..', 'react-pdf', 'fonts')
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..')

type Variant = {
  params: SimulationParams
  locale: ReportLocale
  displayReal: boolean
  planName: string
}

const basePlan = applyCashFlows({ ...DEFAULT_PARAMS, simulationRuns: 150 })

/** Thirty scheduled flows of every kind, frequency and window shape. */
const thirtyFlows: CashFlow[] = Array.from({ length: 30 }, (_, i) => ({
  id: `flow-${i}`,
  kind: i % 4 === 0 ? ('income' as const) : ('expense' as const),
  name: `Posten ${i + 1}: ${i % 4 === 0 ? 'Nebeneinkommen aus Vermietung' : 'Sonderausgabe für Haus und Garten'}`,
  amount: 150 + i * 35,
  frequency: i % 5 === 0 ? ('once' as const) : i % 2 === 0 ? ('annual' as const) : ('monthly' as const),
  startAge: 58 + (i % 25),
  ...(i % 5 === 0 ? {} : { endAge: 62 + (i % 25) }),
  ...(i % 7 === 0 ? { inflationLinked: false } : {}),
}))
const manyFlowsPlan = applyCashFlows({
  ...basePlan,
  cashFlows: [...basePlan.cashFlows, ...thirtyFlows],
})

const pensionOffPlan = applyCashFlows({
  ...basePlan,
  cashFlows: basePlan.cashFlows.map((flow) =>
    flow.kind === 'pension' ? { ...flow, enabled: false } : flow
  ),
})

const historicalPlan = applyCashFlows({ ...basePlan, marketModel: 'historical' })

/**
 * A plan whose weakest tenth of runs cannot pay for every year: retiring at
 * 56 on a fixed real budget, eleven years before the statutory pension.
 */
const strainedPlan = applyCashFlows({
  ...basePlan,
  retirementAge: 56,
  annualSavings: 12_000,
  withdrawalStrategy: 'fixedReal',
})

/** The rule with the longest description in the methodology paragraph. */
const percentRulePlan = applyCashFlows({ ...basePlan, withdrawalStrategy: 'percentOfPortfolio' })

const LONG_NAME =
  'Früher Ruhestand mit Teilzeit, Abfindung & Pflegevorsorge – Variante konservativ'

const VARIANTS = {
  'de-nominal': { params: basePlan, locale: 'de', displayReal: false, planName: 'Basisplan' },
  'de-real': { params: basePlan, locale: 'de', displayReal: true, planName: 'Basisplan' },
  'en-nominal': { params: basePlan, locale: 'en', displayReal: false, planName: 'Base plan' },
  'en-real': { params: basePlan, locale: 'en', displayReal: true, planName: 'Base plan' },
  'long-name': { params: basePlan, locale: 'de', displayReal: false, planName: LONG_NAME },
  'thirty-flows': { params: manyFlowsPlan, locale: 'de', displayReal: false, planName: 'Viele Posten' },
  'pension-off': { params: pensionOffPlan, locale: 'de', displayReal: false, planName: 'Ohne Rente' },
  historical: { params: historicalPlan, locale: 'en', displayReal: true, planName: 'Backtest' },
  // The longest methodology text there is: the appendix must still be one page.
  'historical-de': {
    params: historicalPlan,
    locale: 'de',
    displayReal: false,
    planName: 'Backtest',
  },
  // The stress case fails: the red marker, the danger callout and the longer
  // "what matters first" text all have to fit.
  strained: { params: strainedPlan, locale: 'de', displayReal: true, planName: 'Früh raus' },
  'strained-en': { params: strainedPlan, locale: 'en', displayReal: false, planName: 'Out early' },
  'percent-rule': {
    params: percentRulePlan,
    locale: 'de',
    displayReal: true,
    planName: 'Prozent vom Depot',
  },
} satisfies Record<string, Variant>

type VariantName = keyof typeof VARIANTS

const rendered = new Map<VariantName, { bytes: Buffer; pdf: PdfInspection; content: ReportContent }>()
let workDir = ''

beforeAll(async () => {
  const keep = process.env.REPORT_RENDER_OUT
  workDir = keep ? path.resolve(keep) : mkdtempSync(path.join(os.tmpdir(), 'report-render-'))
  mkdirSync(workDir, { recursive: true })

  const runs = new Map<SimulationParams, ReturnType<typeof runMonteCarloSimulation>>()
  const contents = new Map<VariantName, ReportContent>()
  for (const [name, variant] of Object.entries(VARIANTS) as Array<[VariantName, Variant]>) {
    const results = runs.get(variant.params) ?? runMonteCarloSimulation(variant.params)
    runs.set(variant.params, results)
    // Measured exactly as the app measures them — by simulation.
    const leverEffects = await measureLeverEffects(results, async (scenario) =>
      runMonteCarloSimulation(scenario)
    )
    const data = transformToReportData(variant.params, results, variant.planName, variant.locale, {
      displayReal: variant.displayReal,
      leverEffects,
    })
    contents.set(
      name,
      mapReportDataToContent(ReportDataSchema.parse({ ...data, locale: variant.locale }))
    )
  }

  const jobFile = path.join(workDir, 'jobs.json')
  writeFileSync(
    jobFile,
    JSON.stringify({
      fonts: {
        regular: path.join(FONT_DIR, 'Inter-Regular.ttf'),
        medium: path.join(FONT_DIR, 'Inter-Medium.ttf'),
        semibold: path.join(FONT_DIR, 'Inter-SemiBold.ttf'),
        bold: path.join(FONT_DIR, 'Inter-Bold.ttf'),
      },
      jobs: [...contents].map(([name, content]) => ({
        name,
        content,
        out: path.join(workDir, `${name}.pdf`),
      })),
    })
  )

  execFileSync(process.execPath, [path.join(TESTING_DIR, 'renderReports.mjs'), jobFile], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: 150_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  for (const [name, content] of contents) {
    const bytes = readFileSync(path.join(workDir, `${name}.pdf`))
    rendered.set(name, { bytes, pdf: inspectPdf(bytes), content })
  }
}, 180_000)

afterAll(() => {
  if (!process.env.REPORT_RENDER_OUT && workDir) rmSync(workDir, { recursive: true, force: true })
})

const get = (name: VariantName) => rendered.get(name)!
const names = Object.keys(VARIANTS) as VariantName[]

describe('every variant renders to a real PDF', () => {
  it.each(names)('%s: header, size and page count', (name) => {
    const { bytes, pdf } = get(name)
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    expect(bytes.subarray(-6).toString('latin1')).toContain('%%EOF')
    expect(pdf.isPdf).toBe(true)
    // Eight pages of text and vector charts with four subsetted fonts: about
    // 115 kB. A blank or runaway document is far outside this window.
    expect(bytes.byteLength).toBeGreaterThan(60_000)
    expect(bytes.byteLength).toBeLessThan(400_000)
    // Cover, contents and six sections — one page each, by design. Only a
    // long list of scheduled flows makes the spending section run on.
    if (name === 'thirty-flows') {
      expect(pdf.pageCount).toBeGreaterThanOrEqual(9)
      expect(pdf.pageCount).toBeLessThanOrEqual(10)
    } else {
      expect(pdf.pageCount).toBe(8)
    }
  })

  it.each(names)('%s: prints no placeholder, no broken number', (name) => {
    const { pdf } = get(name)
    expect(pdf.text.length).toBeGreaterThan(5_000)
    expect(pdf.text).not.toMatch(/undefined|NaN|\[object|\bnull\b|Infinity/)
    // A formatter given nothing prints these.
    expect(pdf.text).not.toMatch(/€\s*-?\s*€|%\s*%/)
    // Every page carries its footer.
    pdf.pages.forEach((page, index) => {
      if (index === 0) return
      expect(page.replace(/\s+/g, ' ')).toMatch(
        new RegExp(`(Seite|Page) ${index + 1} (von|of) ${pdf.pageCount}`)
      )
    })
  })
})

describe('German reports', () => {
  const german: VariantName[] = [
    'de-nominal',
    'de-real',
    'long-name',
    'thirty-flows',
    'pension-off',
    'historical-de',
    'strained',
    'percent-rule',
  ]

  it.each(german)('%s addresses the reader formally, never as "du"', (name) => {
    const { pdf } = get(name)
    expect(pdf.text).toContain('Ihrer Ruhestandsstrategie')
    expect(pdf.text).toMatch(/\bSie\b/)
    expect(pdf.text).not.toMatch(/\b(du|dein|deine|deinen|deinem|deiner|dir|dich)\b/i)
    // German number formatting, not an English sentence that slipped through.
    expect(pdf.text).toMatch(/\d{1,3}\.\d{3} €/)
    expect(pdf.text).not.toMatch(/Retirement Plan Report|Management Summary of|runs fund the plan/)
  })

  it('states the unit on the cover and in the summary — nominal', () => {
    const { pdf } = get('de-nominal')
    expect(pdf.pages[0].replace(/\s+/g, ' ')).toContain('Projizierte Beträge nominal')
    expect(pdf.pages[2].replace(/\s+/g, ' ')).toContain('Projizierte Beträge nominal')
    expect(pdf.text).toContain('in nominalen Euro')
    expect(pdf.text).not.toContain('Alle Beträge in heutiger Kaufkraft')
  })

  it('states the unit on the cover and in the summary — today’s euros', () => {
    const { pdf } = get('de-real')
    expect(pdf.pages[0].replace(/\s+/g, ' ')).toContain('Alle Beträge in heutiger Kaufkraft')
    expect(pdf.pages[2].replace(/\s+/g, ' ')).toContain('Alle Beträge in heutiger Kaufkraft')
    expect(pdf.text).not.toContain('in nominalen Euro')
    expect(pdf.text).not.toContain('Projizierte Beträge nominal')
  })
})

describe('English reports', () => {
  it.each(['en-nominal', 'en-real', 'historical'] as VariantName[])('%s is in English', (name) => {
    const { pdf } = get(name)
    expect(pdf.text).toContain('your retirement strategy')
    expect(pdf.text).not.toMatch(/Ruhestandsbericht|Zusammenfassung|Läufe/)
  })

  it('states the unit in both modes', () => {
    expect(get('en-nominal').pdf.text).toContain('Projected amounts are nominal')
    expect(get('en-nominal').pdf.text).toContain('in nominal euros')
    expect(get('en-real').pdf.text).toContain("All amounts in today's purchasing power")
    expect(get('en-real').pdf.text).not.toContain('in nominal euros')
  })
})

describe('the corrected numbers are what the PDF prints', () => {
  it('shows the entered capital as "today" and labels the first simulated row', () => {
    const { pdf } = get('en-nominal')
    const results = pdf.pages[4].replace(/\s+/g, ' ')
    expect(results).toContain('Today (as entered)')
    expect(results).toContain('€630,000')
    expect(results).toContain('End of plan year 1')
    expect(results).toContain('year-end')
    // The summary's key finding and timeline start from the same figure.
    const summary = pdf.pages[2].replace(/\s+/g, ' ')
    expect(summary).toContain('The median path moves from €630,000 today')
    expect(summary).toContain('assets €630,000 (as entered)')
  })

  it('prints the ledger’s pension coverage, bridge need and withdrawal rate', () => {
    const { pdf, content } = get('en-nominal')
    const year = content.ledger!.pensionYear!
    const money = (value: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(value)
    expect(pdf.text).toContain(
      `covers ${Math.round(year.coverage! * 100)}% of that year's spending (${money(year.pensionNet)} of ${money(year.expenses)} in nominal euros`
    )
    expect(pdf.text).toContain(`${money(year.portfolioWithdrawal)} is withdrawn from the portfolio`)
    expect(pdf.text).toContain(`${money(content.profile.bridge!.cashNeedEUR)} in nominal euros`)
    const rate = `${(content.projections.ratios!.firstYearWithdrawalRate! * 100).toFixed(1)}%`
    // Summary data row, results card, plan-score reason and recommendation: one figure.
    expect(pdf.text.split(rate).length - 1).toBeGreaterThanOrEqual(3)
    // The gross-pension-over-budget finding is gone.
    expect(pdf.text).not.toContain('covers 95%')
    expect(pdf.text).not.toMatch(/same figure as the dashboard|Liquidity/)
  })

  it('prints the measured levers, labelled as simulated', () => {
    const { pdf, content } = get('de-nominal')
    const page = pdf.pages[6].replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ')
    expect(page).toContain('Simulierte Wirkung der Hebel')
    expect(page).toContain('Simuliert, nicht geschätzt')
    expect(page).toContain('Zwei Jahre später in den Ruhestand')
    const levers = content.recommendations.levers!
    expect(levers.levers).toHaveLength(3)
    for (const lever of levers.levers) {
      const rounded = Math.round(lever.deltaPoints * 10) / 10
      const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
      expect(page).toContain(`${sign}${Math.abs(rounded).toFixed(1).replace('.', ',')} pp`)
    }
    expect(page).not.toMatch(/Modellschätzung|Erwartete Wirkung/)
  })

  it('prints the retirement spending total from the ledger with its unit', () => {
    const { pdf, content } = get('de-real')
    const page = pdf.pages[5].replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ')
    const total = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(
      content.expenses.retirement!.total
    )
    expect(page).toContain('Ausgaben im Ruhestand')
    expect(page).toContain(`${total} €`)
    expect(page).toContain('Summe Alter 60–90 (31 Jahre), heutige Kaufkraft')
  })
})

describe('success is "every year paid", not "capital left"', () => {
  const flat = (text: string) => text.replace(/\s+/g, ' ')

  it('defines the success rate that way wherever it is explained', () => {
    const german = flat(get('de-nominal').pdf.text)
    expect(german).toContain('in denen die Ausgaben bis Alter 90 in jedem Jahr gedeckt sind')
    expect(german).toContain('eine Lücke bis 1 % der Jahresausgaben gilt noch als gedeckt')
    expect(german).toContain('Anteil der Läufe ohne Deckungslücke')
    expect(german).toMatch(/Ausgaben jedes Jahr ?gedeckt/)
    const english = flat(get('en-nominal').pdf.text)
    expect(english).toContain("in which every year's spending to age 90 is funded")
    expect(english).toContain('share of runs with no shortfall')
    // The old definition — the capital surviving — is gone from every variant.
    for (const name of names) {
      expect(flat(get(name).pdf.text)).not.toMatch(
        /Kapitalerschöpfung|Überleben des Kapitals|Kapital nicht aufgebraucht|capital not exhausted|plain survival|capital depletion|keep capital alive/
      )
    }
  })

  it('marks the stress case where a tenth of the runs can no longer pay', () => {
    const { pdf, content } = get('strained')
    const age = content.projections.exhaustionAge
    // The fixture really is a plan whose weakest tenth fails.
    expect(content.simulation.depletionRisk).toBeGreaterThanOrEqual(0.1)
    expect(age).toBeDefined()
    const text = flat(pdf.text)
    expect(text).toContain(`Stressfall: Lücke ab ${age}`)
    expect(text).toContain('Deckungslücke im Stressszenario')
    expect(text).toContain(
      `reichen Depot und Einnahmen spätestens im Alter ${age} erstmals nicht mehr für die Ausgaben`
    )
    expect(text).toContain(`Im Stressszenario sind die Ausgaben ab Alter ${age} nicht mehr gedeckt`)
    expect(text).not.toMatch(/P10 erschöpft|läuft ab Alter \d+ leer|Stressszenario bleibt finanziert/)

    const english = flat(get('strained-en').pdf.text)
    expect(english).toContain(`Stress case: shortfall from ${age}`)
    expect(english).toContain('Shortfall in the Stress Scenario')
    expect(english).not.toMatch(/P10 depleted|runs dry|Stress Scenario Stays Funded/)
  })

  it('says the stress case stays funded where fewer than a tenth of the runs fail', () => {
    // The percentage rule never asks the portfolio for more than a share of
    // itself, so far fewer than a tenth of its runs ever go short.
    const { pdf, content } = get('percent-rule')
    expect(content.simulation.depletionRisk).toBeLessThan(0.1)
    expect(content.projections.exhaustionAge).toBeUndefined()
    const text = flat(pdf.text)
    expect(text).toContain('Stressszenario bleibt finanziert')
    // No red marker in the chart, no danger callout on the results page (the
    // appendix still explains what red would mean).
    expect(text).not.toContain('Stressfall: Lücke ab')
    expect(flat(pdf.pages[4])).not.toContain('Deckungslücke im Stressszenario')
  })

  it('describes the percentage rule as what the portfolio pays on top of other income', () => {
    const text = flat(get('percent-rule').pdf.text)
    expect(text).toContain('zusätzlich zu Renten und laufenden Einnahmen')
    expect(text).toContain('Die Regel allein zehrt das Depot nicht auf')
    expect(text).not.toContain('kann rechnerisch nicht aufgezehrt werden')
  })
})

describe('edge cases', () => {
  it('prints a long plan name in full on the cover without spilling onto a blank page', () => {
    const { pdf } = get('long-name')
    expect(LONG_NAME).toHaveLength(80)
    expect(pdf.pageCount).toBe(8)
    expect(pdf.pages[0].replace(/\s+/g, ' ')).toContain(`Plan: ${LONG_NAME}`)
    // Page 2 is the table of contents, not an overflow of the cover.
    expect(pdf.pages[1]).toContain('Inhaltsverzeichnis')
  })

  it('cuts a long plan name in the one-line running header and footer', () => {
    const { pdf } = get('long-name')
    for (const page of pdf.pages.slice(1)) {
      const text = page.replace(/\s+/g, ' ')
      // Header: up to 60 characters; footer: up to 26, each ending in an ellipsis.
      expect(text).toContain('Plan: Früher Ruhestand mit Teilzeit, Abfindung & Pflegevorsorge –…')
      expect(text).toContain('Plan: Früher Ruhestand mit Teil…')
      expect(text).not.toContain(LONG_NAME)
    }
  })

  it('lists all thirty scheduled flows, on as many pages as they need', () => {
    const { pdf } = get('thirty-flows')
    for (let i = 1; i <= 30; i++) expect(pdf.text).toContain(`Posten ${i}:`)
    // The spending section is the only one that grows; the others stay one page.
    expect(pdf.pageCount).toBeGreaterThan(8)
    const sectionStarts = pdf.pages
      .map((page, index) => (/\b0[1-6] · /.test(page.replace(/\s+/g, ' ')) ? index : -1))
      .filter((index) => index !== -1)
    expect(sectionStarts).toHaveLength(6)
  })

  it('describes a switched-off pension as not counted — and claims no coverage', () => {
    const { pdf, content } = get('pension-off')
    expect(content.ledger?.pensionYear).toBeNull()
    expect(content.profile.bridge).toBeUndefined()
    expect(pdf.text).toContain('Keine Rente berücksichtigt (im Plan ausgeschaltet)')
    expect(pdf.text).toContain('Nicht berücksichtigt')
    // No coverage claim, and no "until the pension starts" for a pension that never does.
    expect(pdf.text).not.toMatch(/deckt die Rente nach Steuern|Bis zum Beginn der/)
    expect(pdf.text).toContain('keine Jahre vor der Rente')
  })

  it('describes a historical backtest as one, with its real path count', () => {
    const { pdf } = get('historical')
    expect(pdf.pages[0].replace(/\s+/g, ' ')).toMatch(/HISTORICAL BACKTEST 1900.2024/)
    expect(pdf.text).toContain('125 historical start years')
    expect(pdf.text).toContain('This analysis is a historical backtest')
    expect(pdf.text).not.toMatch(/Monte Carlo simulation with|lognormally/)
    expect(pdf.text).toContain('the same 125 historical start years')
  })
})
