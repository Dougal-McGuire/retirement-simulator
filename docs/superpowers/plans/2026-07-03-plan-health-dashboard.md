# Plan Health Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the `/[locale]/simulation` dashboard into a persistent Plan Health hero strip plus three tabs, unlocking the PDF-only analytics (health score, recommendations, bridge analysis) on-screen and adding depletion-age / shortfall-by-age insight.

**Architecture:** A new shared `src/lib/insights/` library is extracted from `src/lib/transformers/reportDataTransformer.ts` (PDF output must stay identical — existing transformer tests prove parity). The Monte Carlo engine gains one additive result field, `depletionByAge`. The dashboard page is rebuilt: `PlanHealthHero` replaces the three redundant tier cards (`SuccessRateCard`, `PlanDashboard` health badge, Action Summary), and Radix `Tabs` organize Overview / Cashflow & Details / Scenarios & Advice. `SimulationChart.tsx` is dissolved into `AssetsSection` + `SpendingSection` sharing hooks.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zustand, Recharts, Radix Tabs (`src/components/ui/tabs.tsx` already exists), next-intl (en/de), Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-03-plan-health-dashboard-design.md`

## Global Constraints

- Node >= 22, pnpm >= 10. Commands: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm test:e2e`.
- PDF output must be unchanged: `src/lib/transformers/__tests__/*` must pass without modifying their assertions.
- Every new user-facing string gets keys in BOTH `src/i18n/messages/en.json` and `de.json`. German uses formal "Sie" register (match existing copy).
- Currency is EUR, formatted via `useFormatter()` from next-intl (see existing components).
- Styling: follow the neo-brutalist utility conventions used by existing components (`border-3 border-neo-black`, `shadow-neo`, `bg-neo-white`, uppercase tracking labels). Match surrounding markup; do not introduce new design tokens.
- No new dependencies.
- `SimulationResults.depletionByAge` is OPTIONAL (`depletionByAge?: number[]`): the Zustand store persists `results` to localStorage (see `simulationStore.ts:472-476`), so users will rehydrate pre-upgrade results without the field. Every consumer must guard.
- Type checking: `npx tsc --noEmit` (there is no dedicated typecheck script).

---

### Task 1: Wire the extracted setupProgress helper into the setup page

The helper `parseSetupProgressStep` was already extracted to `src/app/[locale]/setup/setupProgress.ts` (with tests), but `src/app/[locale]/setup/page.tsx:23-53` still contains an inline duplicate.

**Files:**
- Modify: `src/app/[locale]/setup/page.tsx:23-53`
- Test (exists): `src/app/[locale]/setup/setupProgress.test.ts`

**Interfaces:**
- Consumes: `parseSetupProgressStep(savedProgress: string | null, stepCount: number): number | null` from `./setupProgress`
- Produces: nothing new — behavior-preserving refactor.

- [ ] **Step 1: Replace the inline duplicate with an import**

In `src/app/[locale]/setup/page.tsx`, delete this entire block (lines 23–53):

```ts
type SetupProgress = {
  currentStep?: unknown
}

function isSetupProgress(value: unknown): value is SetupProgress {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSetupProgressStep(savedProgress: string | null, stepCount: number) {
  if (!savedProgress) return null

  let parsed: unknown

  try {
    parsed = JSON.parse(savedProgress)
  } catch {
    return null
  }

  if (!isSetupProgress(parsed)) return null

  const { currentStep } = parsed

  if (typeof currentStep !== 'number' || !Number.isInteger(currentStep)) {
    return null
  }

  const maxStepIndex = Math.max(0, stepCount - 1)

  return Math.max(0, Math.min(currentStep, maxStepIndex))
}
```

and add to the imports (after the `cn` import at line 17):

```ts
import { parseSetupProgressStep } from './setupProgress'
```

- [ ] **Step 2: Verify**

Run: `pnpm test setupProgress && pnpm lint && npx tsc --noEmit`
Expected: tests pass, no lint/type errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/setup/page.tsx" "src/app/[locale]/setup/setupProgress.ts" "src/app/[locale]/setup/setupProgress.test.ts"
git commit -m "refactor: use extracted setupProgress helper in setup page"
```

---

### Task 2: Engine returns `depletionByAge`

**Files:**
- Modify: `src/types/index.ts:52-58` (SimulationResults)
- Modify: `src/lib/simulation/engine.ts` (`runSingleSimulation`, `runMonteCarloSimulation`)
- Create: `src/lib/simulation/__tests__/engine-depletion.test.ts`

**Interfaces:**
- Produces: `SimulationResults.depletionByAge?: number[]` — same length as `results.ages`; `depletionByAge[i]` is the fraction (0..1) of runs whose assets were exhausted at or before `ages[i]`. Monotonically non-decreasing; last element equals `1 - successRate/100`. The engine ALWAYS sets it; it is optional only because of stale persisted results.
- No changes needed in `simulation.worker.ts`, `workerClient.ts`, or the store — the full `SimulationResults` object already flows through them.

- [ ] **Step 1: Write the failing test**

Create `src/lib/simulation/__tests__/engine-depletion.test.ts`:

```ts
import { runMonteCarloSimulation } from '../engine'
import { DEFAULT_PARAMS, SimulationParams } from '@/types'

const baseParams: SimulationParams = { ...DEFAULT_PARAMS, simulationRuns: 200 }

describe('depletionByAge', () => {
  it('stays at zero when the plan is comfortably funded', () => {
    const results = runMonteCarloSimulation({
      ...baseParams,
      currentAssets: 50_000_000,
      roiVolatility: 0.05,
    })

    expect(results.depletionByAge).toHaveLength(results.ages.length)
    expect(results.depletionByAge!.every((value) => value === 0)).toBe(true)
    expect(results.successRate).toBe(100)
  })

  it('hits 1 in the first retirement year when there is no money at all', () => {
    const results = runMonteCarloSimulation({
      ...baseParams,
      currentAssets: 0,
      annualSavings: 0,
      annualSavingsGrowthRate: 0,
      monthlyPension: 0,
      oneTimeIncomes: [],
    })

    const retirementIndex = results.ages.findIndex((age) => age >= baseParams.retirementAge)
    expect(results.successRate).toBe(0)
    results.depletionByAge!.forEach((value, index) => {
      expect(value).toBe(index >= retirementIndex ? 1 : 0)
    })
  })

  it('is monotonically non-decreasing and consistent with the success rate', () => {
    const results = runMonteCarloSimulation({
      ...baseParams,
      currentAssets: 150_000,
      annualSavings: 0,
      monthlyPension: 1000,
      roiVolatility: 0.25,
    })

    const depletion = results.depletionByAge!
    for (let i = 1; i < depletion.length; i++) {
      expect(depletion[i]).toBeGreaterThanOrEqual(depletion[i - 1])
    }
    expect(depletion[depletion.length - 1]).toBeCloseTo(1 - results.successRate / 100, 10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test engine-depletion`
Expected: FAIL — `depletionByAge` is `undefined` (`toHaveLength` fails).

- [ ] **Step 3: Add the type field**

In `src/types/index.ts`, extend `SimulationResults`:

```ts
export interface SimulationResults {
  ages: number[]
  assetPercentiles: PercentileData
  spendingPercentiles: PercentileData
  successRate: number
  /**
   * Fraction of runs (0..1) whose assets were exhausted at or before each age.
   * Optional because results persisted before this field existed lack it.
   */
  depletionByAge?: number[]
  params: SimulationParams
}
```

- [ ] **Step 4: Implement in the engine**

In `src/lib/simulation/engine.ts`:

(a) `runSingleSimulation` — change the return type and track the first failed index. Update the signature block:

```ts
function runSingleSimulation(
  params: SimulationParams,
  distributions: SimulationDistributions
): {
  assetHistory: number[]
  spendingHistory: number[]
  failed: boolean
  depletionIndex: number | null
} {
```

Add next to `let runFailed = false` (around line 306):

```ts
  let depletionIndex: number | null = null
```

Immediately after `assetHistory.push(currentAssets)` (line 411), inside the loop:

```ts
    if (runFailed && depletionIndex === null) {
      depletionIndex = assetHistory.length - 1
    }
```

And extend the return:

```ts
  return {
    assetHistory,
    spendingHistory,
    failed: runFailed,
    depletionIndex,
  }
```

(b) `runMonteCarloSimulation` — aggregate. After the `ages` initialization loop, add:

```ts
  const depletionCounts = new Array<number>(ages.length).fill(0)
```

Inside the run loop, after `spendingRuns.push(result.spendingHistory)`:

```ts
    if (result.depletionIndex !== null && result.depletionIndex < depletionCounts.length) {
      depletionCounts[result.depletionIndex]++
    }
```

Before the return statement:

```ts
  let depletedSoFar = 0
  const depletionByAge = depletionCounts.map((count) => {
    depletedSoFar += count
    return depletedSoFar / normalizedParams.simulationRuns
  })
```

And include `depletionByAge` in the returned object (after `successRate`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test engine`
Expected: PASS — the new file and all existing engine tests (`engine.test.ts`, `engine-math.test.ts`, `engine-edges.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/simulation/engine.ts src/lib/simulation/__tests__/engine-depletion.test.ts
git commit -m "feat: engine reports depletion probability by age"
```

---

### Task 3: Shared insights library (extraction from the PDF transformer)

Move plan-health scoring, bridge analysis, and the recommendation engine out of `reportDataTransformer.ts` into `src/lib/insights/`, behavior-preserving. The existing transformer test suites are the parity proof — they must pass unchanged.

**Files:**
- Create: `src/lib/insights/bridge.ts`
- Create: `src/lib/insights/planHealth.ts`
- Create: `src/lib/insights/recommendations.ts`
- Create: `src/lib/insights/__tests__/insights.test.ts`
- Modify: `src/lib/transformers/reportDataTransformer.ts` (delete local copies, import from insights)
- Modify: `src/lib/pdf-generator/schema/reportData.ts:88-93` (optional `id` on RecommendationSchema)

**Interfaces:**
- Consumes: `defaultPdfConfig` from `@/lib/pdf-generator/utils/config`; `calculateCombinedExpenses` from `@/lib/simulation/engine`; type `Recommendation` from `@/lib/pdf-generator/schema/reportData`.
- Produces (used by Tasks 4, 7, 8):
  - `computeBridgeAnalysis(params: SimulationParams): BridgeAnalysis` where `BridgeAnalysis = { startAge: number; endAge: number; yearsInBridge: number; cashNeedEUR: number /* unrounded */; cashBucketYears: number; cashBucketSharePct: number; portfolioSharePct: number }`
  - `computePlanHealthScore(params: SimulationParams, results: SimulationResults): PlanHealthScore` where `PlanHealthScore = { score: number; label: 'Strong' | 'Moderate' | 'Needs Attention'; why: string; whyBits: string[] }` (exported type alias `PlanHealthLabel` for the label union)
  - `generateRecommendations(params, results): PlanRecommendation[]` where `RecommendationId = 'increaseSavings' | 'delayRetirement' | 'optimizeMix' | 'reviewSpending' | 'maximizeTaxDeferred' | 'reduceVolatility' | 'reviewInsurance'` and `PlanRecommendation = Recommendation & { id: RecommendationId }`
  - `estimateRecommendationUplift(recommendation: Recommendation, params, results): { title: string; upliftMin: number; upliftMax: number } | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/insights/__tests__/insights.test.ts`:

```ts
import { DEFAULT_PARAMS, SimulationParams, SimulationResults } from '@/types'
import { computeBridgeAnalysis } from '../bridge'
import { computePlanHealthScore } from '../planHealth'
import { estimateRecommendationUplift, generateRecommendations } from '../recommendations'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'

function makeResults(successRate: number, params: SimulationParams = DEFAULT_PARAMS): SimulationResults {
  const ages = []
  for (let age = params.currentAge; age <= params.endAge; age++) ages.push(age)
  const flat = (value: number) => ages.map(() => value)
  return {
    ages,
    assetPercentiles: { p10: flat(100_000), p20: flat(200_000), p50: flat(500_000), p80: flat(800_000), p90: flat(900_000) },
    spendingPercentiles: { p10: flat(3000), p20: flat(3500), p50: flat(4000), p80: flat(4500), p90: flat(5000) },
    successRate,
    depletionByAge: flat(0),
    params,
  }
}

describe('computeBridgeAnalysis', () => {
  it('computes the retirement-to-pension gap with inflation-adjusted need', () => {
    const bridge = computeBridgeAnalysis(DEFAULT_PARAMS)
    expect(bridge.startAge).toBe(60)
    expect(bridge.endAge).toBe(66)
    expect(bridge.yearsInBridge).toBe(7)
    expect(bridge.cashNeedEUR).toBeGreaterThan(0)
    expect(bridge.cashBucketSharePct + bridge.portfolioSharePct).toBe(100)
  })

  it('reports no bridge when retiring at pension age', () => {
    const bridge = computeBridgeAnalysis({ ...DEFAULT_PARAMS, retirementAge: 67 })
    expect(bridge.yearsInBridge).toBe(0)
    expect(bridge.cashNeedEUR).toBe(0)
  })
})

describe('computePlanHealthScore', () => {
  it('matches the transformer summary exactly (parity)', () => {
    const results = makeResults(82)
    const report = transformToReportData(DEFAULT_PARAMS, results)
    const health = computePlanHealthScore(DEFAULT_PARAMS, results)
    expect(health.score).toBe(report.summary.planHealthScore)
    expect(health.label).toBe(report.summary.planHealthLabel)
    expect(health.why).toBe(report.summary.planHealthWhy)
  })
})

describe('generateRecommendations', () => {
  it('tags every recommendation with a stable id', () => {
    const recs = generateRecommendations(DEFAULT_PARAMS, makeResults(60))
    expect(recs.length).toBeGreaterThan(0)
    recs.forEach((rec) => expect(typeof rec.id).toBe('string'))
    const ids = recs.map((rec) => rec.id)
    expect(ids).toContain('increaseSavings')
    expect(ids).toContain('delayRetirement')
    expect(ids).toContain('maximizeTaxDeferred')
    expect(ids).toContain('reviewInsurance')
  })

  it('suggests optimizing the mix in the 70-85 band', () => {
    const ids = generateRecommendations(DEFAULT_PARAMS, makeResults(80)).map((rec) => rec.id)
    expect(ids).toContain('optimizeMix')
    expect(ids).not.toContain('increaseSavings')
  })
})

describe('estimateRecommendationUplift', () => {
  it('estimates a bounded uplift range for uplift-eligible recommendations', () => {
    const results = makeResults(60)
    const recs = generateRecommendations(DEFAULT_PARAMS, results)
    const delay = recs.find((rec) => rec.id === 'delayRetirement')!
    const uplift = estimateRecommendationUplift(delay, DEFAULT_PARAMS, results)!
    expect(uplift.upliftMin).toBeGreaterThanOrEqual(1)
    expect(uplift.upliftMax).toBeLessThanOrEqual(20)
    expect(uplift.upliftMax).toBeGreaterThanOrEqual(uplift.upliftMin)
  })

  it('returns null for recommendations without an uplift model', () => {
    const results = makeResults(60)
    const insurance = generateRecommendations(DEFAULT_PARAMS, results).find(
      (rec) => rec.id === 'reviewInsurance'
    )!
    expect(estimateRecommendationUplift(insurance, DEFAULT_PARAMS, results)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test insights`
Expected: FAIL — modules `../bridge`, `../planHealth`, `../recommendations` do not exist.

- [ ] **Step 3: Create `src/lib/insights/bridge.ts`**

```ts
import type { SimulationParams } from '@/types'
import { defaultPdfConfig } from '@/lib/pdf-generator/utils/config'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'

export type BridgeAnalysis = {
  startAge: number
  endAge: number
  yearsInBridge: number
  /** Inflation-adjusted cash need across the bridge years, unrounded. */
  cashNeedEUR: number
  cashBucketYears: number
  cashBucketSharePct: number
  portfolioSharePct: number
}

export function computeBridgeAnalysis(params: SimulationParams): BridgeAnalysis {
  const totalYearlyExpenses = calculateCombinedExpenses(params.customExpenses).combinedAnnual
  const startAge = Math.max(params.retirementAge, params.currentAge)
  const endAge = Math.max(params.legalRetirementAge - 1, startAge - 1)
  const yearsInBridge = Math.max(0, endAge - startAge + 1)
  const inflation = params.averageInflation

  let cashNeedEUR = 0
  for (let i = 0; i < yearsInBridge; i++) {
    cashNeedEUR += Math.max(0, totalYearlyExpenses * Math.pow(1 + inflation, i))
  }

  const cashBucketYears = defaultPdfConfig.bridge_cash_bucket_years as number
  let cashBucketSharePct = 0
  if (yearsInBridge > 0 && cashNeedEUR > 0) {
    const years = Math.min(cashBucketYears, yearsInBridge)
    let bucketSum = 0
    for (let i = 0; i < years; i++) {
      bucketSum += totalYearlyExpenses * Math.pow(1 + inflation, i)
    }
    cashBucketSharePct = Math.round((bucketSum / cashNeedEUR) * 100)
  }
  const portfolioSharePct =
    yearsInBridge > 0 && cashNeedEUR > 0 ? Math.max(0, 100 - cashBucketSharePct) : 0

  return {
    startAge,
    endAge,
    yearsInBridge,
    cashNeedEUR,
    cashBucketYears,
    cashBucketSharePct,
    portfolioSharePct,
  }
}
```

- [ ] **Step 4: Create `src/lib/insights/planHealth.ts`**

Logic transplanted verbatim from `reportDataTransformer.ts:42-72` (note: the "why" bridge check uses the UNROUNDED cash need, exactly as before):

```ts
import type { SimulationParams, SimulationResults } from '@/types'
import { defaultPdfConfig } from '@/lib/pdf-generator/utils/config'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { computeBridgeAnalysis } from './bridge'

export type PlanHealthLabel = 'Strong' | 'Moderate' | 'Needs Attention'

export type PlanHealthScore = {
  score: number
  label: PlanHealthLabel
  why: string
  whyBits: string[]
}

export function computePlanHealthScore(
  params: SimulationParams,
  results: SimulationResults
): PlanHealthScore {
  const weights = defaultPdfConfig.score_weights
  const totalYearlyExpenses = calculateCombinedExpenses(params.customExpenses).combinedAnnual
  const netAnnualSpendIfRetiredNow = Math.max(0, totalYearlyExpenses - params.monthlyPension * 12)
  const withdrawalRateNow =
    params.currentAssets > 0 ? netAnnualSpendIfRetiredNow / params.currentAssets : 1
  const spendPenaltyPerPoint = 2500 // -25 points per +1pp above 4%
  const spendingScore = Math.max(
    0,
    Math.min(100, 100 - Math.max(0, withdrawalRateNow - 0.04) * spendPenaltyPerPoint)
  )
  const liquidityScore = 100 // placeholder until explicit liquidity coverage metric is added
  const score = Math.round(
    weights.success_pct * results.successRate +
      weights.spend_rate * spendingScore +
      weights.liquidity * liquidityScore
  )
  const label: PlanHealthLabel =
    score >= defaultPdfConfig.label_bands.strong[0]
      ? 'Strong'
      : score >= defaultPdfConfig.label_bands.moderate[0]
        ? 'Moderate'
        : 'Needs Attention'

  const bridge = computeBridgeAnalysis(params)
  const whyBits: string[] = []
  if (spendingScore >= 85) whyBits.push('solid savings rate')
  if (bridge.yearsInBridge <= 6 && bridge.cashNeedEUR <= params.currentAssets * 0.3)
    whyBits.push('moderate bridge drawdown')
  if (results.successRate >= 80) whyBits.push('high success probability')
  const finalBits = whyBits.length ? whyBits : ['balanced assumptions']

  return { score, label, why: finalBits.join(' + '), whyBits: finalBits }
}
```

- [ ] **Step 5: Create `src/lib/insights/recommendations.ts`**

Move `generateRecommendations` and `estimateRecommendationUplift` from `reportDataTransformer.ts:207-335` verbatim, exported, with stable `id`s added:

```ts
import type { SimulationParams, SimulationResults } from '@/types'
import type { Recommendation } from '@/lib/pdf-generator/schema/reportData'

export type RecommendationId =
  | 'increaseSavings'
  | 'delayRetirement'
  | 'optimizeMix'
  | 'reviewSpending'
  | 'maximizeTaxDeferred'
  | 'reduceVolatility'
  | 'reviewInsurance'

export type PlanRecommendation = Recommendation & { id: RecommendationId }

export type RecommendationUplift = { title: string; upliftMin: number; upliftMax: number }

export function generateRecommendations(
  params: SimulationParams,
  results: SimulationResults
): PlanRecommendation[] {
  const recommendations: PlanRecommendation[] = []

  // Success rate-based recommendations
  if (results.successRate < 70) {
    recommendations.push({
      id: 'increaseSavings',
      title: 'Increase Savings Rate',
      category: 'Savings Strategy',
      body: 'Your current success rate indicates potential challenges. Consider increasing your annual savings by 10-20% to improve retirement security.',
      impact: 'High',
    })

    recommendations.push({
      id: 'delayRetirement',
      title: 'Delay Retirement',
      category: 'Timing',
      body: 'Working an additional 2-3 years could significantly improve your success rate by allowing more time for asset accumulation.',
      impact: 'High',
    })
  }

  if (results.successRate >= 70 && results.successRate < 85) {
    recommendations.push({
      id: 'optimizeMix',
      title: 'Optimize Investment Mix',
      category: 'Investment Strategy',
      body: 'Review your asset allocation to ensure appropriate balance between growth and stability for your risk tolerance.',
      impact: 'Medium',
    })
  }

  // Expense-based recommendations
  const monthlyExpensesList = params.customExpenses.filter((e) => e.interval === 'monthly')
  const annualExpensesList = params.customExpenses.filter((e) => e.interval === 'annual')
  const totalMonthlyExpenses = monthlyExpensesList.reduce((sum, e) => sum + e.amount, 0)
  const totalAnnualExpenses = annualExpensesList.reduce((sum, e) => sum + e.amount, 0)
  const totalYearlyExpenses = totalMonthlyExpenses * 12 + totalAnnualExpenses

  if (totalYearlyExpenses > params.annualSavings * 3) {
    recommendations.push({
      id: 'reviewSpending',
      title: 'Review Spending Plan',
      category: 'Expense Management',
      body: 'Your expenses are high relative to savings. Consider reviewing discretionary spending to improve financial flexibility.',
      impact: 'Medium',
    })
  }

  // Tax optimization (always relevant)
  recommendations.push({
    id: 'maximizeTaxDeferred',
    title: 'Maximize Tax-Deferred Contributions',
    category: 'Tax Planning',
    body: 'Ensure you are taking full advantage of tax-advantaged retirement accounts to reduce current tax liability and enhance long-term growth.',
    impact: params.capitalGainsTax > 25 ? 'High' : 'Medium',
  })

  // Risk management
  if (params.roiVolatility > 0.18) {
    recommendations.push({
      id: 'reduceVolatility',
      title: 'Consider Volatility Reduction',
      category: 'Risk Management',
      body: 'Your portfolio has high volatility. As you approach retirement, consider gradually shifting to more stable investments.',
      impact: 'Medium',
    })
  }

  // Insurance recommendation
  recommendations.push({
    id: 'reviewInsurance',
    title: 'Review Insurance Coverage',
    category: 'Protection',
    body: 'Evaluate current insurance policies including health, long-term care, and life insurance to ensure adequate protection.',
    impact: 'Low',
  })

  // Limit to 6 most relevant recommendations
  return recommendations.slice(0, 6)
}

export function estimateRecommendationUplift(
  recommendation: Recommendation,
  params: SimulationParams,
  results: SimulationResults
): RecommendationUplift | null {
  const successGap = Math.max(0, 85 - results.successRate)
  const clampUplift = (value: number) => Math.max(1, Math.min(20, Math.round(value)))

  if (/Increase Savings/i.test(recommendation.title)) {
    const yearlySavingsMonths = params.annualSavings / 12
    const min = clampUplift(successGap * 0.35 + Math.min(4, yearlySavingsMonths / 1000))
    return {
      title: recommendation.title,
      upliftMin: min,
      upliftMax: clampUplift(min + 4),
    }
  }

  if (/Optimize Investment Mix|Asset Allocation|Investment/i.test(recommendation.title)) {
    const min = clampUplift(successGap * 0.2 + params.roiVolatility * 12)
    return {
      title: recommendation.title,
      upliftMin: min,
      upliftMax: clampUplift(min + 3),
    }
  }

  if (/Delay Retirement/i.test(recommendation.title)) {
    const bridgeYears = Math.max(0, params.legalRetirementAge - params.retirementAge)
    const min = clampUplift(successGap * 0.28 + bridgeYears * 1.5)
    return {
      title: recommendation.title,
      upliftMin: min,
      upliftMax: clampUplift(min + 5),
    }
  }

  if (/Review Spending Plan/i.test(recommendation.title)) {
    const monthlyExpenseLoad = params.customExpenses.reduce((sum, expense) => {
      return sum + (expense.interval === 'monthly' ? expense.amount : expense.amount / 12)
    }, 0)
    const min = clampUplift(successGap * 0.18 + monthlyExpenseLoad / 3000)
    return {
      title: recommendation.title,
      upliftMin: min,
      upliftMax: clampUplift(min + 3),
    }
  }

  return null
}
```

- [ ] **Step 6: Allow `id` in the PDF schema**

In `src/lib/pdf-generator/schema/reportData.ts`, extend `RecommendationSchema` (additive, optional — old payloads stay valid):

```ts
export const RecommendationSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  category: z.string(),
  body: z.string(),
  impact: z.enum(['High', 'Medium', 'Low']),
})
```

- [ ] **Step 7: Rewire the transformer**

In `src/lib/transformers/reportDataTransformer.ts`:

(a) Replace the imports block at the top:

```ts
import type { SimulationParams, SimulationResults } from '@/types'
import type { ReportData } from '@/lib/pdf-generator/schema/reportData'
import { defaultPdfConfig } from '@/lib/pdf-generator/utils/config'
import { computeBridgeAnalysis } from '@/lib/insights/bridge'
import { computePlanHealthScore } from '@/lib/insights/planHealth'
import { estimateRecommendationUplift, generateRecommendations } from '@/lib/insights/recommendations'
```

(b) Delete the local `generateRecommendations` and `estimateRecommendationUplift` functions (lines 207–335) entirely.

(c) Inside `transformToReportData`, replace the inline bridge computation (lines 29–40) and plan-health computation (lines 42–72) with:

```ts
  const bridge = computeBridgeAnalysis(params)
  const health = computePlanHealthScore(params, results)
```

(d) Update the `summary` object to consume them:

```ts
    summary: {
      planHealthScore: health.score,
      planHealthLabel: health.label,
      planHealthWhy: health.why,
      planHealthWhyBits: health.whyBits,
      successProbabilityPct: results.successRate,
      bridge: {
        startAge: bridge.startAge,
        endAge: bridge.endAge,
        cashNeedEUR: Math.round(bridge.cashNeedEUR),
        cashBucketYears: bridge.cashBucketYears,
        cashBucketSharePct: bridge.cashBucketSharePct,
        portfolioSharePct: bridge.portfolioSharePct,
      },
      topActions,
      topActionsDetailed: uplifts,
    },
```

Keep `topActions` / `uplifts` construction as-is (it calls the now-imported functions). Remove any now-unused local variables (`totalYearlyExpenses` is still needed for the spending section — keep it; `bridgeStart`/`bridgeEnd`/`yearsInBridge`/`inf`/`bridgeCashNeedEUR` and all plan-health locals go away).

- [ ] **Step 8: Run tests to verify parity**

Run: `pnpm test insights && pnpm test reportDataTransformer && pnpm test reportContent && npx tsc --noEmit`
Expected: ALL PASS — the transformer suites pass with unchanged assertions, proving PDF parity.

- [ ] **Step 9: Commit**

```bash
git add src/lib/insights src/lib/transformers/reportDataTransformer.ts src/lib/pdf-generator/schema/reportData.ts
git commit -m "refactor: extract plan-health, bridge and recommendation logic into shared insights library"
```

---

### Task 4: Depletion-age derivation and plan warnings

**Files:**
- Create: `src/lib/insights/depletion.ts`
- Create: `src/lib/insights/warnings.ts`
- Create: `src/lib/insights/__tests__/depletionWarnings.test.ts`

**Interfaces:**
- Consumes: `buildPlanInsightMetrics` from `@/lib/simulation/planInsights`; `computeBridgeAnalysis` from `./bridge`.
- Produces (used by Tasks 6, 7):
  - `deriveDepletionAges(results: SimulationResults): { p10DepletionAge: number | null; p50DepletionAge: number | null }` — first age at/after retirement where the percentile series reaches 0; `null` means "never depletes within the horizon".
  - `buildPlanWarnings(params: SimulationParams, results: SimulationResults | null): PlanWarning[]` with `PlanWarning = { id: 'inconsistentAges' } | { id: 'highWithdrawal'; rate: number } | { id: 'medianDepletion'; age: number } | { id: 'bridgeGap'; cashNeed: number; retirementAssets: number }`
  - `SUSTAINABLE_WITHDRAWAL_RATE = 0.06` (exported const)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/insights/__tests__/depletionWarnings.test.ts`:

```ts
import { DEFAULT_PARAMS, SimulationParams, SimulationResults } from '@/types'
import { deriveDepletionAges } from '../depletion'
import { buildPlanWarnings } from '../warnings'

function makeResults(
  overrides: Partial<SimulationResults> = {},
  params: SimulationParams = DEFAULT_PARAMS
): SimulationResults {
  const ages: number[] = []
  for (let age = params.currentAge; age <= params.endAge; age++) ages.push(age)
  const flat = (value: number) => ages.map(() => value)
  return {
    ages,
    assetPercentiles: {
      // Realistically high medians: the default params carry ~€62.9k annual expenses,
      // so a small flat median would (correctly) trigger the highWithdrawal warning
      // and break the "healthy plan" test below.
      p10: flat(800_000),
      p20: flat(1_200_000),
      p50: flat(2_000_000),
      p80: flat(2_500_000),
      p90: flat(3_000_000),
    },
    spendingPercentiles: {
      p10: flat(3000),
      p20: flat(3500),
      p50: flat(4000),
      p80: flat(4500),
      p90: flat(5000),
    },
    successRate: 90,
    depletionByAge: flat(0),
    params,
    ...overrides,
  }
}

describe('deriveDepletionAges', () => {
  it('returns null when no percentile depletes', () => {
    expect(deriveDepletionAges(makeResults())).toEqual({
      p10DepletionAge: null,
      p50DepletionAge: null,
    })
  })

  it('finds the first at-or-after-retirement age where a percentile hits zero', () => {
    const results = makeResults()
    // Deplete P10 from age 78 onward
    results.assetPercentiles.p10 = results.ages.map((age) => (age >= 78 ? 0 : 100_000))
    expect(deriveDepletionAges(results).p10DepletionAge).toBe(78)
    expect(deriveDepletionAges(results).p50DepletionAge).toBeNull()
  })

  it('ignores zero assets before retirement', () => {
    const results = makeResults()
    results.assetPercentiles.p10 = results.ages.map((age) =>
      age < results.params.retirementAge ? 0 : 100_000
    )
    expect(deriveDepletionAges(results).p10DepletionAge).toBeNull()
  })
})

describe('buildPlanWarnings', () => {
  it('is empty for a healthy default plan', () => {
    expect(buildPlanWarnings(DEFAULT_PARAMS, makeResults())).toEqual([])
  })

  it('flags inconsistent ages even without results', () => {
    const warnings = buildPlanWarnings({ ...DEFAULT_PARAMS, retirementAge: 90, endAge: 90 }, null)
    expect(warnings).toEqual([{ id: 'inconsistentAges' }])
  })

  it('flags median depletion', () => {
    const results = makeResults()
    results.assetPercentiles.p50 = results.ages.map((age) => (age >= 80 ? 0 : 100_000))
    const warnings = buildPlanWarnings(DEFAULT_PARAMS, results)
    expect(warnings).toContainEqual({ id: 'medianDepletion', age: 80 })
  })

  it('flags an unsustainable first-year withdrawal rate', () => {
    const results = makeResults()
    // Median assets at retirement of 100k vs ~46k annual portfolio need -> way above 6%
    results.assetPercentiles.p50 = results.ages.map(() => 100_000)
    const warnings = buildPlanWarnings(DEFAULT_PARAMS, results)
    expect(warnings.some((w) => w.id === 'highWithdrawal')).toBe(true)
  })

  it('flags a bridge gap when the bridge need exceeds retirement median assets', () => {
    const results = makeResults()
    results.assetPercentiles.p50 = results.ages.map(() => 50_000)
    const warnings = buildPlanWarnings(DEFAULT_PARAMS, results)
    expect(warnings.some((w) => w.id === 'bridgeGap')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test depletionWarnings`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Create `src/lib/insights/depletion.ts`**

```ts
import type { SimulationResults } from '@/types'

export type DepletionAges = {
  p10DepletionAge: number | null
  p50DepletionAge: number | null
}

export function deriveDepletionAges(results: SimulationResults): DepletionAges {
  const findDepletionAge = (series: number[]): number | null => {
    for (let i = 0; i < results.ages.length; i++) {
      if (results.ages[i] >= results.params.retirementAge && series[i] <= 0) {
        return results.ages[i]
      }
    }
    return null
  }

  return {
    p10DepletionAge: findDepletionAge(results.assetPercentiles.p10),
    p50DepletionAge: findDepletionAge(results.assetPercentiles.p50),
  }
}
```

- [ ] **Step 4: Create `src/lib/insights/warnings.ts`**

```ts
import type { SimulationParams, SimulationResults } from '@/types'
import { buildPlanInsightMetrics } from '@/lib/simulation/planInsights'
import { computeBridgeAnalysis } from './bridge'
import { deriveDepletionAges } from './depletion'

export const SUSTAINABLE_WITHDRAWAL_RATE = 0.06

export type PlanWarning =
  | { id: 'inconsistentAges' }
  | { id: 'highWithdrawal'; rate: number }
  | { id: 'medianDepletion'; age: number }
  | { id: 'bridgeGap'; cashNeed: number; retirementAssets: number }

export function buildPlanWarnings(
  params: SimulationParams,
  results: SimulationResults | null
): PlanWarning[] {
  const warnings: PlanWarning[] = []

  if (params.currentAge >= params.retirementAge || params.retirementAge >= params.endAge) {
    warnings.push({ id: 'inconsistentAges' })
  }

  if (!results) return warnings

  const metrics = buildPlanInsightMetrics(params, results)

  if (
    metrics.firstYearWithdrawalRate !== null &&
    metrics.firstYearWithdrawalRate > SUSTAINABLE_WITHDRAWAL_RATE
  ) {
    warnings.push({ id: 'highWithdrawal', rate: metrics.firstYearWithdrawalRate })
  }

  const { p50DepletionAge } = deriveDepletionAges(results)
  if (p50DepletionAge !== null) {
    warnings.push({ id: 'medianDepletion', age: p50DepletionAge })
  }

  const bridge = computeBridgeAnalysis(params)
  if (bridge.yearsInBridge > 0 && bridge.cashNeedEUR > metrics.retirementMedianAssets) {
    warnings.push({
      id: 'bridgeGap',
      cashNeed: Math.round(bridge.cashNeedEUR),
      retirementAssets: metrics.retirementMedianAssets,
    })
  }

  return warnings
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test depletionWarnings && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/insights/depletion.ts src/lib/insights/warnings.ts src/lib/insights/__tests__/depletionWarnings.test.ts
git commit -m "feat: depletion-age derivation and plan warning rules"
```

---

### Task 5: Chart plumbing — shared hooks and Assets/Spending sections

Decompose `SimulationChart.tsx` (`src/components/charts/SimulationChart.tsx`) into reusable pieces so the assets and spending charts can live in different tabs. `SimulationChart.tsx` itself is NOT deleted yet (the page still uses it until Task 9) — this task only creates the new files.

Deliberate refinement of spec §2: each collapsible data table stays WITH its chart (asset table in the Overview tab, spending table in Cashflow & Details) instead of both tables sitting in the Details tab — a table separated from its chart would be harder to read. Do not "fix" this back.

**Files:**
- Create: `src/components/charts/useChartData.ts`
- Create: `src/components/charts/ChartEmptyState.tsx`
- Create: `src/components/charts/AssetsSection.tsx`
- Create: `src/components/charts/SpendingSection.tsx`

**Interfaces:**
- Consumes: `AssetsChart` (+ `BandPoint`), `SpendingChart`, `useSetAutoRunSuspended` from the store, `deriveDepletionAges` (Task 4).
- Produces (used by Task 9):
  - `useChartData(results: SimulationResults): { chartData: ChartDataPoint[]; chartDataWithBand: BandPoint[]; spendingData: ChartDataPoint[]; milestoneRows: { age: number; p10: number; p50: number; p90: number }[] }`
  - `useChartFormatters(): { formatCurrency; formatCurrencyShort; formatPercent }`
  - `useBrushRange(ages: number[]): { indexRange: { startIndex: number; endIndex: number }; onBrushChange: (range: { startIndex?: number; endIndex?: number }) => void; resetZoom: () => void }`
  - `<ChartEmptyState />` — no props
  - `<AssetsSection results={SimulationResults} />` — assets chart + collapsible asset table
  - `<SpendingSection results={SimulationResults} />` — spending chart + collapsible spending table

- [ ] **Step 1: Create `src/components/charts/useChartData.ts`**

The data-building logic is transplanted from `SimulationChart.tsx:64-150` and the brush logic from lines 152–216 (per-chart now — the cross-chart sync is intentionally dropped because the charts live in different tabs):

```ts
'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useFormatter } from 'next-intl'
import type { ChartDataPoint, SimulationResults } from '@/types'
import type { BandPoint } from '@/components/charts/AssetsChart'
import { useSetAutoRunSuspended } from '@/lib/stores/simulationStore'

export function useChartData(results: SimulationResults) {
  const chartData: ChartDataPoint[] = useMemo(
    () =>
      results.ages.map((age, index) => {
        const yearsFromStart = age - results.params.currentAge
        const annualSavingsAtAge =
          age < results.params.retirementAge
            ? results.params.annualSavings *
              Math.pow(1 + results.params.annualSavingsGrowthRate, Math.max(0, yearsFromStart))
            : 0
        const monthlySavings = age < results.params.retirementAge ? annualSavingsAtAge / 12 : null
        const monthlyPensionAtAge =
          age >= results.params.legalRetirementAge ? results.params.monthlyPension : 0
        const medianPortfolioDraw = Math.max(
          0,
          results.spendingPercentiles.p50[index] - monthlyPensionAtAge
        )

        return {
          age,
          assets_p10: Math.round(results.assetPercentiles.p10[index]),
          assets_p20: Math.round(results.assetPercentiles.p20[index]),
          assets_p50: Math.round(results.assetPercentiles.p50[index]),
          assets_p80: Math.round(results.assetPercentiles.p80[index]),
          assets_p90: Math.round(results.assetPercentiles.p90[index]),
          spending_p10: Math.round(results.spendingPercentiles.p10[index]),
          spending_p50: Math.round(results.spendingPercentiles.p50[index]),
          spending_p90: Math.round(results.spendingPercentiles.p90[index]),
          withdrawal_rate_p50:
            results.assetPercentiles.p50[index] > 0
              ? (medianPortfolioDraw * 12) / results.assetPercentiles.p50[index]
              : null,
          monthly_savings_p50: monthlySavings,
        }
      }),
    [results]
  )

  const chartDataWithBand: BandPoint[] = useMemo(
    () =>
      chartData.map((d) => ({
        ...d,
        assets_band_lower: d.assets_p20,
        assets_band_height: Math.max(0, d.assets_p80 - d.assets_p20),
      })),
    [chartData]
  )

  const spendingData = useMemo(
    () => chartData.filter((d) => d.age >= results.params.retirementAge),
    [chartData, results.params.retirementAge]
  )

  const milestoneRows = useMemo(
    () =>
      chartData.map((d) => ({
        age: d.age,
        p10: d.assets_p10,
        p50: d.assets_p50,
        p90: d.assets_p90,
      })),
    [chartData]
  )

  return { chartData, chartDataWithBand, spendingData, milestoneRows }
}

export function useChartFormatters() {
  const format = useFormatter()

  const formatCurrency = useCallback(
    (value: number) =>
      format.number(value, {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    [format]
  )

  const formatCurrencyShort = useCallback(
    (value: number) =>
      format.number(value, {
        style: 'currency',
        currency: 'EUR',
        notation: 'compact',
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
      }),
    [format]
  )

  const formatPercent = useCallback(
    (value: number | null) =>
      value == null
        ? '—'
        : format.number(value, {
            style: 'percent',
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
    [format]
  )

  return { formatCurrency, formatCurrencyShort, formatPercent }
}

function toIndexRange(ages: number[], startAge?: number, endAge?: number) {
  if (startAge == null || endAge == null) {
    return { startIndex: 0, endIndex: Math.max(0, ages.length - 1) }
  }
  let startIndex = ages.findIndex((a) => a >= startAge)
  if (startIndex === -1) startIndex = 0
  let endIndex = ages.findIndex((a) => a > endAge)
  endIndex = endIndex === -1 ? ages.length - 1 : Math.max(startIndex, endIndex - 1)
  return { startIndex, endIndex }
}

export function useBrushRange(ages: number[]) {
  const [ageRange, setAgeRange] = useState<{ startAge?: number; endAge?: number }>({})
  const setAutoRunSuspended = useSetAutoRunSuspended()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleResume = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setAutoRunSuspended(false)
    }, 500)
  }, [setAutoRunSuspended])

  const indexRange = useMemo(
    () => toIndexRange(ages, ageRange.startAge, ageRange.endAge),
    [ages, ageRange]
  )

  const onBrushChange = useCallback(
    (range: { startIndex?: number; endIndex?: number }) => {
      if (!range || range.startIndex == null || range.endIndex == null) return
      if (range.startIndex === indexRange.startIndex && range.endIndex === indexRange.endIndex) {
        scheduleResume()
        return
      }
      const startAge = ages[Math.max(0, Math.min(range.startIndex, ages.length - 1))]
      const endAge = ages[Math.max(0, Math.min(range.endIndex, ages.length - 1))]
      setAgeRange({ startAge, endAge })
      setAutoRunSuspended(true)
      scheduleResume()
    },
    [ages, indexRange.startIndex, indexRange.endIndex, scheduleResume, setAutoRunSuspended]
  )

  const resetZoom = useCallback(() => {
    setAgeRange({})
    setAutoRunSuspended(false)
  }, [setAutoRunSuspended])

  return { indexRange, onBrushChange, resetZoom }
}
```

- [ ] **Step 2: Create `src/components/charts/ChartEmptyState.tsx`**

Markup transplanted from `SimulationChart.tsx:50-61`:

```tsx
'use client'

import { useTranslations } from 'next-intl'

export function ChartEmptyState() {
  const t = useTranslations('simulationChart')

  return (
    <div className="flex h-96 flex-col items-center justify-center gap-3 border-3 border-neo-black bg-neo-white text-center shadow-neo">
      <p className="text-[0.78rem] font-bold uppercase tracking-[0.16em] text-neo-black">
        {t('empty.title')}
      </p>
      <p className="max-w-xs text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {t('empty.subtitle')}
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/charts/AssetsSection.tsx`**

Assets chart + collapsible asset table (table markup transplanted from `SimulationChart.tsx:275-334`). The depletion-marker props on `AssetsChart` are added in Task 6 — until then pass nothing extra:

```tsx
'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { SimulationResults } from '@/types'
import { AssetsChart } from '@/components/charts/AssetsChart'
import { useBrushRange, useChartData, useChartFormatters } from '@/components/charts/useChartData'
import { cn } from '@/lib/utils'

interface AssetsSectionProps {
  results: SimulationResults
}

export function AssetsSection({ results }: AssetsSectionProps) {
  const t = useTranslations('simulationChart')
  const { chartDataWithBand, milestoneRows } = useChartData(results)
  const { formatCurrency, formatCurrencyShort } = useChartFormatters()
  const ages = useMemo(() => chartDataWithBand.map((d) => d.age), [chartDataWithBand])
  const { indexRange, onBrushChange, resetZoom } = useBrushRange(ages)

  return (
    <div className="space-y-5">
      <AssetsChart
        data={chartDataWithBand}
        retirementAge={results.params.retirementAge}
        legalRetirementAge={results.params.legalRetirementAge}
        indexRange={indexRange}
        onBrushChange={onBrushChange}
        onResetZoom={resetZoom}
        formatCurrency={formatCurrency}
        formatCurrencyShort={formatCurrencyShort}
      />

      <details className="border-3 border-neo-black bg-neo-white p-4 shadow-neo-sm">
        <summary className="cursor-pointer text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-neo-blue">
          {t('assetTable.toggle')}
        </summary>
        <div className="mt-4 overflow-x-auto border-t-3 border-neo-black pt-4">
          <table className="min-w-full border-3 border-neo-black bg-neo-white text-[0.68rem] uppercase tracking-[0.12em]">
            <caption className="sr-only">{t('assetTable.caption')}</caption>
            <thead>
              <tr className="bg-muted">
                <th className="border border-neo-black px-3 py-2 text-left">
                  {t('assetTable.headers.age')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('assetTable.headers.p10')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('assetTable.headers.p50')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('assetTable.headers.p90')}
                </th>
              </tr>
            </thead>
            <tbody>
              {milestoneRows.map((row) => {
                const isRetirementAge = row.age === results.params.retirementAge
                return (
                  <tr
                    key={row.age}
                    className={cn(
                      'border-b border-neo-black',
                      isRetirementAge
                        ? 'bg-neo-blue/10 font-bold text-neo-blue'
                        : 'bg-neo-white text-foreground'
                    )}
                  >
                    <td className="border border-neo-black px-3 py-2">
                      {row.age}{' '}
                      {isRetirementAge && (
                        <span className="ml-2 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-neo-blue">
                          {t('assetTable.retirementFlag')}
                        </span>
                      )}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(row.p10)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(row.p50)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(row.p90)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/components/charts/SpendingSection.tsx`**

Spending chart + collapsible spending table (transplanted from `SimulationChart.tsx:336-429`):

```tsx
'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { SimulationResults } from '@/types'
import { SpendingChart } from '@/components/charts/SpendingChart'
import { useBrushRange, useChartData, useChartFormatters } from '@/components/charts/useChartData'

interface SpendingSectionProps {
  results: SimulationResults
}

export function SpendingSection({ results }: SpendingSectionProps) {
  const t = useTranslations('simulationChart')
  const { spendingData } = useChartData(results)
  const { formatCurrency, formatCurrencyShort, formatPercent } = useChartFormatters()
  const ages = useMemo(() => spendingData.map((d) => d.age), [spendingData])
  const { indexRange, onBrushChange, resetZoom } = useBrushRange(ages)

  const spendingTableNoteKey =
    results.params.withdrawalStrategy === 'vanguardDynamic'
      ? 'spendingTable.note.dynamic'
      : 'spendingTable.note.fixed'

  const monthlyPensionAtAge = useCallback(
    (age: number) => (age >= results.params.legalRetirementAge ? results.params.monthlyPension : 0),
    [results.params.legalRetirementAge, results.params.monthlyPension]
  )

  return (
    <div className="space-y-5">
      <SpendingChart
        data={spendingData}
        retirementAge={results.params.retirementAge}
        withdrawalStrategy={results.params.withdrawalStrategy}
        dsWithdrawalRate={results.params.dsWithdrawalRate}
        dsCeilingRate={results.params.dsCeilingRate}
        dsFloorRate={results.params.dsFloorRate}
        indexRange={indexRange}
        onBrushChange={onBrushChange}
        onResetZoom={resetZoom}
        formatCurrency={formatCurrency}
        formatCurrencyShort={formatCurrencyShort}
      />

      <details className="border-3 border-neo-black bg-neo-white p-4 shadow-neo-sm">
        <summary className="cursor-pointer text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-neo-blue">
          {t('spendingTable.toggle')}
        </summary>
        <div className="mt-4 overflow-x-auto border-t-3 border-neo-black pt-4">
          <p className="mb-3 max-w-3xl text-[0.64rem] font-semibold uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
            {t(spendingTableNoteKey, {
              withdrawalRate: formatPercent(results.params.dsWithdrawalRate),
              ceiling: formatPercent(results.params.dsCeilingRate),
              floor: formatPercent(results.params.dsFloorRate),
            })}
          </p>
          <table className="min-w-full border-3 border-neo-black bg-neo-white text-[0.68rem] uppercase tracking-[0.12em]">
            <caption className="sr-only">{t('spendingTable.caption')}</caption>
            <thead>
              <tr className="bg-muted">
                <th className="border border-neo-black px-3 py-2 text-left">
                  {t('spendingTable.headers.age')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.p10')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.p50')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.p90')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.withdrawalRate')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.pension')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.portfolioDraw')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.availableCash')}
                </th>
              </tr>
            </thead>
            <tbody>
              {spendingData.map((data, index) => {
                const pension = monthlyPensionAtAge(data.age)
                const portfolioDraw = Math.max(0, data.spending_p50 - pension)
                const availableCash = pension + portfolioDraw

                return (
                  <tr key={index} className="border-b border-neo-black">
                    <td className="border border-neo-black px-3 py-2 text-left">{data.age}</td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(data.spending_p10)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(data.spending_p50)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(data.spending_p90)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatPercent(data.withdrawal_rate_p50)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(pension)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(portfolioDraw)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right font-black text-neo-black">
                      {formatCurrency(availableCash)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
```

- [ ] **Step 5: Verify**

Run: `pnpm lint && npx tsc --noEmit`
Expected: clean. (These components are mounted in Task 9; existing pages are untouched.)

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/useChartData.ts src/components/charts/ChartEmptyState.tsx src/components/charts/AssetsSection.tsx src/components/charts/SpendingSection.tsx
git commit -m "feat: standalone assets/spending chart sections with shared data hooks"
```

---

### Task 6: ShortfallChart and depletion markers on AssetsChart

**Files:**
- Create: `src/components/charts/ShortfallChart.tsx`
- Modify: `src/components/charts/AssetsChart.tsx` (props at lines 26–46, reference lines after line 303)
- Modify: `src/components/charts/AssetsSection.tsx` (pass depletion ages)
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/de.json`

**Interfaces:**
- Consumes: `results.depletionByAge` (Task 2, optional — component returns `null` when absent), `deriveDepletionAges` (Task 4).
- Produces: `<ShortfallChart results={SimulationResults} />`; `AssetsChart` gains optional props `p10DepletionAge?: number | null` and `p50DepletionAge?: number | null`.

- [ ] **Step 1: Create `src/components/charts/ShortfallChart.tsx`**

```tsx
'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useFormatter, useTranslations } from 'next-intl'
import type { SimulationResults } from '@/types'

interface ShortfallChartProps {
  results: SimulationResults
}

export function ShortfallChart({ results }: ShortfallChartProps) {
  const t = useTranslations('shortfallChart')
  const format = useFormatter()
  const depletionByAge = results.depletionByAge

  const data = useMemo(() => {
    if (!depletionByAge) return []
    return results.ages
      .map((age, index) => ({ age, depleted: depletionByAge[index] ?? 0 }))
      .filter((point) => point.age >= results.params.retirementAge)
  }, [depletionByAge, results.ages, results.params.retirementAge])

  // Results persisted before depletionByAge existed lack the field: hide the chart
  // until the next simulation run repopulates it.
  if (!depletionByAge || data.length === 0) return null

  const formatPercent = (value: number) =>
    format.number(value, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })

  return (
    <div
      role="img"
      aria-label={t('ariaLabel')}
      className="w-full min-w-0 space-y-4 border-3 border-neo-black bg-neo-white p-4 shadow-neo sm:p-6"
    >
      <div>
        <h4 className="text-base font-extrabold uppercase tracking-[0.2em] text-neo-black sm:text-lg">
          {t('title')}
        </h4>
        <p className="mt-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--neo-black)" strokeOpacity={0.15} />
            <XAxis dataKey="age" tick={{ fontSize: 11 }} tickLine={false} />
            <YAxis
              domain={[0, (dataMax: number) => Math.max(0.05, Math.ceil(dataMax * 20) / 20)]}
              tickFormatter={formatPercent}
              tick={{ fontSize: 11 }}
              tickLine={false}
              width={52}
            />
            <Tooltip
              formatter={(value: number) => [formatPercent(value), t('yAxisLabel')]}
              labelFormatter={(age) => `${t('ageLabel')} ${age}`}
              contentStyle={{
                border: '3px solid var(--neo-black)',
                background: 'var(--neo-white)',
                fontSize: '12px',
              }}
            />
            <Area
              type="stepAfter"
              dataKey="depleted"
              stroke="var(--neo-red)"
              strokeWidth={2.5}
              fill="var(--neo-red)"
              fillOpacity={0.15}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add depletion markers to `AssetsChart`**

In `src/components/charts/AssetsChart.tsx`:

(a) Extend the props interface (line 26) and destructuring (line 37):

```ts
interface AssetsChartProps {
  data: BandPoint[]
  retirementAge: number
  legalRetirementAge: number
  p10DepletionAge?: number | null
  p50DepletionAge?: number | null
  indexRange: { startIndex: number; endIndex: number }
  onBrushChange: (range: { startIndex?: number; endIndex?: number }) => void
  onResetZoom: () => void
  formatCurrency: (value: number) => string
  formatCurrencyShort: (value: number) => string
}
```

(add `p10DepletionAge = null, p50DepletionAge = null,` to the destructured parameters).

(b) Directly after the existing pension `ReferenceLine` (closes at line 303), add:

```tsx
            {p50DepletionAge != null && (
              <ReferenceLine
                x={p50DepletionAge}
                stroke="var(--neo-red)"
                strokeWidth={2}
                label={{
                  value: t('markers.depletionP50'),
                  position: 'insideTopRight',
                  style: { fill: 'var(--neo-red)', fontSize: '11px', fontWeight: 'bold' },
                }}
              />
            )}
            {p10DepletionAge != null && p10DepletionAge !== p50DepletionAge && (
              <ReferenceLine
                x={p10DepletionAge}
                stroke="var(--neo-red)"
                strokeDasharray="3 3"
                strokeWidth={2}
                label={{
                  value: t('markers.depletionP10'),
                  position: 'insideBottomRight',
                  style: { fill: 'var(--neo-red)', fontSize: '11px', fontWeight: 'semibold' },
                }}
              />
            )}
```

- [ ] **Step 3: Pass depletion ages from `AssetsSection`**

In `src/components/charts/AssetsSection.tsx`, add the import and computation:

```ts
import { deriveDepletionAges } from '@/lib/insights/depletion'
```

inside the component:

```ts
  const depletion = useMemo(() => deriveDepletionAges(results), [results])
```

and pass to the chart:

```tsx
        p10DepletionAge={depletion.p10DepletionAge}
        p50DepletionAge={depletion.p50DepletionAge}
```

- [ ] **Step 4: Add i18n keys**

In `src/i18n/messages/en.json`, add a top-level `shortfallChart` block (next to `assetsChart`):

```json
"shortfallChart": {
  "title": "Risk of running out",
  "subtitle": "Share of simulation runs whose assets are exhausted by each age",
  "ariaLabel": "Chart showing the share of simulation runs with depleted assets by age",
  "yAxisLabel": "runs depleted",
  "ageLabel": "Age"
}
```

and inside the existing `assetsChart.markers` object, add:

```json
"depletionP50": "Median depleted",
"depletionP10": "P10 depleted"
```

In `src/i18n/messages/de.json`:

```json
"shortfallChart": {
  "title": "Erschöpfungsrisiko",
  "subtitle": "Anteil der Simulationsläufe, deren Vermögen bis zum jeweiligen Alter aufgebraucht ist",
  "ariaLabel": "Diagramm des Anteils der Simulationsläufe mit erschöpftem Vermögen je Alter",
  "yAxisLabel": "Läufe erschöpft",
  "ageLabel": "Alter"
}
```

and in `assetsChart.markers`:

```json
"depletionP50": "Median erschöpft",
"depletionP10": "P10 erschöpft"
```

- [ ] **Step 5: Verify**

Run: `pnpm lint && npx tsc --noEmit && pnpm test`
Expected: clean; all unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/ShortfallChart.tsx src/components/charts/AssetsChart.tsx src/components/charts/AssetsSection.tsx src/i18n/messages/en.json src/i18n/messages/de.json
git commit -m "feat: shortfall-by-age chart and depletion markers on assets chart"
```

---

### Task 7: PlanHealthHero component

**Files:**
- Create: `src/components/charts/PlanHealthHero.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/de.json`

**Interfaces:**
- Consumes: `computePlanHealthScore` (Task 3), `deriveDepletionAges`, `buildPlanWarnings`, `SUSTAINABLE_WITHDRAWAL_RATE` (Task 4), `buildPlanInsightMetrics` (existing), `AnimatedCounter` from `@/components/ui/animated-counter`.
- Produces: `<PlanHealthHero params={SimulationParams} results={SimulationResults | null} isLoading={boolean} />` — mounted by Task 9.

- [ ] **Step 1: Create `src/components/charts/PlanHealthHero.tsx`**

```tsx
'use client'

import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { SimulationParams, SimulationResults } from '@/types'
import { buildPlanInsightMetrics } from '@/lib/simulation/planInsights'
import { computePlanHealthScore, type PlanHealthLabel } from '@/lib/insights/planHealth'
import { deriveDepletionAges } from '@/lib/insights/depletion'
import { buildPlanWarnings, type PlanWarning } from '@/lib/insights/warnings'
import { AnimatedCounter } from '@/components/ui/animated-counter'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface PlanHealthHeroProps {
  params: SimulationParams
  results: SimulationResults | null
  isLoading: boolean
}

const scoreLabelKeys: Record<PlanHealthLabel, 'strong' | 'moderate' | 'needsAttention'> = {
  Strong: 'strong',
  Moderate: 'moderate',
  'Needs Attention': 'needsAttention',
}

const scoreTones: Record<PlanHealthLabel, string> = {
  Strong: 'text-neo-green',
  Moderate: 'text-warning-600',
  'Needs Attention': 'text-neo-red',
}

function successTone(rate: number) {
  if (rate >= 90) return 'text-neo-green'
  if (rate >= 75) return 'text-warning-600'
  return 'text-neo-red'
}

export function PlanHealthHero({ params, results, isLoading }: PlanHealthHeroProps) {
  const t = useTranslations('planHero')
  const format = useFormatter()

  const health = useMemo(
    () => (results ? computePlanHealthScore(params, results) : null),
    [params, results]
  )
  const metrics = useMemo(() => buildPlanInsightMetrics(params, results), [params, results])
  const depletion = useMemo(
    () => (results ? deriveDepletionAges(results) : { p10DepletionAge: null, p50DepletionAge: null }),
    [results]
  )
  const warnings = useMemo(() => buildPlanWarnings(params, results), [params, results])

  const formatCurrency = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    })

  const formatPercent = (value: number) =>
    format.number(value, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })

  const warningText = (warning: PlanWarning): string => {
    switch (warning.id) {
      case 'highWithdrawal':
        return t('warnings.highWithdrawal', { rate: formatPercent(warning.rate) })
      case 'medianDepletion':
        return t('warnings.medianDepletion', { age: warning.age })
      case 'bridgeGap':
        return t('warnings.bridgeGap', {
          need: formatCurrency(warning.cashNeed),
          assets: formatCurrency(warning.retirementAssets),
        })
      case 'inconsistentAges':
        return t('warnings.inconsistentAges')
    }
  }

  const tiles: { key: string; label: string; value: React.ReactNode; detail: string }[] = [
    {
      key: 'score',
      label: t('score.label'),
      value: health ? (
        <span className={cn(scoreTones[health.label])}>
          <AnimatedCounter end={health.score} duration={1.5} decimals={0} />
          <span className="text-base font-bold text-muted-foreground">/100</span>
        </span>
      ) : (
        t('notAvailable')
      ),
      detail: health ? t(`score.${scoreLabelKeys[health.label]}`) : '',
    },
    {
      key: 'success',
      label: t('success.label'),
      value: results ? (
        <span className={cn(successTone(results.successRate))}>
          <AnimatedCounter end={results.successRate} duration={1.5} decimals={1} suffix="%" />
        </span>
      ) : (
        t('notAvailable')
      ),
      detail: results ? t('success.detail', { runs: format.number(params.simulationRuns) }) : '',
    },
    {
      key: 'lasts',
      label: t('lasts.label'),
      value: results
        ? depletion.p50DepletionAge !== null
          ? t('lasts.toAge', { age: depletion.p50DepletionAge })
          : t('lasts.beyond', { age: params.endAge })
        : t('notAvailable'),
      detail: results
        ? depletion.p10DepletionAge !== null
          ? t('lasts.detailP10', { age: depletion.p10DepletionAge })
          : t('lasts.detailNone')
        : '',
    },
    {
      key: 'withdrawal',
      label: t('withdrawal.label'),
      value:
        results && metrics.firstYearWithdrawalRate !== null
          ? formatPercent(metrics.firstYearWithdrawalRate)
          : t('notAvailable'),
      detail: results ? t('withdrawal.detail', { need: formatCurrency(metrics.firstYearPortfolioNeed) }) : '',
    },
    {
      key: 'bridge',
      label: t('bridge.label'),
      value: t('bridge.value', { years: metrics.bridgeYears }),
      detail: t('bridge.detail', { age: params.legalRetirementAge }),
    },
  ]

  return (
    <Card className="overflow-hidden border-3 border-neo-black">
      <CardContent className={cn('bg-neo-white p-5', isLoading && 'animate-pulse opacity-70')}>
        <h2 className="sr-only">{t('title')}</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {tiles.map((tile) => (
            <div key={tile.key} className="border-2 border-neo-black bg-background p-4 shadow-neo-sm">
              <span className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {tile.label}
              </span>
              <div className="mt-2 text-2xl font-black text-neo-black">{tile.value}</div>
              {tile.detail && (
                <p className="mt-1 text-xs font-medium text-muted-foreground">{tile.detail}</p>
              )}
            </div>
          ))}
        </div>

        {warnings.length > 0 && (
          <ul role="alert" className="mt-5 space-y-2">
            {warnings.map((warning) => (
              <li
                key={warning.id}
                className="flex items-start gap-3 border-2 border-neo-red bg-red-50 px-4 py-3 text-sm font-semibold text-neo-red"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {warningText(warning)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Add i18n keys**

In `src/i18n/messages/en.json`, add a top-level `planHero` block:

```json
"planHero": {
  "title": "Plan health",
  "score": {
    "label": "Health score",
    "strong": "Strong",
    "moderate": "Moderate",
    "needsAttention": "Needs attention"
  },
  "success": { "label": "Success rate", "detail": "{runs} simulation runs" },
  "lasts": {
    "label": "Assets last",
    "toAge": "to age {age}",
    "beyond": "beyond {age}",
    "detailP10": "Worst case (P10): age {age}",
    "detailNone": "No depletion even in the worst 10%"
  },
  "withdrawal": {
    "label": "First-year withdrawal",
    "detail": "{need} needed from the portfolio"
  },
  "bridge": {
    "label": "Pension bridge",
    "value": "{years, plural, =0 {No gap} one {# year} other {# years}}",
    "detail": "until statutory pension at {age}"
  },
  "notAvailable": "—",
  "warnings": {
    "highWithdrawal": "First-year withdrawal rate of {rate} is above the sustainable range (max. 6%).",
    "medianDepletion": "In the median outcome your assets run out at age {age} — before your plan horizon.",
    "bridgeGap": "The bridge-period need of {need} exceeds your median assets at retirement ({assets}).",
    "inconsistentAges": "Check your age inputs — current, retirement and end age overlap."
  }
}
```

In `src/i18n/messages/de.json`:

```json
"planHero": {
  "title": "Planzustand",
  "score": {
    "label": "Gesundheitswert",
    "strong": "Stark",
    "moderate": "Solide",
    "needsAttention": "Handlungsbedarf"
  },
  "success": { "label": "Erfolgsquote", "detail": "{runs} Simulationsläufe" },
  "lasts": {
    "label": "Vermögen reicht",
    "toAge": "bis Alter {age}",
    "beyond": "über {age} hinaus",
    "detailP10": "Worst Case (P10): Alter {age}",
    "detailNone": "Auch im schlechtesten Zehntel keine Erschöpfung"
  },
  "withdrawal": {
    "label": "Entnahme im 1. Jahr",
    "detail": "{need} müssen aus dem Portfolio kommen"
  },
  "bridge": {
    "label": "Rentenbrücke",
    "value": "{years, plural, =0 {Keine Lücke} one {# Jahr} other {# Jahre}}",
    "detail": "bis zur gesetzlichen Rente mit {age}"
  },
  "notAvailable": "n/v",
  "warnings": {
    "highWithdrawal": "Die Entnahmerate von {rate} im ersten Jahr liegt über dem nachhaltigen Bereich (max. 6 %).",
    "medianDepletion": "Im Median ist Ihr Vermögen mit {age} aufgebraucht – vor dem Planungshorizont.",
    "bridgeGap": "Der Bedarf in der Brückenphase ({need}) übersteigt Ihr Medianvermögen zum Rentenstart ({assets}).",
    "inconsistentAges": "Bitte prüfen Sie die Altersangaben – aktuelles Alter, Renteneintritt und Endalter überschneiden sich."
  }
}
```

- [ ] **Step 3: Verify**

Run: `pnpm lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/charts/PlanHealthHero.tsx src/i18n/messages/en.json src/i18n/messages/de.json
git commit -m "feat: PlanHealthHero metrics strip with inline plan warnings"
```

---

### Task 8: CashflowCard, ScenarioList, RecommendationList

Extract the cashflow block and what-if scenarios from `PlanDashboard.tsx` into standalone cards, and build the on-screen recommendation list. `PlanDashboard.tsx` is deleted in Task 9, not here.

**Files:**
- Create: `src/components/charts/CashflowCard.tsx`
- Create: `src/components/charts/ScenarioList.tsx`
- Create: `src/components/charts/RecommendationList.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/de.json`

**Interfaces:**
- Consumes: `buildPlanInsightMetrics`, `buildScenarioParams`, `areSimulationParamsEqual`, `getPlanHealth` from `@/lib/simulation/planInsights`; `generateRecommendations`, `estimateRecommendationUplift` from `@/lib/insights/recommendations`; `runSimulationInClient` (dynamic import); existing i18n namespaces `planDashboard.cashflow.*`, `planDashboard.scenarios.*`, `planDashboard.notAvailable`.
- Produces (mounted in Task 9): `<CashflowCard params results />`, `<ScenarioList params results isLoading />`, `<RecommendationList params results />`.

- [ ] **Step 1: Create `src/components/charts/CashflowCard.tsx`**

Markup transplanted from `PlanDashboard.tsx:189-226`:

```tsx
'use client'

import { useMemo } from 'react'
import { CircleDollarSign } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { SimulationParams, SimulationResults } from '@/types'
import { buildPlanInsightMetrics } from '@/lib/simulation/planInsights'
import { Card, CardContent } from '@/components/ui/card'

interface CashflowCardProps {
  params: SimulationParams
  results: SimulationResults | null
}

export function CashflowCard({ params, results }: CashflowCardProps) {
  const t = useTranslations('planDashboard')
  const format = useFormatter()
  const metrics = useMemo(() => buildPlanInsightMetrics(params, results), [params, results])

  const formatCurrency = (value: number, compact = false) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 0,
      minimumFractionDigits: 0,
    })

  const formatPercent = (value: number | null) =>
    value == null
      ? t('notAvailable')
      : format.number(value, {
          style: 'percent',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })

  return (
    <Card className="overflow-hidden">
      <CardContent className="bg-neo-white p-5">
        <div className="flex items-center gap-3">
          <CircleDollarSign className="h-5 w-5 text-neo-blue" aria-hidden="true" />
          <h4 className="text-sm font-extrabold uppercase tracking-[0.16em]">
            {t('cashflow.title')}
          </h4>
        </div>
        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-muted-foreground">
              {t('cashflow.portfolioNeed')}
            </span>
            <strong className="text-right">{formatCurrency(metrics.firstYearPortfolioNeed)}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-muted-foreground">
              {t('cashflow.pensionIncome')}
            </span>
            <strong className="text-right">{formatCurrency(metrics.pensionAnnual)}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-medium text-muted-foreground">
              {t('cashflow.realReturn')}
            </span>
            <strong className="text-right">{formatPercent(metrics.realReturn)}</strong>
          </div>
          <div className="flex items-center justify-between gap-4 border-t-2 border-neo-black pt-4">
            <span className="text-sm font-medium text-muted-foreground">
              {t('cashflow.horizonMedian')}
            </span>
            <strong className="text-right">
              {formatCurrency(metrics.horizonMedianAssets, true)}
            </strong>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Create `src/components/charts/ScenarioList.tsx`**

Scenario worker-rerun effect and row rendering transplanted from `PlanDashboard.tsx:32-110` and `228-289`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Landmark } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { SimulationParams, SimulationResults } from '@/types'
import {
  areSimulationParamsEqual,
  buildScenarioParams,
  getPlanHealth,
  type PlanHealth,
} from '@/lib/simulation/planInsights'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ScenarioListProps {
  params: SimulationParams
  results: SimulationResults | null
  isLoading: boolean
}

type ScenarioResult = {
  id: string
  successRate: number
  delta: number
}

const healthClasses: Record<PlanHealth, string> = {
  strong: 'border-success-600 bg-success-50 text-success-700',
  watch: 'border-warning-600 bg-warning-50 text-warning-700',
  strained: 'border-neo-red bg-red-50 text-neo-red',
}

export function ScenarioList({ params, results, isLoading }: ScenarioListProps) {
  const t = useTranslations('planDashboard')
  const [scenarios, setScenarios] = useState<ScenarioResult[]>([])
  const [scenarioStatus, setScenarioStatus] = useState<'idle' | 'loading' | 'ready'>('idle')

  useEffect(() => {
    if (!results || isLoading || !areSimulationParamsEqual(params, results.params)) {
      setScenarios([])
      setScenarioStatus('idle')
      return
    }

    let cancelled = false
    const scenarioParams = buildScenarioParams(params)

    setScenarioStatus('loading')

    const loadScenarios = async () => {
      const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
      const nextScenarios = await Promise.all(
        scenarioParams.map(async (scenario) => {
          const scenarioResults = await runSimulationInClient(scenario.params)
          return {
            id: scenario.id,
            successRate: scenarioResults.successRate,
            delta: scenarioResults.successRate - results.successRate,
          }
        })
      )

      if (cancelled) return
      setScenarios(nextScenarios.sort((a, b) => b.delta - a.delta))
      setScenarioStatus('ready')
    }

    void loadScenarios().catch(() => {
      if (!cancelled) {
        setScenarios([])
        setScenarioStatus('idle')
      }
    })

    return () => {
      cancelled = true
    }
  }, [isLoading, params, results])

  return (
    <Card className="overflow-hidden">
      <CardContent className="bg-neo-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Landmark className="h-5 w-5 text-neo-blue" aria-hidden="true" />
            <h4 className="text-sm font-extrabold uppercase tracking-[0.16em]">
              {t('scenarios.title')}
            </h4>
          </div>
          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {scenarioStatus === 'loading' ? t('scenarios.loading') : t('scenarios.preview')}
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {(scenarioStatus === 'loading' ? buildScenarioParams(params) : scenarios).map(
            (scenario) => {
              const isResolved = 'delta' in scenario
              const health = isResolved ? getPlanHealth(scenario.successRate) : 'watch'

              return (
                <div
                  key={scenario.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-4 border-2 border-neo-black bg-neo-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-neo-black">
                      {t(`scenarios.items.${scenario.id}.name`)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {t(`scenarios.items.${scenario.id}.description`)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    {isResolved ? (
                      <>
                        <span
                          className={cn(
                            'border-2 px-2 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em]',
                            healthClasses[health]
                          )}
                        >
                          {scenario.delta >= 0 ? '+' : ''}
                          {scenario.delta.toFixed(1)} pts
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span className="w-14 text-[0.72rem] font-black">
                          {scenario.successRate.toFixed(1)}%
                        </span>
                      </>
                    ) : (
                      <span className="h-7 w-24 animate-pulse border-2 border-neo-black bg-muted" />
                    )}
                  </div>
                </div>
              )
            }
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Create `src/components/charts/RecommendationList.tsx`**

```tsx
'use client'

import { useMemo } from 'react'
import { Lightbulb } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { SimulationParams, SimulationResults } from '@/types'
import {
  estimateRecommendationUplift,
  generateRecommendations,
} from '@/lib/insights/recommendations'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface RecommendationListProps {
  params: SimulationParams
  results: SimulationResults | null
}

const impactClasses: Record<'High' | 'Medium' | 'Low', string> = {
  High: 'border-neo-red bg-red-50 text-neo-red',
  Medium: 'border-warning-600 bg-warning-50 text-warning-700',
  Low: 'border-neo-black bg-muted text-muted-foreground',
}

export function RecommendationList({ params, results }: RecommendationListProps) {
  const t = useTranslations('recommendations')

  const recommendations = useMemo(
    () => (results ? generateRecommendations(params, results) : []),
    [params, results]
  )

  return (
    <Card className="overflow-hidden">
      <CardContent className="bg-neo-white p-5">
        <div className="flex items-center gap-3">
          <Lightbulb className="h-5 w-5 text-neo-blue" aria-hidden="true" />
          <h4 className="text-sm font-extrabold uppercase tracking-[0.16em]">{t('title')}</h4>
        </div>
        <p className="mt-2 text-xs font-medium text-muted-foreground">{t('subtitle')}</p>

        {recommendations.length === 0 ? (
          <p className="mt-5 text-sm font-medium text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {recommendations.map((rec) => {
              const uplift = results ? estimateRecommendationUplift(rec, params, results) : null

              return (
                <li key={rec.id} className="border-2 border-neo-black bg-background p-4 shadow-neo-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-neo-black">
                      {t(`items.${rec.id}.title`)}
                    </p>
                    <span className="flex items-center gap-2">
                      {uplift && (
                        <span className="border-2 border-success-600 bg-success-50 px-2 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-success-700">
                          {t('uplift', { min: uplift.upliftMin, max: uplift.upliftMax })}
                        </span>
                      )}
                      <span
                        className={cn(
                          'border-2 px-2 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em]',
                          impactClasses[rec.impact]
                        )}
                      >
                        {t(`impact.${rec.impact.toLowerCase()}`)}
                      </span>
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-muted-foreground">
                    {t(`items.${rec.id}.body`)}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Add i18n keys**

In `src/i18n/messages/en.json`, add a top-level `recommendations` block:

```json
"recommendations": {
  "title": "Recommendations",
  "subtitle": "Rule-based suggestions derived from your plan — estimated uplift in success-rate points",
  "empty": "Run the simulation to see recommendations.",
  "uplift": "+{min}–{max} pts",
  "impact": { "high": "High impact", "medium": "Medium impact", "low": "Low impact" },
  "items": {
    "increaseSavings": {
      "title": "Increase savings rate",
      "body": "Your current success rate indicates potential challenges. Consider increasing your annual savings by 10-20% to improve retirement security."
    },
    "delayRetirement": {
      "title": "Delay retirement",
      "body": "Working an additional 2-3 years could significantly improve your success rate by allowing more time for asset accumulation."
    },
    "optimizeMix": {
      "title": "Optimize investment mix",
      "body": "Review your asset allocation to ensure an appropriate balance between growth and stability for your risk tolerance."
    },
    "reviewSpending": {
      "title": "Review spending plan",
      "body": "Your expenses are high relative to savings. Consider reviewing discretionary spending to improve financial flexibility."
    },
    "maximizeTaxDeferred": {
      "title": "Maximize tax-advantaged accounts",
      "body": "Ensure you are taking full advantage of tax-advantaged retirement accounts to reduce current tax liability and enhance long-term growth."
    },
    "reduceVolatility": {
      "title": "Consider volatility reduction",
      "body": "Your portfolio has high volatility. As you approach retirement, consider gradually shifting to more stable investments."
    },
    "reviewInsurance": {
      "title": "Review insurance coverage",
      "body": "Evaluate current insurance policies including health, long-term care and life insurance to ensure adequate protection."
    }
  }
}
```

In `src/i18n/messages/de.json`:

```json
"recommendations": {
  "title": "Empfehlungen",
  "subtitle": "Regelbasierte Vorschläge aus Ihrem Plan – geschätzter Zugewinn in Erfolgsquoten-Punkten",
  "empty": "Führen Sie die Simulation aus, um Empfehlungen zu sehen.",
  "uplift": "+{min}–{max} Pkt.",
  "impact": { "high": "Hohe Wirkung", "medium": "Mittlere Wirkung", "low": "Geringe Wirkung" },
  "items": {
    "increaseSavings": {
      "title": "Sparrate erhöhen",
      "body": "Ihre aktuelle Erfolgsquote deutet auf Risiken hin. Erhöhen Sie Ihre jährliche Sparrate um 10–20 %, um die Absicherung zu verbessern."
    },
    "delayRetirement": {
      "title": "Renteneintritt verschieben",
      "body": "Zwei bis drei zusätzliche Arbeitsjahre können die Erfolgsquote deutlich verbessern, weil mehr Zeit für den Vermögensaufbau bleibt."
    },
    "optimizeMix": {
      "title": "Anlagemix optimieren",
      "body": "Überprüfen Sie Ihre Vermögensaufteilung, um Wachstum und Stabilität passend zu Ihrer Risikotoleranz auszubalancieren."
    },
    "reviewSpending": {
      "title": "Ausgabenplan überprüfen",
      "body": "Ihre Ausgaben sind im Verhältnis zur Sparrate hoch. Prüfen Sie variable Ausgaben, um finanziellen Spielraum zu gewinnen."
    },
    "maximizeTaxDeferred": {
      "title": "Steuervorteile ausschöpfen",
      "body": "Nutzen Sie steuerbegünstigte Altersvorsorgeprodukte voll aus, um die Steuerlast zu senken und das langfristige Wachstum zu stärken."
    },
    "reduceVolatility": {
      "title": "Volatilität reduzieren",
      "body": "Ihr Portfolio schwankt stark. Mit näher rückendem Ruhestand empfiehlt sich eine schrittweise Umschichtung in stabilere Anlagen."
    },
    "reviewInsurance": {
      "title": "Versicherungsschutz prüfen",
      "body": "Überprüfen Sie bestehende Policen – Kranken-, Pflege- und Lebensversicherung –, um ausreichenden Schutz sicherzustellen."
    }
  }
}
```

- [ ] **Step 5: Verify**

Run: `pnpm lint && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/CashflowCard.tsx src/components/charts/ScenarioList.tsx src/components/charts/RecommendationList.tsx src/i18n/messages/en.json src/i18n/messages/de.json
git commit -m "feat: cashflow, scenario and recommendation cards for the tabbed dashboard"
```

---

### Task 9: Rebuild the simulation page — hero + tabs; delete dissolved components

**Files:**
- Modify: `src/app/[locale]/simulation/page.tsx` (full rewrite of the content column)
- Delete: `src/components/charts/SuccessRateCard.tsx`
- Delete: `src/components/charts/PlanDashboard.tsx`
- Delete: `src/components/charts/SimulationChart.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/de.json` (add `simulation.tabs`, remove dead keys)

**Interfaces:**
- Consumes: everything produced by Tasks 5–8, plus `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` from `@/components/ui/tabs`.
- Notes:
  - Use `forceMount` + `className="data-[state=inactive]:hidden"` on every `TabsContent` so tab switches don't unmount content (preserves brush zoom state and prevents the scenario worker-reruns from re-triggering on each switch).
  - The page header (badges, confidence chip, PDF button, mobile menu, aria-live region) stays EXACTLY as it is today (`page.tsx:88-163`).

- [ ] **Step 1: Rewrite `src/app/[locale]/simulation/page.tsx`**

Replace the entire file with:

```tsx
'use client'

import { useEffect, useMemo } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useSimulationStore,
  useSimulationParams,
  useSimulationResults,
  useSimulationLoading,
} from '@/lib/stores/simulationStore'
import { PlanHealthHero } from '@/components/charts/PlanHealthHero'
import { AssetsSection } from '@/components/charts/AssetsSection'
import { SpendingSection } from '@/components/charts/SpendingSection'
import { ShortfallChart } from '@/components/charts/ShortfallChart'
import { CashflowCard } from '@/components/charts/CashflowCard'
import { ScenarioList } from '@/components/charts/ScenarioList'
import { RecommendationList } from '@/components/charts/RecommendationList'
import { ChartEmptyState } from '@/components/charts/ChartEmptyState'
import { ParameterSidebar } from '@/components/navigation/ParameterSidebar'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { MobileMenu } from '@/components/navigation/MobileMenu'
import { VersionInfo } from '@/components/navigation/VersionInfo'
import { GenerateReportButton } from '@/components/GenerateReportButton'
import { ChartSkeleton } from '@/components/ui/skeleton'

export default function SimulationPage() {
  const t = useTranslations('simulation')
  const format = useFormatter()
  const params = useSimulationParams()
  const results = useSimulationResults()
  const isLoading = useSimulationLoading()
  const runSimulation = useSimulationStore((state) => state.runSimulation)

  const successRate = results?.successRate
  const formattedRuns = useMemo(
    () => format.number(params.simulationRuns),
    [format, params.simulationRuns]
  )

  const formattedSuccessRate = useMemo(() => {
    if (successRate == null) return null
    return format.number(successRate / 100, {
      style: 'percent',
      minimumFractionDigits: successRate % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    })
  }, [format, successRate])

  const successTone = useMemo(() => {
    if (successRate == null) return null
    if (successRate >= 90) return 'high'
    if (successRate >= 75) return 'medium'
    return 'low'
  }, [successRate])

  const successMessage = successTone ? t(`header.confidence.${successTone}`) : null

  // Run initial simulation if no results exist
  // This happens on first visit or when params have changed and results were invalidated
  useEffect(() => {
    if (!results && !isLoading) {
      runSimulation()
    }
  }, []) // Empty deps - only run once on mount

  const renderTabBody = (content: React.ReactNode) => {
    if (isLoading) return <ChartSkeleton />
    if (!results) return <ChartEmptyState />
    return content
  }

  return (
    <div className="app-page app-page-simulation relative min-h-screen pb-16">
      {/* Live region for screen readers to announce simulation results */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {successRate != null &&
          `Simulation complete. Success rate: ${formattedSuccessRate}. ${successMessage}`}
      </div>
      {/* Header */}
      <header id="navigation" className="theme-page-header relative z-10 pt-12 pb-10">
        <div className="theme-container mx-auto max-w-[90rem] px-2 sm:px-3 lg:px-4">
          <div className="theme-hero neo-surface relative overflow-hidden px-8 py-10 transition-neo">
            <div className="theme-hero-layout relative flex flex-col gap-10">
              <div className="theme-hero-top flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex flex-col gap-5 text-neo-black">
                  <div className="theme-badge-row flex flex-wrap items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.32em]">
                    <span className="neo-chip bg-neo-yellow text-neo-black shadow-neo-sm">
                      {t('header.badges.engine')}
                    </span>
                    <span className="neo-chip bg-neo-white text-muted-foreground shadow-neo-sm">
                      {t('header.badges.runs', { count: formattedRuns })}
                    </span>
                    <VersionInfo />
                  </div>
                  <div>
                    <h1 className="text-3xl font-black tracking-[0.14em] sm:text-4xl">
                      {t('header.title')}
                    </h1>
                    <p className="mt-4 max-w-2xl font-medium text-foreground/80">
                      {t('header.subtitle')}
                    </p>
                    {successMessage && (
                      <span className="neo-chip mt-5 bg-neo-white px-5 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] shadow-neo-sm">
                        {successMessage}
                      </span>
                    )}
                  </div>
                </div>

                {/* Desktop Actions */}
                <div className="theme-action-strip hidden lg:flex lg:flex-col lg:gap-3">
                  <LocaleSwitcher className="w-48" />
                  <GenerateReportButton
                    results={results}
                    params={params}
                    disabled={isLoading}
                    variant="secondary"
                    size="sm"
                    buttonClassName="w-48"
                  />
                  <Button variant="secondary" size="sm" asChild className="w-48">
                    <Link href="/setup">{t('header.setupLink')}</Link>
                  </Button>
                </div>

                {/* Mobile Actions */}
                <div className="theme-mobile-actions flex items-center gap-3 lg:hidden">
                  <GenerateReportButton
                    results={results}
                    params={params}
                    disabled={isLoading}
                    variant="default"
                    size="lg"
                    buttonClassName="flex-1 min-h-[44px]"
                  />
                  <MobileMenu
                    results={results}
                    params={params}
                    isLoading={isLoading}
                    showSetupLink
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="theme-container relative z-10 mx-auto mt-2 max-w-[90rem] px-2 pb-28 sm:px-3 lg:px-4 lg:pb-16"
      >
        <div className="theme-page-grid theme-simulation-grid grid grid-cols-1 gap-8 lg:grid-cols-[432px_minmax(0,1fr)] xl:grid-cols-[456px_minmax(0,1fr)]">
          <ParameterSidebar className="theme-parameter-sidebar" />

          <div className="theme-content theme-simulation-content space-y-6">
            <PlanHealthHero params={params} results={results} isLoading={isLoading} />

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-1 border-3 border-neo-black bg-neo-white shadow-neo sm:grid-cols-3">
                <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
                <TabsTrigger value="details">{t('tabs.details')}</TabsTrigger>
                <TabsTrigger value="scenarios">{t('tabs.scenarios')}</TabsTrigger>
              </TabsList>

              <TabsContent
                value="overview"
                forceMount
                className="mt-6 space-y-6 data-[state=inactive]:hidden"
              >
                {renderTabBody(
                  results && (
                    <>
                      <AssetsSection results={results} />
                      <ShortfallChart results={results} />
                    </>
                  )
                )}
              </TabsContent>

              <TabsContent
                value="details"
                forceMount
                className="mt-6 space-y-6 data-[state=inactive]:hidden"
              >
                {renderTabBody(
                  results && (
                    <>
                      <SpendingSection results={results} />
                      <CashflowCard params={params} results={results} />
                    </>
                  )
                )}
              </TabsContent>

              <TabsContent
                value="scenarios"
                forceMount
                className="mt-6 space-y-6 data-[state=inactive]:hidden"
              >
                <ScenarioList params={params} results={results} isLoading={isLoading} />
                <RecommendationList params={params} results={results} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Delete the dissolved components**

```bash
git rm src/components/charts/SuccessRateCard.tsx src/components/charts/PlanDashboard.tsx src/components/charts/SimulationChart.tsx
```

Then check for lingering references (must return nothing except this plan document):

```bash
grep -rn "SuccessRateCard\|PlanDashboard\|SimulationChart" src/
```

If `src/components/ui/skeleton.tsx` exports a now-unused `SuccessRateCardSkeleton`, remove that export too.

- [ ] **Step 3: Update i18n keys**

In BOTH `src/i18n/messages/en.json` and `de.json`:

(a) Add inside the `simulation` namespace:

en:

```json
"tabs": {
  "overview": "Overview",
  "details": "Cashflow & details",
  "scenarios": "Scenarios & advice"
}
```

de:

```json
"tabs": {
  "overview": "Überblick",
  "details": "Cashflow & Details",
  "scenarios": "Szenarien & Empfehlungen"
}
```

(b) Delete these now-dead key blocks from both files:
- the whole top-level `successCard` object
- `simulation.actionSummary` (whole object)
- `simulation.charts` (whole object — the wrapper card is gone; `AssetsChart` renders its own title)
- `planDashboard.title`, `planDashboard.description`, `planDashboard.health`, `planDashboard.metrics` (keep `planDashboard.notAvailable`, `planDashboard.cashflow`, `planDashboard.scenarios` — still used by CashflowCard/ScenarioList)

(c) Verify no code still references removed keys:

```bash
grep -rn "actionSummary\|successCard\|planDashboard.metrics\|charts.asset" src/ --include="*.tsx" --include="*.ts"
```

Expected: no matches (translation JSON hits excluded by the include filters once keys are removed).

- [ ] **Step 4: Verify the whole suite and the real app**

Run: `pnpm lint && npx tsc --noEmit && pnpm test`
Expected: all green.

Run: `pnpm build`
Expected: production build succeeds.

Then start the dev server and check both locales render (hero tiles, three tabs, tab switching, shortfall chart on Overview, warnings absent for defaults):

```bash
./dev.sh
# visit http://localhost:3000/en/simulation and /de/simulation
pnpm stop
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/simulation/page.tsx" src/i18n/messages/en.json src/i18n/messages/de.json src/components/ui/skeleton.tsx
git commit -m "feat: plan health hero and tabbed simulation dashboard"
```

---

### Task 10: E2E coverage and final verification

**Files:**
- Create: `tests/dashboard.spec.ts`

**Interfaces:**
- Consumes: the UI strings defined in Tasks 7–9 (`Health score`, tab names, `Recommendations`, the medianDepletion warning text) and the Zustand persist key `retirement-simulator-store` (persist version 0 — zustand default; verify none is set in `simulationStore.ts` before relying on it).

- [ ] **Step 1: Write the E2E tests**

Create `tests/dashboard.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.describe('simulation dashboard', () => {
  test('shows the plan health hero and tabbed content', async ({ page }) => {
    await page.goto('/en/simulation')

    // Hero tiles. NOTE: 'Success rate' needs exact matching — the sr-only live
    // region also contains the substring "Success rate:" and would otherwise
    // cause a strict-mode violation.
    await expect(page.getByText('Health score')).toBeVisible()
    await expect(page.getByText('Success rate', { exact: true })).toBeVisible()
    await expect(page.getByText('Assets last')).toBeVisible()

    // Tabs
    const overviewTab = page.getByRole('tab', { name: 'Overview' })
    await expect(overviewTab).toBeVisible()
    await expect(overviewTab).toHaveAttribute('data-state', 'active')

    await page.getByRole('tab', { name: 'Scenarios & advice' }).click()
    await expect(page.getByText('Recommendations', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Cashflow & details' }).click()
    await expect(page.getByRole('tab', { name: 'Cashflow & details' })).toHaveAttribute(
      'data-state',
      'active'
    )
  })

  test('surfaces warnings for a strained plan', async ({ page }) => {
    await page.addInitScript(() => {
      const params = {
        currentAge: 55,
        retirementAge: 60,
        legalRetirementAge: 67,
        endAge: 90,
        currentAssets: 10000,
        annualSavings: 0,
        annualSavingsGrowthRate: 0,
        monthlyPension: 0,
        oneTimeIncomes: [],
        averageROI: 0.03,
        roiVolatility: 0.15,
        averageInflation: 0.025,
        inflationVolatility: 0.01,
        capitalGainsTax: 26.25,
        customExpenses: [{ id: 'living', name: 'Living', amount: 3000, interval: 'monthly' }],
        withdrawalStrategy: 'vanguardDynamic',
        dsWithdrawalRate: 0.05,
        dsCeilingRate: 0.05,
        dsFloorRate: -0.025,
        simulationRuns: 200,
      }
      window.localStorage.setItem(
        'retirement-simulator-store',
        JSON.stringify({ state: { params, results: null, savedSetups: [] }, version: 0 })
      )
    })

    await page.goto('/en/simulation')

    await expect(page.getByText(/assets run out at age/i)).toBeVisible({ timeout: 20000 })
  })
})
```

- [ ] **Step 2: Run the E2E suite**

Run: `pnpm test:e2e`
Expected: PASS, including the pre-existing `tests/i18n.spec.ts`. If the persist `version` in the seeded localStorage doesn't match (warning test fails because defaults load instead of the strained params), check `simulationStore.ts` `persist` options for an explicit `version` and align the seeded JSON.

- [ ] **Step 3: Full verification sweep**

Run: `pnpm lint && npx tsc --noEmit && pnpm test && pnpm build && pnpm test:e2e`
Expected: everything green.

- [ ] **Step 4: Commit**

```bash
git add tests/dashboard.spec.ts
git commit -m "test: e2e coverage for plan health dashboard and warnings"
```

---

## Spec coverage map

| Spec section | Task(s) |
|---|---|
| §1 PlanHealthHero + warnings row | 4, 7, 9 |
| §2 Tabs (Overview / Details / Scenarios) | 5, 8, 9 |
| §2 Shortfall chart + depletion markers | 6 |
| §3 Engine `depletionByAge` | 2 |
| §4 Shared insights library | 3, 4 |
| §5 Removals (SuccessRateCard, PlanDashboard dissolved, Action Summary) | 9 |
| §6 i18n en/de | 6, 7, 8, 9 |
| §7 setupProgress housekeeping | 1 |
| Error handling (stale results, no depletion) | 2, 6, 7 (guards) |
| Testing (unit parity, depletion, warnings; E2E) | 2, 3, 4, 10 |
