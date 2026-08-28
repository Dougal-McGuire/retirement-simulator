import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { DEFAULT_PARAMS, type SimulationParams } from '@/types'

/**
 * Golden master for the simulation engine.
 *
 * These are the exact outputs of `runMonteCarloSimulation(DEFAULT_PARAMS)` under
 * the fixed scenario seed (see `DEFAULT_PATH_SEED`). They exist so that refactors
 * of the engine internals can be proven to be refactors: hoisting the per-run
 * schedule construction, switching to per-age distribution tables and extracting
 * the `MarketSampler` seam all left every digit untouched.
 *
 * Two deliberate exceptions are on the record.
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
 *    The old master is NOT gone — it lives on below as `NEUTRAL_TAX_*`, and the
 *    neutrality suite at the bottom proves the new engine reproduces it
 *    *bit-for-bit* when the three new shelters are set to zero. That is the
 *    invariant that matters: the new maths is a strict superset of the old, and
 *    only the defaults moved.
 *
 * Anything larger than IEEE noise on the arrays below means the model changed,
 * not the code shape.
 */
const GOLDEN_SUCCESS_RATE = 95.19999999999999

/** Plain survival — identical to the headline while no bequest goal is set. */
const GOLDEN_DEPLETION_SUCCESS_RATE = 95.19999999999999

const GOLDEN_ASSET_P50 = [
  716768.0824648819, 818737.6930871948, 920072.2086195959, 1028865.8117413269, 1135993.9795322642,
  1137678.9656626824, 1143543.3440610718, 1116886.8435436154, 1092872.120073712, 1092489.3910282506,
  1083354.3684869208, 1095960.198653765, 1107468.2722729961, 1154976.0942231254, 1211423.7793128018,
  1231832.4435736684, 1267729.3450453938, 1328115.9062277158, 1361583.9317446477, 1389556.024890189,
  1458187.3305580444, 1484278.0187074933, 1457799.9169038082, 1490253.4800004796,
  1568398.8513580859, 1600410.1800498762, 1642446.511231116, 1690581.6288668425, 1768391.9275086888,
  1769255.612920539, 1845861.5483840602, 1836800.576934477, 1896287.6952252216, 1936757.3894884577,
  1971528.202716438, 1989643.8032696173,
]

const GOLDEN_SPENDING_P50 = [
  0, 0, 0, 0, 0, 5936.6132317049, 5982.785466675953, 6020.463142205898, 6039.048235648967,
  6061.1261598838955, 6085.857957469536, 6131.341925183422, 6150.457231040132, 6200.496731823969,
  6253.426416261831, 6288.517724133613, 6368.124015121256, 6476.788613167288, 6560.028834469563,
  6606.741962349988, 6729.0073042762815, 6791.64694887296, 6960.587941947974, 7144.914941382835,
  7216.027360158354, 7442.865602984046, 7577.6488449447825, 7833.758737976996, 7973.8261273671615,
  8406.226548424675, 8695.128790506089, 8854.348360747976, 8972.782173200038, 9116.08912574683,
  9418.8010262657, 9785.331079236243,
]

const GOLDEN_ASSET_P50_REAL = [
  716768.0824648819, 799377.0553905154, 877025.7868880231, 952308.4307907815, 1025276.6720397244,
  1006602.342264011, 983494.2387517195, 936879.2110007589, 903127.6084099528, 865902.2059298146,
  844635.8818542839, 835652.655562782, 809870.995305126, 827665.6936219339, 855141.399744655,
  856649.419548142, 842157.9777352369, 858396.3613900885, 881991.3559451613, 883584.6450643805,
  907254.5210966861, 871883.075646811, 842018.0501017163, 835692.7467572463, 880483.7100754424,
  892333.4838259197, 867922.5839777094, 875148.0717186423, 884815.8563182948, 889420.6515419288,
  893270.5909289559, 859753.1611422411, 855547.7505013046, 859438.7769416547, 860685.2501599399,
  856841.2728152322,
]

/**
 * The pre-tax-realism master (round 3, waves 1–2): every gain taxable, no
 * allowance, pension untaxed. Retained so the switch to German tax rules can be
 * shown to be additive rather than a rewrite.
 */
const NEUTRAL_TAX_SUCCESS_RATE = 98.4

/** The parameter overrides that turn all three new shelters off. */
const NEUTRAL_TAX_PARAMS: SimulationParams = {
  ...DEFAULT_PARAMS,
  taxAllowanceAnnual: 0,
  equityFundExemption: 0,
  pensionTaxablePortion: 0,
  pensionTaxRate: 0,
}

const NEUTRAL_TAX_ASSET_P50 = [
  716768.0824648819, 818737.6930871948, 920072.2086195959, 1028865.8117413269, 1135993.9795322642,
  1135658.044401965, 1139092.7274209508, 1110405.4007620523, 1084553.573352633, 1077991.5500493266,
  1062876.9515199568, 1073095.0801767842, 1092922.4567722324, 1152618.4145005308,
  1211007.4885365926, 1236222.3977184263, 1292189.762808388, 1358329.5114643327, 1398742.4414391727,
  1445954.4187410423, 1511599.4966939506, 1547762.1736060516, 1538097.8443663428,
  1593088.0914316515, 1693574.6100072279, 1699369.743672867, 1783290.9368618955, 1843060.0049768696,
  1933593.6085277977, 1963938.855340557, 2016473.6036516882, 2019214.025774107, 2097100.765872324,
  2164125.6111311708, 2169097.6168036, 2289204.4390095957,
]

const NEUTRAL_TAX_SPENDING_P50 = [
  0, 0, 0, 0, 0, 5936.6132317049, 5982.785466675953, 6020.463142205898, 6035.541625796759,
  6060.474337773732, 6080.258688546337, 6119.025454800576, 6135.550918755403, 6187.17163113853,
  6237.03483976073, 6286.332576651171, 6351.749975648486, 6502.017835093635, 6569.109580707434,
  6614.97823822184, 6772.728577511777, 6953.439158001334, 7139.643006953865, 7296.7156948641805,
  7411.182587866855, 7657.377554215278, 7802.698945015869, 8071.921625653749, 8322.261805630547,
  8702.7629959406, 9073.484455841215, 9214.03355968045, 9363.423784462782, 9753.670166861777,
  9988.524468569878, 10358.452262732317,
]

const NEUTRAL_TAX_ASSET_P50_REAL = [
  716768.0824648819, 799377.0553905154, 877025.7868880231, 952308.4307907815, 1025276.6720397244,
  1004908.5613481908, 979676.3305175486, 930214.375949379, 894126.0178031197, 854721.8306849324,
  829327.9316953707, 818878.4552405439, 799978.5490612274, 823713.8336748119, 856916.8138211846,
  868241.5249008476, 859764.6676493324, 887845.6618336554, 903632.0027524617, 911350.023950768,
  938525.0602845865, 912405.9149504007, 887015.3261179831, 873613.236978079, 939863.4854425879,
  948701.92019007, 930122.8407997328, 940231.9781684269, 983606.3964632398, 967657.6858739151,
  971975.8166187797, 954056.3838781384, 957314.6493805537, 961203.7741468524, 954275.9958661976,
  976367.3793028386,
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
  capitalGainsTax: 26.25,
  taxAllowanceAnnual: 1000,
  householdType: 'single',
  equityFundExemption: 0.3,
  pensionTaxablePortion: 0.83,
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
    expect(DEFAULT_PARAMS).toEqual(GOLDEN_PARAMS)
  })

  it('freezes the headline success rate', () => {
    expect(results.successRate).toBe(GOLDEN_SUCCESS_RATE)
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
 * The regeneration receipt: with every German shelter zeroed, the engine has to
 * land on the *previous* golden master to the last bit. If this suite fails, the
 * tax work changed the untaxed model too — which was never the intent.
 */
describe('tax neutrality against the pre-tax-realism master', () => {
  const results = runMonteCarloSimulation(NEUTRAL_TAX_PARAMS)

  it('reproduces the old headline success rate', () => {
    expect(results.successRate).toBe(NEUTRAL_TAX_SUCCESS_RATE)
  })

  it('reproduces the old median asset series bit-for-bit', () => {
    expect(results.assetPercentiles.p50).toEqual(NEUTRAL_TAX_ASSET_P50)
  })

  it('reproduces the old median spending series bit-for-bit', () => {
    expect(results.spendingPercentiles.p50).toEqual(NEUTRAL_TAX_SPENDING_P50)
  })

  it("reproduces the old real (today's euros) median asset series bit-for-bit", () => {
    expect(results.assetPercentilesReal?.p50).toEqual(NEUTRAL_TAX_ASSET_P50_REAL)
  })

  it('is strictly worse off once the shelters are switched on', () => {
    // Sanity on the direction of the change: the shipped defaults tax the
    // pension, which no allowance can fully offset.
    expect(GOLDEN_SUCCESS_RATE).toBeLessThan(NEUTRAL_TAX_SUCCESS_RATE)
  })
})
