import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { DEFAULT_PARAMS, type SimulationParams } from '@/types'


/**
 * The withdrawal rate the master was frozen at. The shipped default moved from
 * 5% to 4% on 2026-11-10 — a change of one default, not of the engine — and
 * the master keeps the rate its arrays (and the history of exceptions above)
 * were produced with, so that every frozen number here still documents an
 * engine change and nothing else.
 */
const MASTER_WITHDRAWAL_RATE = 0.05

/**
 * Golden master for the simulation engine.
 *
 * These are the exact outputs of `runMonteCarloSimulation(DEFAULT_PARAMS)` under
 * the fixed scenario seed (see `DEFAULT_PATH_SEED`). They exist so that refactors
 * of the engine internals can be proven to be refactors: hoisting the per-run
 * schedule construction, switching to per-age distribution tables and extracting
 * the `MarketSampler` seam all left every digit untouched.
 *
 * Four deliberate exceptions are on the record.
 *
 * 1. Replacing the pairwise expense inflation (`expense *= factor` each year)
 *    with an explicit `inflationIndex` accumulator re-associated a
 *    floating-point product, which moved the series by at most 8.9e-16 relative
 *    (≈4 ULP) and left the success rate bit-identical.
 *
 * 2. **German tax realism (round 3, wave 3) regenerated these numbers.** The
 *    engine gained the Sparerpauschbetrag, the Teilfreistellung and pension
 *    income tax, and the shipped defaults switched them on (€1,000 allowance,
 *    30% partial exemption, 83% × 18% on the statutory pension). Those are
 *    model changes, not code shape, so the master had to move: the default
 *    scenario's success rate went from 98.4% to 95.2%, because a €5,000/month
 *    pension is worth ~15% less after income tax than the old model assumed
 *    and the allowance only claws a little of that back.
 *
 *    The old master lives on below as `NEUTRAL_TAX_*`: with the three shelters
 *    set to zero the engine lands on the same arrays as the untaxed model.
 *
 * 3. **Withdrawal rules and non-portfolio income (2026-11-09) regenerated both
 *    masters** — see docs/specs/2026-11-09-withdrawal-rules-with-income.md.
 *    The shipped default is `vanguardDynamic` with a €5,000 pension from 67.
 *    The rule used to aim the *whole* budget at 5% of the portfolio and bank
 *    whatever the pension paid beyond that; it now treats pension + 5% of the
 *    portfolio as affordable. Which fix moved what, and in which direction:
 *
 *    - Rule sees the pension (1a). Ages 55–66 have no pension, so the first
 *      twelve asset values are the old ones to the bit. From 67 the household
 *      spends more (median 6,150 → 6,538 €/month at 67, 9,785 → 10,428 at 90)
 *      and the portfolio stops piling up (median at 90: 1.99M → 0.75M nominal).
 *      The headline success rate falls from 95.2% to 82.0%: the 95% was the
 *      rule under-spending the pension, not the plan being safe.
 *    - Spending is what was paid (1b). The median at 66 dips by a euro
 *      (6,131.34 → 6,130.01): a few paths are out of money before the pension
 *      starts and now count with what they could pay, not with the budget.
 *    - Success is "every year funded" (1d). No path of this plan changes side:
 *      a depleted path here always has a real gap.
 *
 *    `NEUTRAL_TAX_*` moved for the same reason (98.4% → 82.4%). The two old
 *    properties of that suite still hold and are still asserted: zeroing the
 *    shelters changes nothing before retirement, and the taxed default is
 *    worse off than the untaxed one. What replaces "bit-for-bit the previous
 *    master" as the proof that nothing else changed is
 *    `engine-incomeRules.test.ts`: every rule without non-portfolio income,
 *    and `fixedReal` with a pension, still reproduce arrays captured before
 *    this change, to the bit.
 *
 * 4. **Units and defaults (2026-11-09), two separate moves on top of 3.** The
 *    numbers quoted in 3 are the state after 3 alone; these came after:
 *
 *    - Real series deflated at the closing price level. Only the two `*_REAL`
 *      arrays moved, every value down by its path's inflation of that year
 *      (first value 716,768 → 699,468 = ÷ 1.0247; last 312,686 → 301,457).
 *      The nominal arrays and the success rate did not change by a bit: an
 *      asset value is an end-of-year balance and used to be divided by the
 *      price level the year *started* with.
 *    - Shipped defaults: Abgeltungsteuer 26.25 → 26.375 (25% × 1.055) and
 *      Besteuerungsanteil 0.83 → 0.90 (the default plan's own 2038 cohort).
 *      Both cost the plan a little, as they must: the first sale at 60 leaves
 *      1,137,679 → 1,137,661; the net pension is 4,253 → 4,190 nominal, so
 *      median spending at 67 is 6,538 → 6,535 and the median at 90 is
 *      749,893 → 728,558. Success 82.0% → 81.0%. `NEUTRAL_TAX_*` zeroes the
 *      pension tax, so it only feels the tax rate (696,554 → 692,854 at 90,
 *      success unchanged at 82.4%).
 *
 * Anything larger than IEEE noise on the arrays below means the model changed,
 * not the code shape.
 */
const GOLDEN_SUCCESS_RATE = 81

/** The success rate before exception 3, kept to pin the direction of the move. */
const PRE_INCOME_RULES_SUCCESS_RATE = 95.19999999999999

/** After exception 3 and before exception 4, for the same purpose. */
const PRE_DEFAULTS_SUCCESS_RATE = 82
const PRE_CLOSING_LEVEL_FIRST_REAL_ASSET = 716768.0824648819

/** Every year funded — identical to the headline while no bequest goal is set. */
const GOLDEN_DEPLETION_SUCCESS_RATE = 81

const GOLDEN_ASSET_P50 = [
  716768.0824648819, 818737.6930871948, 920072.2086195959, 1028865.8117413269, 1135993.9795322642,
  1137661.4051795956, 1143504.2940429081, 1116831.5875930954, 1092806.9643631503, 1092357.817524585,
  1083159.7834740872, 1095750.7402813798, 1100245.8769108248, 1132012.2074179521,
  1167912.1351498612, 1165048.471162288, 1163432.2216331516, 1184010.2525935941, 1166456.626391402,
  1157569.5009488296, 1142299.299738308, 1130844.3460824348, 1077497.0543941727, 1080592.5626686844,
  1074179.4675180216, 1067815.0723548713, 1025696.7113860286, 1019541.7150046134, 982412.772636744,
  936460.6931403556, 929281.7801376183, 853034.9955264605, 855686.801863848, 781552.7954705227,
  745239.1276905681, 728558.4967093476,
]

const GOLDEN_SPENDING_P50 = [
  0, 0, 0, 0, 0, 5936.6132317049, 5982.785466675953, 6020.463142205898, 6038.876349551629,
  6061.063021416857, 6085.857957469536, 6130.013495157862, 6534.851768298283, 7013.650288552903,
  7519.878273612318, 8030.516567328519, 8478.51442793745, 8899.224615750418, 9302.738635826681,
  9524.502163090108, 9607.003289576243, 9787.86906494097, 9865.06201270386, 9897.630730506862,
  9998.242744763722, 10014.903390348823, 10115.339074330932, 10289.797302732804, 10369.595287233124,
  10370.954019638479, 10447.213650248195, 10475.925399871976, 10401.374893091352,
  10437.169778458752, 10378.827426022279, 10361.510075983657,
]

const GOLDEN_ASSET_P50_REAL = [
  699468.3919606075, 780917.596544655, 854412.5108916954, 928561.9666068478, 1003832.2497581345,
  980751.1468310445, 957167.7786379954, 908737.3962512249, 877590.7672093344, 845332.3855890131,
  823425.346134747, 817169.836156819, 781130.3173967169, 796507.1094599576, 805929.2359123789,
  784549.0690898366, 752521.9246648725, 741131.6725185234, 730921.7521987872, 708017.9630700655,
  689378.7223450834, 655035.5388029821, 604860.298358513, 581136.5051818439, 571358.5155475105,
  559535.3925434481, 530704.7320462877, 514157.2447641416, 489450.8301008957, 451575.65351431794,
  434499.11055335304, 388482.1883128998, 375658.22897487425, 337864.47374968446, 320590.94352585124,
  297413.8564251394,
]

/**
 * The untaxed model (round 3, waves 1–2): every gain taxable, no allowance,
 * pension untaxed. Retained so the German tax rules can be shown to be
 * additive rather than a rewrite. Regenerated with exception 3 above (was
 * 98.4%): an untaxed pension is still a pension the rule now spends.
 */
const NEUTRAL_TAX_SUCCESS_RATE = 82.39999999999999

/** The parameter overrides that turn all three new shelters off. */
const NEUTRAL_TAX_PARAMS: SimulationParams = {
  ...DEFAULT_PARAMS,
  dsWithdrawalRate: MASTER_WITHDRAWAL_RATE,
  taxAllowanceAnnual: 0,
  equityFundExemption: 0,
  pensionTaxablePortion: 0,
  pensionTaxRate: 0,
}

const NEUTRAL_TAX_ASSET_P50 = [
  716768.0824648819, 818737.6930871948, 920072.2086195959, 1028865.8117413269, 1135993.9795322642,
  1135629.6990646168, 1139023.6811633282, 1110315.1029980679, 1084454.8076362372,
  1077779.3181055575, 1062563.427650597, 1072751.3749246867, 1085953.402467071, 1130411.8427868106,
  1167805.0899162996, 1173854.499791574, 1178314.2234488518, 1206267.2987728748, 1182431.5913651022,
  1179667.1859902893, 1156477.024351562, 1123993.6080493291, 1075591.3755405983, 1071796.0314562942,
  1069895.9292193064, 1055788.2384585824, 1012072.2456007428, 985562.7108473, 945780.6624947003,
  906518.9490369083, 899581.4619155796, 799715.9443280376, 769513.563771006, 721485.3559016865,
  694699.8155255918, 692854.4924559023,
]

const NEUTRAL_TAX_SPENDING_P50 = [
  0, 0, 0, 0, 0, 5936.6132317049, 5982.785466675953, 6020.463142205898, 6035.541625796759,
  6060.474337773732, 6080.258688546337, 6116.687907717935, 6571.8370070767705, 7039.488114687655,
  7554.324140196208, 8086.525849163456, 8674.314293386404, 9178.646887653973, 9666.870499891946,
  10034.613264730815, 10327.676623462183, 10435.56932879541, 10598.719150559054, 10619.256208266179,
  10689.476395615144, 10742.479477686778, 10797.78175094556, 11034.037137437823, 11080.55615531639,
  11090.26821284332, 11128.46254360815, 11127.881544077318, 11138.449415514542, 11110.916105452705,
  11020.66623097103, 11060.588781605613,
]

const NEUTRAL_TAX_ASSET_P50_REAL = [
  699468.3919606075, 780917.596544655, 854412.5108916954, 928561.9666068478, 1003832.2497581345,
  979025.3445600589, 953360.6722151295, 902419.8760218674, 870076.3801508732, 833368.7052337532,
  810532.4793843935, 798545.3436864179, 770121.6461855362, 794353.9820630006, 804585.2545030371,
  795621.6712899392, 765604.306432205, 750245.6602197267, 740525.2668910697, 714981.9457769457,
  692276.3383822828, 642818.6035881287, 607663.057934525, 576791.490167659, 572251.1317462889,
  546919.7460073234, 527224.2256038523, 496087.02920863096, 473378.9590341552, 440289.82248432015,
  416802.2563811288, 370768.28809694794, 342277.57130979636, 311656.6201067419, 296435.39565916196,
  280413.9295216913,
]

/**
 * The exact inputs the numbers above were produced from. Kept as a literal so a
 * change to `DEFAULT_PARAMS` fails loudly on the assertion right underneath —
 * with a message that says to regenerate — instead of silently invalidating
 * every golden value.
 */
const GOLDEN_PARAMS: SimulationParams = {
  currentAge: 55,
  retirementAge: 60,
  legalRetirementAge: 67,
  endAge: 90,
  currentAssets: 630000,
  annualSavings: 48000,
  annualSavingsGrowthRate: 0.02,
  monthlyPension: 5000,
  oneTimeIncomes: [],
  averageROI: 0.07,
  roiVolatility: 0.15,
  averageInflation: 0.025,
  inflationVolatility: 0.01,
  capitalGainsTax: 26.375,
  taxAllowanceAnnual: 1000,
  householdType: 'single',
  equityFundExemption: 0.3,
  pensionTaxablePortion: 0.9,
  pensionTaxRate: 0.18,
  legacyTargetReal: 0,
  marketModel: 'monteCarlo',
  glidePathEnabled: false,
  equityAllocationStart: 0.8,
  equityAllocationEnd: 0.4,
  bondReturn: 0.03,
  bondVolatility: 0.06,
  customExpenses: [
    {
      id: 'health',
      nameKey: 'health',
      name: 'Health Insurance',
      amount: 1300,
      interval: 'monthly',
    },
    { id: 'food', nameKey: 'food', name: 'Groceries', amount: 1200, interval: 'monthly' },
    {
      id: 'entertainment',
      nameKey: 'entertainment',
      name: 'Entertainment',
      amount: 300,
      interval: 'monthly',
    },
    { id: 'shopping', nameKey: 'shopping', name: 'Shopping', amount: 500, interval: 'monthly' },
    { id: 'utilities', nameKey: 'utilities', name: 'Utilities', amount: 400, interval: 'monthly' },
    { id: 'vacations', nameKey: 'vacations', name: 'Vacations', amount: 12000, interval: 'annual' },
    { id: 'repairs', nameKey: 'repairs', name: 'Home Repairs', amount: 5000, interval: 'annual' },
    {
      id: 'carMaintenance',
      nameKey: 'carMaintenance',
      name: 'Car Maintenance',
      amount: 1500,
      interval: 'annual',
    },
  ],
  cashFlows: [
    {
      id: 'pension-statutory',
      kind: 'pension',
      nameKey: 'statutoryPension',
      name: 'Statutory pension',
      amount: 5000,
      frequency: 'monthly',
      inflationLinked: false,
    },
    {
      id: 'health',
      kind: 'expense',
      nameKey: 'health',
      name: 'Health Insurance',
      amount: 1300,
      frequency: 'monthly',
    },
    {
      id: 'food',
      kind: 'expense',
      nameKey: 'food',
      name: 'Groceries',
      amount: 1200,
      frequency: 'monthly',
    },
    {
      id: 'entertainment',
      kind: 'expense',
      nameKey: 'entertainment',
      name: 'Entertainment',
      amount: 300,
      frequency: 'monthly',
    },
    {
      id: 'shopping',
      kind: 'expense',
      nameKey: 'shopping',
      name: 'Shopping',
      amount: 500,
      frequency: 'monthly',
    },
    {
      id: 'utilities',
      kind: 'expense',
      nameKey: 'utilities',
      name: 'Utilities',
      amount: 400,
      frequency: 'monthly',
    },
    {
      id: 'vacations',
      kind: 'expense',
      nameKey: 'vacations',
      name: 'Vacations',
      amount: 12000,
      frequency: 'annual',
    },
    {
      id: 'repairs',
      kind: 'expense',
      nameKey: 'repairs',
      name: 'Home Repairs',
      amount: 5000,
      frequency: 'annual',
    },
    {
      id: 'carMaintenance',
      kind: 'expense',
      nameKey: 'carMaintenance',
      name: 'Car Maintenance',
      amount: 1500,
      frequency: 'annual',
    },
  ],
  withdrawalStrategy: 'vanguardDynamic',
  dsWithdrawalRate: 0.05,
  dsCeilingRate: 0.05,
  dsFloorRate: -0.025,
  // Round 4: the strategy library gained `percentOfPortfolio`'s real spending
  // floor. It ships at 0 (off) and no other strategy reads it, which is why
  // every number above survived the change untouched.
  spendingFloorReal: 0,
  simulationRuns: 500,
}

describe('engine golden master (DEFAULT_PARAMS)', () => {
  const results = runMonteCarloSimulation(GOLDEN_PARAMS)

  it('still describes the shipped defaults', () => {
    // If this is the only failure in the file, DEFAULT_PARAMS changed on
    // purpose: copy the new defaults into GOLDEN_PARAMS and regenerate the
    // arrays above from `runMonteCarloSimulation(DEFAULT_PARAMS)`.
    //
    // One field is exempt, see MASTER_WITHDRAWAL_RATE.
    expect({ ...DEFAULT_PARAMS, dsWithdrawalRate: MASTER_WITHDRAWAL_RATE }).toEqual(GOLDEN_PARAMS)
    expect(DEFAULT_PARAMS.dsWithdrawalRate).toBe(0.04)
  })

  it('freezes the headline success rate', () => {
    expect(results.successRate).toBe(GOLDEN_SUCCESS_RATE)
  })

  it('moved the way exception 3 says it did', () => {
    // The pension is spent instead of banked: fewer paths survive, the median
    // household spends more from the pension age on and leaves less behind.
    expect(GOLDEN_SUCCESS_RATE).toBeLessThan(PRE_INCOME_RULES_SUCCESS_RATE)
    const pensionIndex = GOLDEN_PARAMS.legalRetirementAge - GOLDEN_PARAMS.currentAge
    // Median spending at 67 and median assets at 90 before the change.
    expect(GOLDEN_SPENDING_P50[pensionIndex]).toBeGreaterThan(6150.457231040132)
    expect(GOLDEN_ASSET_P50[GOLDEN_ASSET_P50.length - 1]).toBeLessThan(1989643.8032696173)
  })

  it('moved the way exception 4 says it did', () => {
    // More tax on sales and on the pension: a little worse, never better.
    expect(GOLDEN_SUCCESS_RATE).toBeLessThan(PRE_DEFAULTS_SUCCESS_RATE)
    expect(PRE_DEFAULTS_SUCCESS_RATE - GOLDEN_SUCCESS_RATE).toBeLessThan(2)
    // The first real value is the first year's closing balance, worth one
    // year's inflation less than the nominal figure it used to equal.
    expect(GOLDEN_ASSET_P50[0]).toBe(PRE_CLOSING_LEVEL_FIRST_REAL_ASSET)
    expect(GOLDEN_ASSET_P50_REAL[0]).toBeLessThan(GOLDEN_ASSET_P50[0])
    expect(GOLDEN_ASSET_P50[0] / GOLDEN_ASSET_P50_REAL[0]).toBeCloseTo(1.025, 2)
    // Every real value is an end-of-year balance in end-of-year money.
    GOLDEN_ASSET_P50_REAL.forEach((value, index) => {
      expect(value).toBeLessThan(GOLDEN_ASSET_P50[index])
    })
  })

  it('freezes the depletion-only success rate', () => {
    expect(results.depletionSuccessRate).toBe(GOLDEN_DEPLETION_SUCCESS_RATE)
  })

  it('freezes the median asset series bit-for-bit', () => {
    expect(results.assetPercentiles.p50).toEqual(GOLDEN_ASSET_P50)
  })

  it('freezes the median spending series bit-for-bit', () => {
    expect(results.spendingPercentiles.p50).toEqual(GOLDEN_SPENDING_P50)
  })

  it("freezes the real (today's euros) median asset series bit-for-bit", () => {
    expect(results.assetPercentilesReal?.p50).toEqual(GOLDEN_ASSET_P50_REAL)
  })

  it('is reproducible across calls and across structurally equal inputs', () => {
    const again = runMonteCarloSimulation(JSON.parse(JSON.stringify(GOLDEN_PARAMS)))
    expect(again.successRate).toBe(results.successRate)
    expect(again.assetPercentiles).toEqual(results.assetPercentiles)
    expect(again.spendingPercentiles).toEqual(results.spendingPercentiles)
    expect(again.assetPercentilesReal).toEqual(results.assetPercentilesReal)
  })
})

/**
 * The untaxed model, frozen: with every German shelter zeroed the engine has to
 * land on these arrays to the last bit. If this suite fails and the one above
 * does not, tax code changed the untaxed model too — which is never the intent.
 */
describe('tax neutrality: the untaxed master', () => {
  const results = runMonteCarloSimulation(NEUTRAL_TAX_PARAMS)

  it('freezes the untaxed headline success rate', () => {
    expect(results.successRate).toBe(NEUTRAL_TAX_SUCCESS_RATE)
  })

  it('freezes the untaxed median asset series bit-for-bit', () => {
    expect(results.assetPercentiles.p50).toEqual(NEUTRAL_TAX_ASSET_P50)
  })

  it('freezes the untaxed median spending series bit-for-bit', () => {
    expect(results.spendingPercentiles.p50).toEqual(NEUTRAL_TAX_SPENDING_P50)
  })

  it("freezes the untaxed real (today's euros) median asset series bit-for-bit", () => {
    expect(results.assetPercentilesReal?.p50).toEqual(NEUTRAL_TAX_ASSET_P50_REAL)
  })

  it('differs from the taxed default only once money is taken out', () => {
    // Nothing is sold and no pension is paid while the plan is still saving,
    // so the shelters cannot matter there.
    const working = GOLDEN_PARAMS.retirementAge - GOLDEN_PARAMS.currentAge
    expect(NEUTRAL_TAX_ASSET_P50.slice(0, working)).toEqual(GOLDEN_ASSET_P50.slice(0, working))
    expect(NEUTRAL_TAX_ASSET_P50[working]).not.toBe(GOLDEN_ASSET_P50[working])
  })

  it('is strictly worse off once the shelters are switched on', () => {
    // Sanity on the direction of the change: the shipped defaults tax the
    // pension, which no allowance can fully offset.
    expect(GOLDEN_SUCCESS_RATE).toBeLessThan(NEUTRAL_TAX_SUCCESS_RATE)
  })
})
