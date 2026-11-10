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
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
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
    expect(real.summary?.planHealthBand).toBe(nominal.summary?.planHealthBand)
    expect(real.summary?.planHealthComponents).toEqual(nominal.summary?.planHealthComponents)
    expect(real.summary?.successProbabilityPct).toBe(nominal.summary?.successProbabilityPct)
  })

  it('keeps unit-free ratios identical in both modes, read from the ledger', () => {
    const nominal = build(results, false)
    const real = build(results, true)
    expect(real.data.projections.ratios).toEqual(nominal.data.projections.ratios)

    // The one definition: what the portfolio paid out in the first retirement
    // year over what it held at the start of that year.
    const retirementIndex = results.ages.indexOf(params.retirementAge)
    const booked = results.cashFlowMeans![retirementIndex]
    expect(nominal.data.projections.ratios?.firstYearWithdrawalRate).toBe(
      booked.portfolioWithdrawal / booked.openingAssets
    )
    // Bridge share: both sides in today's euros, whichever unit is printed.
    const realRows = results.cashFlowMeansReal!
    let realNeed = 0
    for (let age = params.retirementAge; age < params.legalRetirementAge; age++) {
      realNeed += realRows[results.ages.indexOf(age)].portfolioWithdrawal
    }
    expect(nominal.data.projections.ratios?.bridgeShareOfRetirementAssets).toBeCloseTo(
      realNeed / realRows[retirementIndex].openingAssets,
      10
    )
    const bridgeShare = (content: typeof real.content) =>
      deriveKeyFindings(content)
        .find((finding) => finding.id === 'bridge')
        ?.text.match(/(\d+)\s*% des Depots zu Ruhestandsbeginn/)?.[1]
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
    // The percentiles are year-END balances. `index[i]` is the level age i's
    // year opens with, so a balance at its end belongs to `index[i + 1]`; the
    // last year has no successor and closes one year of the plan's inflation
    // assumption later.
    const closingLevel = (i: number) =>
      i < horizon ? index[i + 1] : index[horizon] * (1 + params.averageInflation)
    for (const [i, milestone] of data.projections.milestones.entries()) {
      expect(milestone.p50).toBeCloseTo(results.assetPercentiles.p50[i] / closingLevel(i), 6)
      expect(milestone.p10).toBeCloseTo(results.assetPercentiles.p10[i] / closingLevel(i), 6)
      expect(milestone.p90).toBeCloseTo(results.assetPercentiles.p90[i] / closingLevel(i), 6)
    }
    // Not the opening level: that would overstate every balance by a year of
    // inflation (the first one by exactly index[1] / index[0]).
    expect(data.projections.milestones[0].p50).toBeLessThan(results.assetPercentiles.p50[0])
  })

  it('lands on the engine’s own real series — which the opening level misses by a year', () => {
    // The engine deflates each path's year-end balance at that year's closing
    // price level. The fallback has only the median index, so over decades it
    // drifts a little from the engine's median — but in the first year, where
    // the paths have hardly spread, the two must coincide. With the closing
    // level they do; with the opening level the balance is a year of
    // inflation (2.5 %) too high.
    const perPath = results.assetPercentilesReal!.p50
    const index = results.inflationIndexP50!
    const fallback = build(withoutRealSeries(results), true).data.projections.milestones
    const openingLevel = results.assetPercentiles.p50.map((value, i) => value / index[i])
    expect(Math.abs(fallback[0].p50 / perPath[0] - 1)).toBeLessThan(0.002)
    expect(openingLevel[0] / perPath[0] - 1).toBeGreaterThan(0.02)

    // Across the whole horizon the closing level stays the closer of the two.
    const meanAbsError = (values: number[]) =>
      values.reduce((sum, value, i) => sum + Math.abs(value / perPath[i] - 1), 0) / values.length
    const withClosing = meanAbsError(fallback.map((milestone) => milestone.p50))
    const withOpening = meanAbsError(openingLevel)
    expect(withClosing).toBeLessThan(0.02)
    expect(withOpening).toBeGreaterThan(withClosing + 0.01)
  })

  it('stays nominal and says so when neither real series nor index exist', () => {
    const { inflationIndexP50: _index, ...bare } = withoutRealSeries(results)
    expect(realMethodFor(bare)).toBeNull()
    const { data, content } = build(bare, true)
    expect(data.units).toEqual({ requested: 'real', applied: 'nominal' })
    expect(data.projections.milestones.map((m) => m.p50)).toEqual(results.assetPercentiles.p50)
    // Nothing derived switches either: the bridge stays the nominal ledger's.
    expect(data.summary?.bridge?.cashNeedEUR).toBe(
      Math.round(computeBridgeAnalysis(params, { unit: 'nominal', results }).cashNeedEUR!)
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
  /** The ledger's portfolio withdrawals over the bridge ages 60–66. */
  const withdrawn = (rows: NonNullable<SimulationResults['cashFlowMeans']>) => {
    let total = 0
    for (let age = 60; age <= 66; age++) total += rows[results.ages.indexOf(age)].portfolioWithdrawal
    return total
  }

  it('states the bridge need in today’s purchasing power in real mode', () => {
    const bridge = computeBridgeAnalysis(params, { unit: 'real', results })
    expect(bridge.yearsInBridge).toBe(7)
    expect(bridge.cashNeedEUR).toBeCloseTo(withdrawn(results.cashFlowMeansReal!), 6)

    const { data } = build(results, true)
    expect(data.summary?.bridge?.cashNeedEUR).toBe(Math.round(bridge.cashNeedEUR!))
  })

  it('states the nominal bridge need in the euros the ledger booked', () => {
    const expected = withdrawn(results.cashFlowMeans!)
    const { data } = build(results, false)
    expect(data.summary?.bridge).toMatchObject({
      startAge: 60,
      endAge: 66,
      pensionAge: 67,
      mainPension: 'statutory',
      cashNeedEUR: Math.round(expected),
    })
    // Nominal is never below today's purchasing power at positive inflation.
    expect(expected).toBeGreaterThan(withdrawn(results.cashFlowMeansReal!))
  })

  it('deflates the nominal ledger by the median index when there is no real ledger', () => {
    const legacy = withoutRealSeries(results)
    const index = results.inflationIndexP50!
    let expected = 0
    for (let age = 60; age <= 66; age++) {
      const i = results.ages.indexOf(age)
      expected += results.cashFlowMeans![i].portfolioWithdrawal / index[i]
    }
    expect(build(legacy, true).data.summary?.bridge?.cashNeedEUR).toBe(Math.round(expected))
  })

  it('carries no bridge figure — rather than an estimated one — without a ledger', () => {
    const { cashFlowMeans: _nominal, cashFlowMeansReal: _real, ...bare } = results
    const { data, content } = build(bare, false)
    expect(data.summary?.bridge).toBeUndefined()
    expect(data.ledger).toBeUndefined()
    expect(data.projections.ratios).toEqual({
      firstYearWithdrawalRate: null,
      bridgeShareOfRetirementAssets: null,
    })
    expect(content.expenses.retirement).toBeNull()
    // The score is then the success rate alone.
    expect(data.summary?.planHealthComponents).toEqual([
      { id: 'success', value: bare.successRate, weight: 1 },
    ])
    expect(deriveKeyFindings(content).map((finding) => finding.id)).toEqual([
      'successBand',
      'depletion',
      'medianPath',
    ])
  })

  it('quotes the bridge need, labelled with its unit, in the recommendation texts', () => {
    const format = (value: number) =>
      new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(value)

    const real = build(results, true).data
    const realRec = real.recommendations.find((rec) => rec.id === 'bridgeLiquidity')
    expect(realRec?.body).toContain(
      `${format(Math.round(withdrawn(results.cashFlowMeansReal!)))} in heutiger Kaufkraft`
    )

    const nominal = build(results, false).data
    const nominalRec = nominal.recommendations.find((rec) => rec.id === 'bridgeLiquidity')
    expect(nominalRec?.body).not.toContain('Kaufkraft')
    // The nominal amount is the summary's figure and is labelled as nominal.
    expect(nominalRec?.body).toContain(
      `${format(nominal.summary!.bridge!.cashNeedEUR)} in nominalen Euro`
    )
  })

  it('labels every ledger amount in the key findings with the unit it is in', () => {
    const texts = (displayReal: boolean) =>
      deriveKeyFindings(build(results, displayReal).content)
        .filter((finding) => ['bridge', 'pensionCoverage', 'medianPath'].includes(finding.id))
        .map((finding) => finding.text)
    for (const text of texts(false)) expect(text).toContain('in nominalen Euro')
    for (const text of texts(true)) expect(text).toContain('in heutiger Kaufkraft')
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
