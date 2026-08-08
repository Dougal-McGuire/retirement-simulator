import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { DEFAULT_PARAMS, type SimulationParams } from '@/types'

/**
 * Golden master for the simulation engine.
 *
 * These are the exact outputs of `runMonteCarloSimulation(DEFAULT_PARAMS)` under
 * the fixed scenario seed (see `DEFAULT_PATH_SEED`). They exist so that refactors
 * of the engine internals can be proven to be refactors: hoisting the per-run
 * schedule construction, switching to per-age distribution tables and extracting
 * the `MarketSampler` seam all left every digit below untouched.
 *
 * One deliberate exception is recorded here: replacing the pairwise expense
 * inflation (`expense *= factor` each year) with an explicit `inflationIndex`
 * accumulator re-associates a floating-point product, which moved the series by
 * at most 8.9e-16 relative (≈4 ULP) and left the success rate bit-identical.
 * Anything larger than IEEE noise means the model changed, not the code shape.
 */
const GOLDEN_SUCCESS_RATE = 98.4

const GOLDEN_ASSET_P50 = [
  716768.0824648819,
  818737.6930871948,
  920072.2086195959,
  1028865.8117413269,
  1135993.9795322642,
  1135658.044401965,
  1139092.7274209508,
  1110405.4007620523,
  1084553.573352633,
  1077991.5500493266,
  1062876.9515199568,
  1073095.0801767842,
  1092922.4567722324,
  1152618.4145005308,
  1211007.4885365926,
  1236222.3977184263,
  1292189.762808388,
  1358329.5114643327,
  1398742.4414391727,
  1445954.4187410423,
  1511599.4966939506,
  1547762.1736060516,
  1538097.8443663428,
  1593088.0914316515,
  1693574.6100072279,
  1699369.743672867,
  1783290.9368618955,
  1843060.0049768696,
  1933593.6085277977,
  1963938.855340557,
  2016473.6036516882,
  2019214.025774107,
  2097100.765872324,
  2164125.6111311708,
  2169097.6168036,
  2289204.4390095957,
]

const GOLDEN_SPENDING_P50 = [
  0,
  0,
  0,
  0,
  0,
  5936.6132317049,
  5982.785466675953,
  6020.463142205898,
  6035.541625796759,
  6060.474337773732,
  6080.258688546337,
  6119.025454800576,
  6135.550918755403,
  6187.17163113853,
  6237.03483976073,
  6286.332576651171,
  6351.749975648486,
  6502.017835093635,
  6569.109580707434,
  6614.97823822184,
  6772.728577511777,
  6953.439158001334,
  7139.643006953865,
  7296.7156948641805,
  7411.182587866855,
  7657.377554215278,
  7802.698945015869,
  8071.921625653749,
  8322.261805630547,
  8702.7629959406,
  9073.484455841215,
  9214.03355968045,
  9363.423784462782,
  9753.670166861777,
  9988.524468569878,
  10358.452262732317,
]

const GOLDEN_ASSET_P50_REAL = [
  716768.0824648819,
  799377.0553905154,
  877025.7868880231,
  952308.4307907815,
  1025276.6720397244,
  1004908.5613481908,
  979676.3305175486,
  930214.375949379,
  894126.0178031197,
  854721.8306849324,
  829327.9316953707,
  818878.4552405439,
  799978.5490612274,
  823713.8336748119,
  856916.8138211846,
  868241.5249008476,
  859764.6676493324,
  887845.6618336554,
  903632.0027524617,
  911350.023950768,
  938525.0602845865,
  912405.9149504007,
  887015.3261179831,
  873613.236978079,
  939863.4854425879,
  948701.92019007,
  930122.8407997328,
  940231.9781684269,
  983606.3964632398,
  967657.6858739151,
  971975.8166187797,
  954056.3838781384,
  957314.6493805537,
  961203.7741468524,
  954275.9958661976,
  976367.3793028386,
]

/**
 * The exact inputs the numbers below were produced from. Kept as a literal so a
 * change to `DEFAULT_PARAMS` fails loudly on the assertion right underneath —
 * with a message that says to regenerate — instead of silently invalidating
 * every golden value further down.
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
  customExpenses: [
    { id: 'health', name: 'Health Insurance', amount: 1300, interval: 'monthly' },
    { id: 'food', name: 'Groceries', amount: 1200, interval: 'monthly' },
    { id: 'entertainment', name: 'Entertainment', amount: 300, interval: 'monthly' },
    { id: 'shopping', name: 'Shopping', amount: 500, interval: 'monthly' },
    { id: 'utilities', name: 'Utilities', amount: 400, interval: 'monthly' },
    { id: 'vacations', name: 'Vacations', amount: 12000, interval: 'annual' },
    { id: 'repairs', name: 'Home Repairs', amount: 5000, interval: 'annual' },
    { id: 'carMaintenance', name: 'Car Maintenance', amount: 1500, interval: 'annual' },
  ],
  withdrawalStrategy: 'vanguardDynamic',
  dsWithdrawalRate: 0.05,
  dsCeilingRate: 0.05,
  dsFloorRate: -0.025,
  simulationRuns: 500,
}

describe('engine golden master (DEFAULT_PARAMS)', () => {
  const results = runMonteCarloSimulation(GOLDEN_PARAMS)

  it('still describes the shipped defaults', () => {
    // If this is the only failure in the file, DEFAULT_PARAMS changed on
    // purpose: copy the new defaults into GOLDEN_PARAMS and regenerate the
    // arrays below from `runMonteCarloSimulation(DEFAULT_PARAMS)`.
    expect(DEFAULT_PARAMS).toEqual(GOLDEN_PARAMS)
  })

  it('freezes the headline success rate', () => {
    expect(results.successRate).toBe(GOLDEN_SUCCESS_RATE)
  })

  it('freezes the median asset series bit-for-bit', () => {
    expect(results.assetPercentiles.p50).toEqual(GOLDEN_ASSET_P50)
  })

  it('freezes the median spending series bit-for-bit', () => {
    expect(results.spendingPercentiles.p50).toEqual(GOLDEN_SPENDING_P50)
  })

  it('freezes the real (today\'s euros) median asset series bit-for-bit', () => {
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
