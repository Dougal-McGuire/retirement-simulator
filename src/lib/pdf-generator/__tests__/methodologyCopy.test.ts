import {
  UNFUNDED_SPENDING_TOLERANCE,
  buildMethodologyCopy,
} from '@/lib/pdf-generator/methodologyCopy'
import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { ReportDataSchema, type ReportLocale } from '@/lib/pdf-generator/schema/reportData'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import {
  UNFUNDED_SPENDING_TOLERANCE as ENGINE_TOLERANCE,
  runMonteCarloSimulation,
} from '@/lib/simulation/engine'
import { DEFAULT_PARAMS, type SimulationParams } from '@/types'

function contentFor(patch: Partial<SimulationParams>, locale: ReportLocale = 'en') {
  const params: SimulationParams = { ...DEFAULT_PARAMS, simulationRuns: 200, ...patch }
  const results = runMonteCarloSimulation(params)
  const data = ReportDataSchema.parse({
    ...transformToReportData(params, results, 'Base plan'),
    locale,
  })
  return { content: mapReportDataToContent(data), results }
}

describe('report methodology copy — market model', () => {
  it('describes a Monte Carlo run as a Monte Carlo run', () => {
    const { content } = contentFor({})
    const copy = buildMethodologyCopy(content)

    expect(copy.methodology).toContain('Monte Carlo simulation with 200 runs')
    expect(copy.methodology).toContain('lognormally distributed')
    expect(copy.limitations[0]).toContain('drawn independently')
  })

  it('never calls a historical backtest a Monte Carlo simulation', () => {
    const { content } = contentFor({ marketModel: 'historical', simulationRuns: 5000 })
    const copy = buildMethodologyCopy(content)

    expect(copy.methodology).toContain('historical backtest')
    expect(copy.methodology).toContain('125 replays')
    expect(copy.methodology).toContain('1900 to 2024')
    expect(copy.methodology).not.toMatch(/monte carlo/i)
    expect(copy.methodology).not.toMatch(/lognormal/i)
    // The requested run count is meaningless in this mode and must not appear.
    expect(copy.methodology).not.toContain('5,000')
    expect(copy.limitations[0]).toContain('125 paths')
    expect(copy.limitations[0]).toContain('not independent')
  })

  it('keeps the German copy mode-aware too', () => {
    const mc = buildMethodologyCopy(contentFor({}, 'de').content)
    const hist = buildMethodologyCopy(
      contentFor({ marketModel: 'historical' }, 'de').content
    )

    expect(mc.methodology).toContain('Monte-Carlo-Simulation')
    expect(hist.methodology).toContain('historischer Backtest')
    expect(hist.methodology).not.toMatch(/Monte.?Carlo/i)
    expect(hist.methodology).not.toMatch(/lognormal/i)
  })
})

describe('report methodology copy — tax model', () => {
  it('describes the German tax model the engine actually applies', () => {
    const { content } = contentFor({})
    const [, tax] = buildMethodologyCopy(content).limitations

    expect(tax).toContain('Sparerpauschbetrag')
    expect(tax).toContain('Teilfreistellung')
    expect(tax).toContain('taxable')
    // The old bullet claimed the opposite of the assumptions table.
    expect(tax).not.toContain('allowances, partial exemptions and progressive effects are not')
  })

  it('says so plainly when a plan really does run the flat model', () => {
    const { content } = contentFor({
      taxAllowanceAnnual: 0,
      equityFundExemption: 0,
      pensionTaxablePortion: 0,
      pensionTaxRate: 0,
    })
    const [, tax] = buildMethodologyCopy(content).limitations

    expect(tax).not.toContain('Sparerpauschbetrag')
    expect(tax).toContain('The state pension is left untaxed')
  })
})

describe('report methodology copy — success definition', () => {
  it('defines success as every year being funded — not as the capital surviving', () => {
    const { content } = contentFor({ legacyTargetReal: 0 })
    const copy = buildMethodologyCopy(content)

    // The engine's definition: income and portfolio together pay each year's
    // spending, within the engine's 1 % tolerance. A portfolio at zero is not
    // a failure while a pension pays the budget.
    // The report quotes the tolerance the engine counts with — its own copy of
    // the constant must never drift from the engine's.
    expect(UNFUNDED_SPENDING_TOLERANCE).toBe(ENGINE_TOLERANCE)
    expect(ENGINE_TOLERANCE).toBe(0.01)
    expect(copy.successRate).toContain("every year's spending to age 90 is funded")
    expect(copy.successRate).toContain('by income and portfolio together')
    expect(copy.successRate).toContain("a gap of up to 1% of a year's spending still counts")
    expect(copy.successRate).toContain('no bequest goal')
    expect(copy.successRate).not.toMatch(/survival|exhaust|capital/i)

    const german = buildMethodologyCopy({ ...content, locale: 'de' }).successRate
    expect(german).toContain('die Ausgaben bis Alter 90 in jedem Jahr gedeckt sind')
    expect(german).toContain('aus Einnahmen und Depot zusammen')
    expect(german.replace(/\s+/g, ' ')).toContain('eine Lücke bis 1 % der Jahresausgaben')
    expect(german).not.toMatch(/Überleben|aufgebraucht|Kapital/)
  })

  it('prints both numbers with their labels when a bequest goal is active', () => {
    const { content } = contentFor({ legacyTargetReal: 400_000 })
    const copy = buildMethodologyCopy(content)

    expect(copy.successRate).toContain('AND at least')
    expect(copy.successRate).toContain('Without the bequest goal')
    expect(content.simulation.successDefinition).toBe('legacyConditioned')
    // Both figures have to be in the sentence, each next to what it means.
    const percentages = copy.successRate.match(/\d+(\.\d+)?%/g) ?? []
    expect(percentages.length).toBeGreaterThanOrEqual(2)
  })
})

describe('report simulation context', () => {
  it('carries the effective path count, not the requested one', () => {
    const { content } = contentFor({ marketModel: 'historical', simulationRuns: 5000 })

    expect(content.simulation.effectiveRuns).toBe(125)
    expect(content.profile.success.trials).toBe(125)
    expect(content.assumptions.simulationRuns).toBe(5000) // the raw input, unchanged
  })

  it('counts horizon years from the simulated ages, inclusive', () => {
    const { content } = contentFor({ currentAge: 55, endAge: 90 })

    expect(content.simulation.horizonYears).toBe(36)
    expect(content.expenses.horizonYears).toBe(36)
  })

  it('reconstructs a truthful context for a payload that predates it', () => {
    const { content: fresh } = contentFor({ marketModel: 'historical', simulationRuns: 5000 })
    const data = ReportDataSchema.parse({
      ...transformToReportData(
        { ...DEFAULT_PARAMS, marketModel: 'historical', simulationRuns: 5000 },
        runMonteCarloSimulation({
          ...DEFAULT_PARAMS,
          marketModel: 'historical',
          simulationRuns: 5000,
        }),
        'Base plan'
      ),
      simulation: undefined,
      locale: 'en',
    })
    const legacy = mapReportDataToContent(data)

    expect(legacy.simulation.fromContext).toBe(false)
    // Even without a stored context the report must not claim 5 000 paths.
    expect(legacy.simulation.effectiveRuns).toBe(125)
    expect(legacy.simulation.marketModel).toBe(fresh.simulation.marketModel)
    expect(legacy.simulation.horizonYears).toBe(36)
  })
})

describe('report glossary — one definition, one wording', () => {
  it('defines the withdrawal rate the way firstYearWithdrawalRate computes it', () => {
    const en = buildMethodologyCopy(contentFor({}).content).withdrawalRate
    expect(en).toContain('pays out in the first retirement year')
    expect(en).toContain('after pensions and other income')
    expect(en).toContain('tax on realised gains')
    expect(en).toContain('divided by the portfolio at the start of that year')

    const de = buildMethodologyCopy(contentFor({}, 'de').content).withdrawalRate
    expect(de).toContain('im ersten Ruhestandsjahr')
    expect(de).toContain('geteilt durch das Depot zu Beginn dieses Jahres')
  })

  it('defines the bridge as the years before the main pension, with the ledger’s withdrawals', () => {
    const en = buildMethodologyCopy(contentFor({}).content).bridge
    expect(en).toContain('before the main pension starts')
    expect(en).toContain('the statutory pension where the plan counts it, otherwise the largest')
    expect(en).toContain('sum of what the portfolio pays out in those years')
    // The old entry: "when spending comes entirely from the portfolio".
    expect(en).not.toContain('entirely')
  })

  it('states the plan score with the weights actually applied and no dashboard claim', () => {
    const { content } = contentFor({})
    const en = buildMethodologyCopy(content).planScore
    expect(content.profile.success.components.map((part) => [part.id, part.weight])).toEqual([
      ['success', 0.7],
      ['withdrawal', 0.3],
    ])
    expect(en).toContain('success rate (70%)')
    expect(en).toContain('first-year withdrawal rate (30%')
    expect(en).toContain('follows the success rate alone')
    expect(en).not.toMatch(/liquidity/i)
    expect(en).not.toMatch(/same figure/i)

    const de = buildMethodologyCopy(contentFor({}, 'de').content).planScore
    expect(de.replace(/[\u00a0\u202f]/g, ' ')).toContain('Erfolgsquote (70 %)')
    expect(de).not.toMatch(/Liquidität|identisch zur Anzeige im Dashboard/)
  })

  it('lists that today’s portfolio is assumed to carry no unrealised gains', () => {
    const en = buildMethodologyCopy(contentFor({}).content).limitations
    expect(en.some((line) => line.includes('assumed to carry no unrealised gains'))).toBe(true)
    const de = buildMethodologyCopy(contentFor({}, 'de').content).limitations
    expect(de.some((line) => line.includes('keine unrealisierten Kursgewinne'))).toBe(true)
  })
})

