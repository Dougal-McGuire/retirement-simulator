import { WITHDRAWAL_STRATEGIES, DEFAULT_PARAMS, type WithdrawalStrategy } from '@/types'
import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import {
  withdrawalStrategyLabel,
  withdrawalStrategyRows,
  withdrawalStrategySummary,
} from '@/lib/pdf-generator/withdrawalStrategy'

/**
 * The report is the artefact a user takes to an adviser, so "which rule was
 * this run under, and with what settings" has to survive the whole chain
 * unchanged — and must never list a parameter the engine did not read.
 */

const assumptionsFor = (strategy: WithdrawalStrategy, overrides = {}) => {
  const params = {
    ...DEFAULT_PARAMS,
    simulationRuns: 40,
    withdrawalStrategy: strategy,
    ...overrides,
  }
  const results = runMonteCarloSimulation(params)
  return {
    params,
    assumptions: mapReportDataToContent(transformToReportData(params, results, undefined, 'de'))
      .assumptions,
  }
}

describe('withdrawal strategy in the report', () => {
  it.each(WITHDRAWAL_STRATEGIES)('carries %s through transform and mapping', (strategy) => {
    const { params, assumptions } = assumptionsFor(strategy, { spendingFloorReal: 24_000 })

    expect(assumptions.withdrawalStrategy).toBe(strategy)
    expect(assumptions.dsWithdrawalRate).toBe(params.dsWithdrawalRate)
    expect(assumptions.spendingFloorReal).toBe(24_000)
  })

  it.each(WITHDRAWAL_STRATEGIES)('names %s in both languages', (strategy) => {
    const de = withdrawalStrategyLabel(strategy, true)
    const en = withdrawalStrategyLabel(strategy, false)
    expect(de).toBeTruthy()
    expect(en).toBeTruthy()
    expect(withdrawalStrategySummary(strategy, true)).toBeTruthy()
    expect(withdrawalStrategySummary(strategy, false)).toBeTruthy()
    // The German copy is genuinely German, not the English string reused.
    if (strategy !== 'percentOfPortfolio') expect(de).not.toBe(en)
  })

  it('prints only the parameters each strategy actually reads', () => {
    const rowsFor = (strategy: WithdrawalStrategy) =>
      withdrawalStrategyRows(assumptionsFor(strategy).assumptions, 'de-DE', true)
        .map((row) => row.label)
        .join(' | ')

    // Fixed real spending reads none of them, so the report says nothing.
    expect(rowsFor('fixedReal')).toBe('')
    expect(rowsFor('vanguardDynamic')).toContain('Obergrenze')
    // The Vanguard guardrails are not inputs to the other two rules, so they
    // must not appear under them.
    expect(rowsFor('guytonKlinger')).not.toContain('Obergrenze')
    // The rate the guardrails are measured against every year — not a rate
    // that only applies at the start.
    expect(rowsFor('guytonKlinger')).toContain('Zielentnahmerate vom Depot')
    expect(rowsFor('guytonKlinger')).not.toContain('Startentnahmerate')
    expect(rowsFor('percentOfPortfolio')).not.toContain('Obergrenze')
    expect(rowsFor('percentOfPortfolio')).toContain('Ausgabenuntergrenze')
  })

  it('describes the rules as governing what the portfolio pays on top of other income', () => {
    // The engine's rules take pensions and recurring income first; the rate is
    // the portfolio's share on top. No summary may read as "total spending is
    // x % of the portfolio", and none may promise the portfolio cannot run out.
    for (const strategy of ['vanguardDynamic', 'guytonKlinger', 'percentOfPortfolio'] as const) {
      expect(withdrawalStrategySummary(strategy, false)).toMatch(/pensions and (recurring )?income/)
      expect(withdrawalStrategySummary(strategy, true)).toMatch(/Renten und (laufende[n]? )?Einnahmen/)
    }
    expect(withdrawalStrategySummary('percentOfPortfolio', false)).toContain(
      'scheduled expenses or a spending floor can'
    )
    expect(withdrawalStrategySummary('percentOfPortfolio', false)).not.toMatch(/cannot mathematically/)
    expect(withdrawalStrategySummary('percentOfPortfolio', true)).not.toMatch(/kann rechnerisch nicht/)
  })

  it('says "none" rather than €0 when the percentage rule has no floor', () => {
    const rows = withdrawalStrategyRows(
      assumptionsFor('percentOfPortfolio', { spendingFloorReal: 0 }).assumptions,
      'en-US',
      false
    )
    expect(rows.find((row) => row.label.includes('floor'))?.value).toBe('none')
  })
})
