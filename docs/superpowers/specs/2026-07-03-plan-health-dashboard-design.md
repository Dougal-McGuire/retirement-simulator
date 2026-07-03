# Plan Health Dashboard — Design Spec

**Date:** 2026-07-03
**Status:** Approved for planning
**Scope:** Reorganize the `/[locale]/simulation` dashboard to surface maximum decision-relevant information compactly: a persistent Plan Health hero strip plus a three-tab content area, unlocking the analytical logic currently exclusive to the PDF report.

## Problem

1. The richest planning insight (plan-health score, rule-based recommendations with uplift estimates, bridge analysis) exists only inside the PDF export (`src/lib/transformers/reportDataTransformer.ts`); the on-screen dashboard never shows it.
2. Three redundant tier displays stack vertically (`SuccessRateCard` 6-band tier, `PlanDashboard` strong/watch/strained badge, tier-based Action Summary bullets) — high scroll cost for one fact.
3. Decision-critical numbers are absent: no depletion age, no shortfall-probability-by-age, no ranked sensitivity, no inline warnings for unsustainable or inconsistent inputs.

## Design

### 1. `PlanHealthHero` (new component)

Replaces `SuccessRateCard`, the PlanDashboard health badge, and the Action Summary card. One always-visible band directly under the page header, above the tabs. Pure metrics — no advice (advice lives in the Scenarios & Advice tab).

Contents:

- **Plan health score (0–100)** with Strong / Moderate / Needs-Attention label — reuses the PDF scoring logic via the shared insights library (§4).
- **Success rate** (%) with tone color (existing thresholds: green ≥90, amber ≥75, red below).
- **"Assets last to age X"** — derived from existing asset percentiles: the first age where P10 (pessimistic) and P50 (median) reach zero; shown as "to age X (P10) / Y (median)" or "beyond plan horizon".
- **First-year withdrawal rate** (existing derivation in `planInsights.ts`).
- **Bridge years** (retirement → legal pension age).

**Warnings row** (conditional, below the metrics): rendered only when triggered, each a short one-liner with a warning icon:

- First-year withdrawal rate > 6%.
- Median (P50) assets deplete before `endAge`.
- Bridge period portfolio need exceeds assets at retirement (reuses PDF bridge analysis).
- Inconsistent ages (e.g. `retirementAge >= endAge`, `currentAge >= retirementAge`) — currently silently clamped.

Mobile: metrics wrap to two rows; warnings stack.

### 2. Tabbed content area

shadcn/Radix `Tabs` (stack already includes Radix). Three tabs; active tab is local UI state (not persisted). Default tab: Overview.

- **Overview** — `AssetsChart` (existing, plus depletion-age `ReferenceLine` markers for P10/P50 depletion when they occur) and a new compact **shortfall-by-age chart**: % of simulation runs already depleted at each age, retirement age onward. Follows the dataviz conventions of the existing charts (tooltips, ARIA, brush not required).
- **Cashflow & Details** — `SpendingChart` (existing), the cashflow block currently in `PlanDashboard` (first-year portfolio need, annual pension, real return, horizon median assets), and both collapsible data tables (existing).
- **Scenarios & Advice** — the existing 3 what-if scenario deltas, presented as a **ranked sensitivity list** (sorted by impact, as today, but framed as "which lever moves your plan most"), followed by **recommendation cards** from the shared insights library: title, impact tier (High/Med/Low), estimated success-rate uplift range, one-line rationale.

The shared brush sync between assets and spending charts becomes moot across tabs (they no longer render side by side); each chart keeps its own brush + reset. `SimulationChart.tsx` is decomposed accordingly: chart-data building moves to a shared hook/helper so both tabs consume the same computed series.

Layout otherwise unchanged: header hero, `ParameterSidebar` left column, PDF button, locale switcher, aria-live announcement all stay. Live parameter tweaks now always show their consequence in the fixed hero without scrolling.

### 3. Engine change (additive)

`runMonteCarloSimulation()` (`src/lib/simulation/engine.ts`) additionally returns:

```ts
// SimulationResults (src/types/index.ts)
depletionByAge: number[] // fraction of runs (0..1) with assets exhausted at or before ages[i]
```

Monotonically non-decreasing; `depletionByAge[last]` ≈ `1 − successRate/100`. Additive field — all existing consumers unaffected. Powers the shortfall-by-age chart; the hero's "lasts to age X" remains percentile-derived (works even with stale persisted results lacking the new field — the shortfall chart simply hides itself when `depletionByAge` is absent).

### 4. Shared insights library — `src/lib/insights/`

Extract from `src/lib/transformers/reportDataTransformer.ts`, without behavior change:

- `computePlanHealthScore()` (0–100 weighted score + label)
- `generateRecommendations()` (rule-based engine)
- `estimateRecommendationUplift()`
- bridge cash-need analysis

`reportDataTransformer.ts` re-imports from the new module so the PDF output is byte-identical. The existing `src/lib/simulation/planInsights.ts` derivations (withdrawal rate, bridge years, cashflow block) stay and are consumed by the hero/tabs; if overlap emerges during implementation, consolidate into `src/lib/insights/` as well.

New pure helper: `deriveDepletionAges(results)` → `{ p10DepletionAge: number | null, p50DepletionAge: number | null }`.

### 5. Removals

- `SuccessRateCard.tsx` — deleted (its animated counter / tier messaging is subsumed by the hero; salvage `AnimatedCounter` if reusable).
- Action Summary card in `simulation/page.tsx` — deleted (superseded by data-driven recommendations in Scenarios & Advice).
- `PlanDashboard.tsx` — dissolved: health badge → hero; metric tiles → hero; cashflow block → Details tab; what-if scenarios → Scenarios tab.

### 6. i18n

New keys in `src/i18n/messages/{en,de}.json`: `planHero.*` (metrics, labels, warnings), `simulationTabs.*` (tab labels), `shortfallChart.*`, `recommendations.*` (on-screen variants; PDF keys under `pdf.*` unchanged). German translations included, same register as existing copy.

### 7. Housekeeping (in flight)

Wire the already-extracted `parseSetupProgressStep` from `src/app/[locale]/setup/setupProgress.ts` into `setup/page.tsx`, removing the inline duplicate (lines ~31–53). Existing `setupProgress.test.ts` covers it.

## Error handling

- Persisted results without `depletionByAge`: shortfall chart hidden; everything else works. Next auto-run repopulates it.
- Depletion never occurs in P10/P50: hero shows "beyond plan horizon"; no depletion markers rendered.
- Zero/invalid inputs already clamped by the store; the warnings row surfaces the cases users must see instead of silently absorbing them.

## Testing

- Unit: `src/lib/insights/` extraction (score, recommendations, uplift, bridge) — assert parity with current transformer outputs; `deriveDepletionAges` edge cases (no depletion, depletion at first retirement year); engine `depletionByAge` (monotonic, consistent with successRate).
- Existing Jest suites (engine, transformer/PDF) must pass unchanged.
- E2E (Playwright): dashboard renders hero + three tabs; tab switching shows expected content; warnings row appears for an intentionally broken parameter set.

## Out of scope

- Tornado/one-at-a-time sensitivity beyond the existing 3 scenario levers (the ranked list reframes them; more levers can come later).
- Changes to the setup wizard flow, PDF layout, or landing/redirect behavior.
- Persisting the active tab.
