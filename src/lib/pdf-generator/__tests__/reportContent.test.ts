import { mapReportDataToContent, type ReportContent } from '@/lib/pdf-generator/reportTypes'
import { ReportDataSchema, type ReportLocale } from '@/lib/pdf-generator/schema/reportData'
import {
  stressShortfallAge,
  transformToReportData,
} from '@/lib/transformers/reportDataTransformer'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { applyCashFlows } from '@/lib/simulation/cashFlows'
import { getPlanHealth } from '@/lib/simulation/planInsights'
import { computePlanHealthScore } from '@/lib/insights/planHealth'
import { deriveKeyFindings } from '@/lib/pdf-generator/insights/keyFindings'
import { buildEuroUnitCopy } from '@/lib/pdf-generator/euroUnitCopy'
import { planBandOfRate } from '@/lib/pdf-generator/planScoreCopy'
import {
  HAND_PARAMS,
  HAND_PRICE_LEVELS,
  handResults,
  type HandResultsOptions,
} from '@/lib/insights/testing/handLedger'
import { DEFAULT_PARAMS, type SimulationParams, type SimulationResults } from '@/types'

const spaces = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ')

describe('Report content mapping', () => {
  const params = { ...DEFAULT_PARAMS, simulationRuns: 320 }
  const results = runMonteCarloSimulation(params)
  // Recommendation text is now written in the report's language by the
  // generator (their bodies interpolate this plan's figures), so the locale
  // travels with the transform rather than being applied by lookup afterwards.
  const reportData = transformToReportData(params, results, undefined, 'de')
  const content = mapReportDataToContent(reportData)

  it('keeps success count mathematisch konsistent', () => {
    const expected = Math.round(
      content.profile.success.successRate * content.profile.success.trials
    )
    expect(content.profile.success.successCount).toBe(expected)
  })

  it('maps withdrawal strategy assumptions', () => {
    expect(content.assumptions.withdrawalStrategy).toBe(params.withdrawalStrategy)
    expect(content.assumptions.dsWithdrawalRate).toBe(params.dsWithdrawalRate)
    expect(content.assumptions.dsCeilingRate).toBe(params.dsCeilingRate)
    expect(content.assumptions.dsFloorRate).toBe(params.dsFloorRate)
  })

  it('liefert deutsche Beschriftungen', () => {
    expect(['Stark', 'Beobachten', 'Angespannt']).toContain(content.profile.success.label)

    content.profile.highlights.forEach((entry) => {
      expect(entry).not.toMatch(/Increase Savings Rate|Delay Retirement|Optimize Investment Mix/)
    })

    content.recommendations.primary.forEach((rec) => {
      expect(rec.title).not.toMatch(
        /Increase Savings Rate|Delay Retirement|Optimize Investment Mix/
      )
      expect(rec.category).not.toMatch(/Savings Strategy|Investment Strategy|Expense Management/)
      expect(rec.body).not.toMatch(/of runs stay funded|statutory pension|the portfolio carries/)
    })
  })

  it('carries the plan score exactly as computePlanHealthScore built it', () => {
    const health = computePlanHealthScore(params, results)
    expect(content.profile.success.score).toBe(health.score)
    expect(content.profile.success.components).toEqual(health.components)
    const recomputed = Math.round(
      content.profile.success.components.reduce(
        (sum, component) => sum + component.weight * component.value,
        0
      )
    )
    expect(recomputed).toBe(content.profile.success.score)
  })

  it('derives key findings from the results rather than the recommendations', () => {
    const findings = deriveKeyFindings(content)
    expect(findings.length).toBeGreaterThanOrEqual(3)

    const recommendationTitles = content.recommendations.primary.map((rec) => rec.title)
    findings.forEach((finding) => {
      recommendationTitles.forEach((title) => {
        expect(finding.text).not.toContain(title)
      })
    })

    // The success-band finding must quote the same rate the KPI tile shows.
    const successFinding = findings.find((finding) => finding.id === 'successBand')
    expect(successFinding).toBeDefined()
    expect(successFinding?.text).toContain(String(content.profile.success.trials))
  })
})

/**
 * The numbers in the report, checked by hand against the ledger written out
 * in `src/lib/insights/testing/handLedger.ts` (see the table there).
 */
function handContent(
  options: HandResultsOptions & { locale?: ReportLocale; displayReal?: boolean } = {}
): ReportContent {
  const params: SimulationParams = options.params ?? HAND_PARAMS
  const locale = options.locale ?? 'en'
  const data = transformToReportData(params, handResults(options), 'Hand plan', locale, {
    displayReal: options.displayReal ?? false,
  })
  return mapReportDataToContent(ReportDataSchema.parse({ ...data, locale }))
}

const finding = (content: ReportContent, id: string) =>
  spaces(deriveKeyFindings(content).find((entry) => entry.id === id)?.text ?? '')

describe('pension coverage (finding 1): read from the ledger at the pension age', () => {
  it('states net pension over that year’s spending and the booked residual withdrawal', () => {
    const content = handContent()
    // (24,000 − 3,000) / 43,000 = 48.8 %; the portfolio pays 23,000.
    expect(content.ledger?.pensionYear).toMatchObject({
      age: 63,
      pensionNet: 21_000,
      expenses: 43_000,
      portfolioWithdrawal: 23_000,
    })
    expect(finding(content, 'pensionCoverage')).toBe(
      "At age 63, the first pension year, the pension after tax covers 49% of that year's spending (€21,000 of €43,000 in nominal euros); €23,000 is withdrawn from the portfolio, tax on gains included."
    )
    // Not the gross pension over today's budget: 24,000 / 40,000 = 60 %, residual 16,000.
    expect(finding(content, 'pensionCoverage')).not.toMatch(/60%|€16,000/)
  })

  it('prints the same year in today’s euros when the report is real', () => {
    // 21,000 / 1.15 = 18,261; 43,000 / 1.15 = 37,391; 23,000 / 1.15 = 20,000.
    expect(finding(handContent({ displayReal: true }), 'pensionCoverage')).toBe(
      "At age 63, the first pension year, the pension after tax covers 49% of that year's spending (€18,261 of €37,391 in today's euros); €20,000 is withdrawn from the portfolio, tax on gains included."
    )
  })

  it('is written in formal German for the German report', () => {
    expect(finding(handContent({ locale: 'de' }), 'pensionCoverage')).toBe(
      'Im Alter 63, dem ersten Rentenjahr, deckt die Rente nach Steuern 49 % der Ausgaben dieses Jahres (21.000 € von 43.000 € in nominalen Euro); 23.000 € kommen als Entnahme aus dem Depot, Steuern auf Kursgewinne eingerechnet.'
    )
  })

  it('makes no coverage claim without a ledger', () => {
    const content = handContent({ ledger: 'none' })
    expect(content.ledger).toBeUndefined()
    expect(finding(content, 'pensionCoverage')).toBe('')
  })
})

describe('withdrawal rate (finding 3): one definition on every surface', () => {
  it('prints 42,000 / 600,000 = 7.0 % in the ratios, the score and the recommendation', () => {
    const results = handResults()
    const data = transformToReportData(HAND_PARAMS, results, 'Hand plan', 'en')
    expect(data.projections.ratios?.firstYearWithdrawalRate).toBeCloseTo(0.07, 12)
    expect(data.summary?.planHealthWithdrawalRate).toBeCloseTo(0.07, 12)
    expect(
      data.recommendations.find((rec) => rec.id === 'reviewSpending')?.body
    ).toContain('7.0% of the portfolio is withdrawn')
    expect(data.ledger?.firstRetirementYear).toEqual({
      age: 60,
      openingAssets: 600_000,
      portfolioWithdrawal: 42_000,
      expenses: 40_000,
    })
  })

  it('is the same in a real report', () => {
    const data = transformToReportData(HAND_PARAMS, handResults(), 'Hand plan', 'en', {
      displayReal: true,
    })
    expect(data.projections.ratios?.firstYearWithdrawalRate).toBeCloseTo(0.07, 12)
    // The first retirement year's amounts, though, are today's euros.
    expect(data.ledger?.firstRetirementYear?.portfolioWithdrawal).toBeCloseTo(40_000, 6)
  })
})

describe('plan score (finding 4)', () => {
  it('is built from the success rate and the ledger’s withdrawal rate', () => {
    const { success } = handContent({ successRate: 92 }).profile
    // 0.7 × 92 + 0.3 × 25 = 71.9
    expect(success.score).toBe(72)
    expect(success.components).toEqual([
      { id: 'success', value: 92, weight: 0.7 },
      { id: 'withdrawal', value: expect.closeTo(25, 9), weight: 0.3 },
    ])
    expect(success.label).toBe('Strong')
  })

  it('generates its reasons from the component values', () => {
    expect(handContent({ successRate: 92 }).profile.success.reasons).toEqual([
      'Success rate 92.0%: graded "Strong" (90% or more)',
      'First-year withdrawal rate 7.0%: 3.0 percentage points above 4%, sub-score 25 of 100',
    ])
    expect(
      handContent({ successRate: 78.4, locale: 'de' }).profile.success.reasons.map(spaces)
    ).toEqual([
      'Erfolgsquote 78,4 %: Einstufung „Beobachten“ (75 % bis unter 90 %)',
      'Entnahmerate im ersten Ruhestandsjahr 7,0 %: 3,0 Prozentpunkte über 4 %, Teilwert 25 von 100',
    ])
    // No "solid savings rate", whatever the plan.
    for (const successRate of [40, 78.4, 92]) {
      const reasons = handContent({ successRate }).profile.success.reasons.join(' ')
      expect(reasons).not.toMatch(/savings rate|balanced assumptions|bridge drawdown/i)
    }
  })

  it('grades the plan exactly as getPlanHealth does — 78.4 % is "watch", not "strong"', () => {
    const content = handContent({ successRate: 78.4 })
    expect(getPlanHealth(78.4)).toBe('watch')
    expect(content.profile.success.label).toBe('Watch')
    expect(planBandOfRate(content.profile.success.successRate)).toBe('watch')
    // 0.7 × 78.4 + 0.3 × 25 = 62.38 — the old score read 87 "Strong" here.
    expect(content.profile.success.score).toBe(62)

    const labels = { strong: 'Strong', watch: 'Watch', strained: 'Strained' }
    for (const successRate of [0, 55, 74.99, 75, 89.99, 90, 100]) {
      const graded = handContent({ successRate }).profile.success
      expect(graded.label).toBe(labels[getPlanHealth(successRate)])
      expect(planBandOfRate(graded.successRate)).toBe(getPlanHealth(successRate))
    }
  })

  it('equals the success rate, and says so, when no withdrawal rate can be read', () => {
    const { success } = handContent({ successRate: 81.4, ledger: 'none' }).profile
    expect(success.score).toBe(81)
    expect(success.components).toEqual([{ id: 'success', value: 81.4, weight: 1 }])
    expect(success.reasons[1]).toContain('Withdrawal rate not scored')
  })
})

describe('bridge (finding 5): one window, the ledger’s withdrawals', () => {
  it('quotes the sum of the withdrawals for ages 60–62 and their share of the opening portfolio', () => {
    const content = handContent()
    expect(content.profile.bridge).toEqual({
      startAge: 60,
      endAge: 62,
      pensionAge: 63,
      mainPension: 'statutory',
      cashNeedEUR: 129_300,
      cashBucketYears: 2,
      cashBucketSharePct: 66,
      portfolioSharePct: 34,
    })
    // Share on today's euros: 120,000 / (600,000 / 1.05) = 21 %.
    expect(content.projections.ratios?.bridgeShareOfRetirementAssets).toBeCloseTo(0.21, 10)
    expect(finding(content, 'bridge')).toBe(
      'Until the statutory pension starts at 63, the portfolio carries 3 retirement years (ages 60–62): €129,300 in nominal euros is withdrawn in that time — 21% of the portfolio at the start of retirement.'
    )
  })

  it('keeps the unit handling: 3 × 40,000 in today’s euros, same share', () => {
    const content = handContent({ displayReal: true })
    expect(content.profile.bridge?.cashNeedEUR).toBe(120_000)
    expect(content.projections.ratios?.bridgeShareOfRetirementAssets).toBeCloseTo(0.21, 10)
    expect(finding(content, 'bridge')).toContain("€120,000 in today's euros is withdrawn in that time")
  })

  it('counts years and amount over the same window when a small pension starts earlier', () => {
    const early = {
      id: 'bav',
      kind: 'pension' as const,
      name: 'bAV',
      amount: 200,
      frequency: 'monthly' as const,
      startAge: 60,
    }
    const params = { ...HAND_PARAMS, cashFlows: [...HAND_PARAMS.cashFlows, early] }
    const content = handContent({ params })
    // The report used to say "7 years … €0 has to come from the portfolio".
    expect(finding(content, 'bridge')).toContain('3 retirement years (ages 60–62)')
    expect(finding(content, 'bridge')).toContain('€129,300 in nominal euros')
  })

  it('has no bridge when no pension counts', () => {
    const params = {
      ...HAND_PARAMS,
      cashFlows: HAND_PARAMS.cashFlows.filter((flow) => flow.kind !== 'pension'),
    }
    const content = handContent({ params })
    expect(content.profile.bridge).toBeUndefined()
    expect(finding(content, 'bridge')).toBe('')
  })
})

describe('retirement spending (finding 6): the ledger’s retirement years, not budget × all years', () => {
  it('sums 40 + 41 + 42 + 43 + 44 + 45 thousand for ages 60–65', () => {
    const { expenses } = handContent()
    expect(expenses.retirement).toEqual({
      total: 255_000,
      scheduled: 0,
      shortfall: 0,
      firstAge: 60,
      lastAge: 65,
      years: 6,
    })
    // "Budget × every simulated year" would be 40,000 × 8.
    expect(expenses.retirement?.total).not.toBe(320_000)
  })

  it('follows the report unit', () => {
    const expected = [40_000, 41_000, 42_000, 43_000, 44_000, 45_000].reduce(
      (sum, amount, i) => sum + amount / HAND_PRICE_LEVELS[i + 2],
      0
    )
    expect(handContent({ displayReal: true }).expenses.retirement?.total).toBeCloseTo(expected, 6)
  })

  it('counts scheduled expenses the engine booked in retirement, once each', () => {
    // Real engine, fixed real spending, today's euros: every scheduled euro is
    // booked at today's value. 3,000 a month for ages 80–90 = 11 years.
    const build = (cashFlows: SimulationParams['cashFlows']) => {
      const params: SimulationParams = {
        ...DEFAULT_PARAMS,
        simulationRuns: 120,
        withdrawalStrategy: 'fixedReal',
        cashFlows,
      }
      const data = transformToReportData(params, runMonteCarloSimulation(params), 'x', 'en', {
        displayReal: true,
      })
      return mapReportDataToContent({ ...data, locale: 'en' }).expenses.retirement!
    }
    const base = build(DEFAULT_PARAMS.cashFlows)
    const care = build([
      ...DEFAULT_PARAMS.cashFlows,
      {
        id: 'care',
        kind: 'expense',
        name: 'Care costs',
        amount: 3000,
        frequency: 'monthly',
        startAge: 80,
        endAge: 90,
      },
    ])
    const roof = build([
      ...DEFAULT_PARAMS.cashFlows,
      { id: 'roof', kind: 'expense', name: 'Roof', amount: 40_000, frequency: 'once', startAge: 70 },
    ])
    const rent = build([
      ...DEFAULT_PARAMS.cashFlows,
      { id: 'rent', kind: 'income', name: 'Rent', amount: 900, frequency: 'monthly' },
    ])

    expect(base.scheduled).toBeCloseTo(0, 6)
    expect(care.scheduled).toBeCloseTo(3000 * 12 * 11, 0)
    expect(care.total).toBeCloseTo(base.total + 3000 * 12 * 11, 0)
    expect(roof.scheduled).toBeCloseTo(40_000, 0)
    // Income is not spending.
    expect(rent.scheduled).toBeCloseTo(0, 6)
    expect(rent.total).toBeCloseTo(base.total, 0)
  })
})

describe('today (finding 7): the capital entered, not the end of the first year', () => {
  it('starts the median path at the entered assets in both units', () => {
    // Entered: 500,000. End of plan year 1 (the first simulated value): 550,000.
    const nominal = handContent()
    expect(nominal.projections.milestones[0].p50).toBe(550_000)
    expect(nominal.finances.currentAssets).toBe(500_000)
    // 578,400 / 500,000 − 1 = +15.7 %
    expect(finding(nominal, 'medianPath')).toBe(
      'The median path moves from €500,000 today to €578,400 in nominal euros at the end of age 65, at a 7.0% expected return (+16% nominal).'
    )
    // A year-end balance is priced at the level its year closes with: the
    // last year opens at 1.26 and closes a year of 2.5 % inflation later, at
    // 1.2915. 578,400 / 1.2915 = 447,851 → 447,851 / 500,000 − 1 = −10.4 %.
    // (Dividing by the opening level, 1.26, would print 459,048 — a year of
    // inflation too much.)
    expect(finding(handContent({ displayReal: true }), 'medianPath')).toBe(
      "The median path moves from €500,000 today to €447,851 in today's euros at the end of age 65, at a 7.0% expected return (−10% real)."
    )
    expect(finding(nominal, 'medianPath')).not.toContain('550,000')
  })
})

describe('units (finding 8): every amount says which euro it is in', () => {
  it('qualifies derived amounts in both modes and inputs as today’s euros', () => {
    const nominal = buildEuroUnitCopy({ requested: 'nominal', applied: 'nominal' }, 'de')
    const real = buildEuroUnitCopy(
      { requested: 'real', applied: 'real', realMethod: 'perPath' },
      'de'
    )
    // A nominal amount used to carry no qualifier at all.
    expect(nominal.amountQualifier).toBe(' in nominalen Euro')
    expect(real.amountQualifier).toBe(' in heutiger Kaufkraft')
    expect(nominal.inputQualifier).toBe(' in heutigen Beträgen')
    expect(real.inputQualifier).toBe(' in heutigen Beträgen')
    expect(buildEuroUnitCopy({ requested: 'nominal', applied: 'nominal' }, 'en')).toMatchObject({
      amountQualifier: ' in nominal euros',
      inputQualifier: " in today's euros",
      inputTag: "today's euros",
    })
  })

  it('labels every ledger amount in the findings, in either unit', () => {
    for (const [displayReal, qualifier] of [
      [false, 'in nominal euros'],
      [true, "in today's euros"],
    ] as const) {
      const content = handContent({ displayReal })
      for (const id of ['bridge', 'pensionCoverage', 'medianPath']) {
        expect(finding(content, id)).toContain(qualifier)
      }
    }
  })

  it('never puts a nominal bridge need and a today’s-euro figure into one sum', () => {
    // The report data carries the bridge need in exactly one unit, and the
    // unit-free share is computed on today's euros on both sides.
    const nominal = transformToReportData(HAND_PARAMS, handResults(), 'x', 'en')
    const real = transformToReportData(HAND_PARAMS, handResults(), 'x', 'en', { displayReal: true })
    expect(nominal.summary?.bridge?.cashNeedEUR).toBe(129_300)
    expect(real.summary?.bridge?.cashNeedEUR).toBe(120_000)
    expect(nominal.projections.ratios).toEqual(real.projections.ratios)
    // 129,300 nominal over a today's-euro portfolio would have read 22.6 %.
    expect(nominal.projections.ratios?.bridgeShareOfRetirementAssets).not.toBeCloseTo(
      129_300 / (600_000 / 1.05),
      6
    )
  })
})

/**
 * The engine counts a run as failed when a year's spending could not be paid
 * (a shortfall above 1 % of what was asked for) — not when its balance reaches
 * zero. The report's stress case has to be that same event.
 */
describe('the stress case: a year that cannot be paid, not an empty portfolio', () => {
  const contentOf = (results: SimulationResults) => {
    const data = transformToReportData(HAND_PARAMS, results, 'Hand plan', 'en')
    return mapReportDataToContent(ReportDataSchema.parse({ ...data, locale: 'en' }))
  }
  const ages = handResults().ages
  /** The hand bands with the P10 balance at zero from the end of age 64 on. */
  const bands = handResults().assetPercentiles
  const emptyFrom64 = { ...bands, p10: bands.p10.map((value, index) => (index >= 6 ? 0 : value)) }

  it('reads the age from the depletion data: where a tenth of the runs has failed', () => {
    // Ages 58…65. The share of runs with an unpaid year reaches 10 % at 63.
    const shares = [0, 0, 0, 0, 0.04, 0.1, 0.16, 0.2]
    expect(stressShortfallAge({ ages, depletionByAge: shares })).toBe(63)

    const content = contentOf({
      ...handResults({ successRate: 80 }),
      depletionByAge: shares,
    })
    expect(content.projections.exhaustionAge).toBe(63)
    // The P10 balance is 60 % of the median here — far from zero. The old
    // rule (`p10 <= 0`) saw no problem in a plan whose worst tenth fails.
    expect(content.projections.portfolioEmptyAge).toBeUndefined()
    expect(finding(content, 'depletion')).toBe(
      "In the stress case — the weakest tenth of runs — portfolio and income first fail to cover a year's spending by age 63, 2 years short of the planning horizon."
    )
  })

  it('does not call a plan failed whose P10 portfolio is empty while every year is paid', () => {
    const content = contentOf({
      ...handResults({ successRate: 100 }),
      assetPercentiles: emptyFrom64,
      depletionByAge: ages.map(() => 0),
    })
    expect(content.projections.exhaustionAge).toBeUndefined()
    expect(content.projections.portfolioEmptyAge).toBe(64)
    expect(finding(content, 'depletion')).toBe(
      "Not one of the runs has a shortfall before age 65: portfolio and income cover every year's spending. On the P10 path the portfolio is used up from age 64; pensions and income then carry the spending."
    )
  })

  it('says how many runs do fail when the stress case itself stays funded', () => {
    // 4 % of the runs have an unpaid year by the horizon — fewer than a tenth.
    const shares = [0, 0, 0, 0, 0, 0.01, 0.02, 0.04]
    expect(stressShortfallAge({ ages, depletionByAge: shares })).toBeNull()
    const content = contentOf({ ...handResults({ successRate: 96 }), depletionByAge: shares })
    expect(content.projections.exhaustionAge).toBeUndefined()
    expect(finding(content, 'depletion')).toBe(
      "The stress case stays funded: only in 4.0% of runs do portfolio and income fail to cover at least one year's spending before age 65."
    )
  })

  it('falls back to the balance only without depletion data, and only when a tenth failed', () => {
    const legacy = (successRate: number): SimulationResults => {
      const { depletionByAge: _shares, ...rest } = handResults({ successRate })
      return { ...rest, assetPercentiles: emptyFrom64 }
    }
    expect(stressShortfallAge(legacy(92))).toBeUndefined()
    // 8 % of the runs failed: the stress case did not, whatever the balance says.
    expect(contentOf(legacy(92)).projections.exhaustionAge).toBeUndefined()
    // 15 % failed: then the empty balance marks where.
    expect(contentOf(legacy(85)).projections.exhaustionAge).toBe(64)
  })

  it('refuses depletion data that does not line up with the ages', () => {
    expect(stressShortfallAge({ ages: [58, 59, 60], depletionByAge: [0, 0.5] })).toBeUndefined()
  })
})

/**
 * The same statements against the real engine — the report must agree with
 * what the engine counts, not with an assumption about it.
 */
describe('the stress case, run through the engine', () => {
  const contentFor = (params: SimulationParams) => {
    const results = runMonteCarloSimulation(params)
    const data = transformToReportData(params, results, 'Engine plan', 'en')
    return { results, content: mapReportDataToContent(ReportDataSchema.parse({ ...data, locale: 'en' })) }
  }

  it('a pension that pays the budget keeps a plan with no portfolio funded', () => {
    // Already retired, nothing saved, no inflation: 2,000 € a month of untaxed
    // pension against a budget of 24,100 € a year. The 100 € gap is 0.4 % of
    // the year's spending — inside the engine's 1 % tolerance — so every year
    // counts as paid although the balance is zero throughout.
    const params: SimulationParams = applyCashFlows({
      ...DEFAULT_PARAMS,
      currentAge: 67,
      retirementAge: 67,
      legalRetirementAge: 67,
      endAge: 75,
      currentAssets: 0,
      annualSavings: 0,
      averageInflation: 0,
      inflationVolatility: 0,
      withdrawalStrategy: 'fixedReal',
      pensionTaxablePortion: 0,
      pensionTaxRate: 0,
      simulationRuns: 40,
      monthlyPension: 2000,
      customExpenses: [{ id: 'living', name: 'Living costs', amount: 24_100, interval: 'annual' }],
      cashFlows: [
        {
          id: 'pension-statutory',
          kind: 'pension',
          name: 'Statutory pension',
          amount: 2000,
          frequency: 'monthly',
          inflationLinked: false,
        },
        { id: 'living', kind: 'expense', name: 'Living costs', amount: 24_100, frequency: 'annual' },
      ],
    })
    const { results, content } = contentFor(params)

    // What the engine says: nothing in the portfolio, and no failed run.
    expect(Math.max(...results.assetPercentiles.p10)).toBeLessThanOrEqual(0)
    expect(results.successRate).toBe(100)
    expect(results.depletionByAge?.every((share) => share === 0)).toBe(true)

    // What the report says: the portfolio is empty, the plan is not failing.
    expect(content.projections.exhaustionAge).toBeUndefined()
    expect(content.projections.portfolioEmptyAge).toBe(67)
    expect(content.simulation.depletionRisk).toBe(0)
    const text = finding(content, 'depletion')
    expect(text).toContain('Not one of the runs has a shortfall before age 75')
    expect(text).toContain('On the P10 path the portfolio is used up from age 67')
    expect(text).not.toMatch(/fail to cover/)
  })

  it('marks the age the engine’s depletion data gives for a plan that cannot pay', () => {
    // Retire at 56 on a fixed budget, eleven years before the pension.
    const params = applyCashFlows({
      ...DEFAULT_PARAMS,
      retirementAge: 56,
      annualSavings: 12_000,
      withdrawalStrategy: 'fixedReal',
      simulationRuns: 120,
    })
    const { results, content } = contentFor(params)
    const shares = results.depletionByAge!
    const index = shares.findIndex((share) => share >= 0.1)
    expect(index).toBeGreaterThan(-1)
    expect(content.projections.exhaustionAge).toBe(results.ages[index])
    // The year before, fewer than a tenth of the runs had gone short.
    if (index > 0) expect(shares[index - 1]).toBeLessThan(0.1)
    // The same runs the success rate counts as failed.
    expect(content.simulation.depletionRisk).toBeCloseTo(shares[shares.length - 1], 10)
    expect(100 - results.successRate).toBeCloseTo(shares[shares.length - 1] * 100, 6)
    // And the ledger names what could not be paid, next to what was asked for.
    expect(content.expenses.retirement!.shortfall).toBeGreaterThan(0)
    expect(content.expenses.retirement!.shortfall).toBeLessThan(content.expenses.retirement!.total)
  })
})
