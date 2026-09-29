import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { ReportDataSchema } from '@/lib/pdf-generator/schema/reportData'
import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { buildMethodologyCopy } from '@/lib/pdf-generator/methodologyCopy'
import { buildEuroUnitCopy } from '@/lib/pdf-generator/euroUnitCopy'
import { deriveKeyFindings } from '@/lib/pdf-generator/insights/keyFindings'
import {
  euroUnitFilenameSuffix,
  realMethodFor,
  resolveEuroUnit,
} from '@/lib/pdf-generator/euroUnit'
import { computeBridgeAnalysis } from '@/lib/insights/bridge'
import { calculateCombinedExpenses, runMonteCarloSimulation } from '@/lib/simulation/engine'
import { DEFAULT_PARAMS, type SimulationResults } from '@/types'

/**
 * The PDF follows the dashboard's Nominal / Heutige € switch: every projected
 * euro is printed in the unit the viewer had on screen, labelled as such, and
 * nothing is ever half one and half the other.
 */
const params = { ...DEFAULT_PARAMS, simulationRuns: 200 }
const results = runMonteCarloSimulation(params)
const horizon = results.ages.length - 1

function build(res: SimulationResults, displayReal?: boolean, locale: 'de' | 'en' = 'de') {
  const data = transformToReportData(
    params,
    res,
    undefined,
    locale,
    displayReal === undefined ? undefined : { displayReal }
  )
  const parsed = ReportDataSchema.parse({ ...data, locale })
  return { data: parsed, content: mapReportDataToContent(parsed) }
}

/** The same results as an older build persisted them: no real-terms fields. */
function withoutRealSeries(res: SimulationResults): SimulationResults {
  const {
    assetPercentilesReal: _assets,
    spendingPercentilesReal: _spending,
    sampleAssetPathsReal: _paths,
    cashFlowMeansReal: _flows,
    ...rest
  } = res
  return rest
}

describe('report euro unit — series selection', () => {
  it('stays nominal by default, so older callers get the report they always got', () => {
    const { data, content } = build(results)
    expect(data.units).toEqual({ requested: 'nominal', applied: 'nominal' })
    expect(content.units.applied).toBe('nominal')
    expect(data.projections.milestones.at(-1)?.p50).toBe(results.assetPercentiles.p50[horizon])
    expect(build(results, false).data.projections.milestones).toEqual(data.projections.milestones)
  })

  it('prints the per-path real percentiles in real mode — the series the dashboard shows', () => {
    const real = results.assetPercentilesReal!
    const { data, content } = build(results, true)
    expect(data.units).toEqual({ requested: 'real', applied: 'real', realMethod: 'perPath' })
    for (const [index, milestone] of data.projections.milestones.entries()) {
      expect(milestone.p10).toBe(real.p10[index])
      expect(milestone.p20).toBe(real.p20[index])
      expect(milestone.p50).toBe(real.p50[index])
      expect(milestone.p80).toBe(real.p80[index])
      expect(milestone.p90).toBe(real.p90[index])
    }
    expect(content.projections.milestones.at(-1)?.p50).toBe(real.p50[horizon])
    // With positive inflation today's purchasing power is the smaller number.
    expect(real.p50[horizon]).toBeLessThan(results.assetPercentiles.p50[horizon])
  })

  it('leaves the success rate, plan score and run counts untouched', () => {
    const nominal = build(results, false).data
    const real = build(results, true).data
    expect(real.projections.successRatePct).toBe(nominal.projections.successRatePct)
    expect(real.simulation).toEqual(nominal.simulation)
    expect(real.summary?.planHealthScore).toBe(nominal.summary?.planHealthScore)
    expect(real.summary?.successProbabilityPct).toBe(nominal.summary?.successProbabilityPct)
    expect(real.summary?.topActionsDetailed).toEqual(nominal.summary?.topActionsDetailed)
  })

  it('keeps unit-free ratios identical in both modes, taken on today’s euros', () => {
    const nominal = build(results, false)
    const real = build(results, true)
    expect(real.data.projections.ratios).toEqual(nominal.data.projections.ratios)

    const retirementIndex = results.ages.indexOf(params.retirementAge)
    const budget = calculateCombinedExpenses(params.customExpenses).combinedAnnual
    const realRetirementMedian = results.assetPercentilesReal!.p50[retirementIndex]
    expect(nominal.data.projections.ratios?.firstYearWithdrawalRate).toBeCloseTo(
      budget / realRetirementMedian,
      10
    )
    const bridgeShare = (content: typeof real.content) =>
      deriveKeyFindings(content)
        .find((finding) => finding.id === 'bridge')
        ?.text.match(/\((\d+)\s*% des Medianvermögens/)?.[1]
    expect(bridgeShare(real.content)).toBeDefined()
    expect(bridgeShare(real.content)).toBe(bridgeShare(nominal.content))
  })

  it('does not re-run the simulation to produce the real report', () => {
    const run = jest.spyOn(jest.requireActual('@/lib/simulation/engine'), 'runMonteCarloSimulation')
    build(results, true)
    expect(run).not.toHaveBeenCalled()
    run.mockRestore()
  })
})

describe('report euro unit — fallbacks for results without real series', () => {
  it('deflates by the median inflation index when only that is available', () => {
    const legacy = withoutRealSeries(results)
    const index = results.inflationIndexP50!
    expect(realMethodFor(legacy)).toBe('medianIndex')
    const { data } = build(legacy, true)
    expect(data.units).toEqual({ requested: 'real', applied: 'real', realMethod: 'medianIndex' })
    for (const [i, milestone] of data.projections.milestones.entries()) {
      expect(milestone.p50).toBeCloseTo(results.assetPercentiles.p50[i] / index[i], 6)
      expect(milestone.p10).toBeCloseTo(results.assetPercentiles.p10[i] / index[i], 6)
      expect(milestone.p90).toBeCloseTo(results.assetPercentiles.p90[i] / index[i], 6)
    }
  })

  it('stays nominal and says so when neither real series nor index exist', () => {
    const { inflationIndexP50: _index, ...bare } = withoutRealSeries(results)
    expect(realMethodFor(bare)).toBeNull()
    const { data, content } = build(bare, true)
    expect(data.units).toEqual({ requested: 'real', applied: 'nominal' })
    expect(data.projections.milestones.map((m) => m.p50)).toEqual(results.assetPercentiles.p50)
    // Nothing derived switches either: the bridge stays in the nominal basis.
    expect(data.summary?.bridge.cashNeedEUR).toBe(
      Math.round(computeBridgeAnalysis(params).cashNeedEUR)
    )
    const copy = buildEuroUnitCopy(content.units, 'de')
    expect(copy.statement).toContain('keine inflationsbereinigten Werte')
    expect(copy.chart).toBe('€ · nominal')
    expect(euroUnitFilenameSuffix(content.units, 'de')).toBe('')
  })

  it('refuses an index that does not line up with the ages', () => {
    const short = { ...withoutRealSeries(results), inflationIndexP50: [1, 1.02] }
    expect(resolveEuroUnit(short, true)).toEqual({ requested: 'real', applied: 'nominal' })
  })
})

describe('report euro unit — derived amounts', () => {
  it('states the bridge need in today’s purchasing power in real mode', () => {
    const annual = calculateCombinedExpenses(params.customExpenses).combinedAnnual
    const bridge = computeBridgeAnalysis(params, { real: true })
    expect(bridge.yearsInBridge).toBeGreaterThan(0)
    expect(bridge.cashNeedEUR).toBeCloseTo(annual * bridge.yearsInBridge, 6)

    const { data } = build(results, true)
    expect(data.summary?.bridge.cashNeedEUR).toBe(Math.round(bridge.cashNeedEUR))
    // The default basis grows the budget with inflation and is left as it was.
    expect(build(results, false).data.summary?.bridge.cashNeedEUR).toBe(
      Math.round(computeBridgeAnalysis(params).cashNeedEUR)
    )
  })

  it('quotes the real bridge need, labelled, in the recommendation texts', () => {
    const { data } = build(results, true)
    const amount = new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(Math.round(computeBridgeAnalysis(params, { real: true }).cashNeedEUR))
    const bridgeRec = data.recommendations.find((rec) => rec.id === 'bridgeLiquidity')
    expect(bridgeRec?.body).toContain(`${amount} in heutiger Kaufkraft`)

    const nominalRec = build(results, false).data.recommendations.find(
      (rec) => rec.id === 'bridgeLiquidity'
    )
    expect(nominalRec?.body).not.toContain('Kaufkraft')
  })
})

describe('report euro unit — labels', () => {
  it('names the unit on the cover, in the summary and in the methodology (German, formal)', () => {
    const real = build(results, true).content
    const nominal = build(results, false).content

    const realCopy = buildEuroUnitCopy(real.units, 'de')
    expect(realCopy.statement).toMatch(
      /^Alle Beträge in heutiger Kaufkraft \(inflationsbereinigt\)/
    )
    expect(realCopy.chart).toBe('€ · heutige Kaufkraft')
    expect(realCopy.short).toBe('heutige Kaufkraft')
    expect(buildMethodologyCopy(real).methodology).toContain(
      'Jeder Pfad wird mit seiner eigenen realisierten Inflation'
    )

    const nominalCopy = buildEuroUnitCopy(nominal.units, 'de')
    expect(nominalCopy.statement).toMatch(/^Projizierte Beträge nominal/)
    expect(nominalCopy.chart).toBe('€ · nominal')
    expect(buildMethodologyCopy(nominal).units).toMatch(/^Beträge nominal/)

    // Formal register: the report never addresses the reader as "du".
    for (const text of [realCopy.statement, realCopy.methodology, nominalCopy.statement]) {
      expect(text).not.toMatch(/\b(du|dein|deine|dir)\b/)
    }
  })

  it('has English equivalents', () => {
    const real = build(results, true, 'en').content
    const copy = buildEuroUnitCopy(real.units, 'en')
    expect(copy.statement).toMatch(
      /^All amounts in today's purchasing power \(inflation-adjusted\)/
    )
    expect(copy.chart).toBe("€ · today's purchasing power")
    expect(buildMethodologyCopy(real).methodology).toContain(
      'deflated by its own realised inflation'
    )
    expect(euroUnitFilenameSuffix(real.units, 'en')).toBe('-todays-euros')
    expect(euroUnitFilenameSuffix(real.units, 'de')).toBe('-heutige-euro')
  })

  it('calls the median-path growth real in real mode instead of always "nominal"', () => {
    const realFinding = deriveKeyFindings(build(results, true).content).find(
      (finding) => finding.id === 'medianPath'
    )
    const nominalFinding = deriveKeyFindings(build(results, false).content).find(
      (finding) => finding.id === 'medianPath'
    )
    expect(realFinding?.text).toMatch(/ real\)\.$/)
    expect(nominalFinding?.text).toMatch(/ nominal\)\.$/)
  })

  it('marks the approximation when the index fallback was used', () => {
    const { content } = build(withoutRealSeries(results), true)
    expect(buildEuroUnitCopy(content.units, 'de').statement).toContain('näherungsweise')
    expect(buildMethodologyCopy(content).units).toContain('mittleren realisierten Preisindex')
  })
})
