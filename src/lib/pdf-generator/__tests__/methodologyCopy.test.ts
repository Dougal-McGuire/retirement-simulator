import { buildMethodologyCopy } from '@/lib/pdf-generator/methodologyCopy'
import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { ReportDataSchema, type ReportLocale } from '@/lib/pdf-generator/schema/reportData'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
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
  it('defines success as plain survival without a bequest goal', () => {
    const { content } = contentFor({ legacyTargetReal: 0 })
    const copy = buildMethodologyCopy(content)

    expect(copy.successRate).toContain('plain survival')
    expect(copy.successRate).toContain('no bequest goal')
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

describe('total horizon need', () => {
  it('includes scheduled cash-flow expenses the report lists elsewhere', () => {
    const care = {
      id: 'care',
      kind: 'expense' as const,
      name: 'Care costs',
      amount: 3000,
      frequency: 'monthly' as const,
      startAge: 80,
      endAge: 90,
    }
    const { content: withoutCare } = contentFor({})
    const { content: withCare } = contentFor({
      cashFlows: [...DEFAULT_PARAMS.cashFlows, care],
    })

    // 3 000 a month for ages 80..90 inclusive = 11 years.
    const expected = 3000 * 12 * 11
    expect(withCare.expenses.scheduledExpenseTotal).toBe(expected)
    expect(withCare.expenses.totalHorizonAmount).toBe(
      withoutCare.expenses.totalHorizonAmount + expected
    )
    expect(withoutCare.expenses.scheduledExpenseTotal).toBe(0)
  })

  it('counts a one-off expense exactly once', () => {
    const { content } = contentFor({
      cashFlows: [
        ...DEFAULT_PARAMS.cashFlows,
        {
          id: 'roof',
          kind: 'expense' as const,
          name: 'Roof',
          amount: 40_000,
          frequency: 'once' as const,
          startAge: 70,
        },
      ],
    })
    expect(content.expenses.scheduledExpenseTotal).toBe(40_000)
  })

  it('ignores scheduled income — the figure is a spending need', () => {
    const { content } = contentFor({
      cashFlows: [
        ...DEFAULT_PARAMS.cashFlows,
        {
          id: 'rent',
          kind: 'income' as const,
          name: 'Rent',
          amount: 900,
          frequency: 'monthly' as const,
        },
      ],
    })
    expect(content.expenses.scheduledExpenseTotal).toBe(0)
  })
})
