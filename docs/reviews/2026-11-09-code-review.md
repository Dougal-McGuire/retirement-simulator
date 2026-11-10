# Code review, November 2026

Full review of the retirement simulator at `f1beaf3` (main), in four dimensions
plus a review of the last commit. Every finding marked **confirmed** was
reproduced with a throwaway test, a browser probe or tool output; the rest come
from reading the code.

Status column: the fix lane that owns the finding (see "Fix lanes" at the end).
Nothing here is on `main` until the owner approves a merge.

## Summary

| Area | Blocker | Major | Minor / nit |
|---|---|---|---|
| Simulation engine and finance logic | 0 | 8 | 14 |
| State, sync, API, security | 1 | 8 | 16 |
| UI code, accessibility, performance | 0 | 8 | 21 |
| Tests, tooling, CI/CD, docs | 0 | 6 | 22 |
| Last commit (compare, sync guard) | 0 | 3 | 7 |

The ten that matter most:

1. **Cloud data can be wiped by one failed read.** A failed Upstash read is
   answered as "empty account"; the client then overwrites the account with its
   local plans. (S1, confirmed)
2. **Dynamic withdrawal rules ignore pension income.** Vanguard (the default),
   Guyton-Klinger and percent-of-portfolio apply the rate to total household
   spending, so they cut spending far below what the pension alone pays. The
   default plan's ~95 % success rate is an artefact of that; with fixed spending
   the same plan is at ~59 %. (E1, confirmed)
3. **The privacy claims are false.** "Ohne Anmeldung verlassen deine Daten nie
   diesen Browser": the PDF export posts the whole plan to the server. (S7,
   confirmed)
4. **Deleted plans come back, and tabs overwrite each other.** No tombstones in
   the merge; no cross-tab handling in local storage. (S3, S4, confirmed)
5. **Expired and out-of-horizon flows are pulled back into the plan** instead of
   being ignored, e.g. an inheritance at 52 when the user is 55. (E2, confirmed)
6. **No error boundary anywhere.** Any render or chunk error replaces the app
   with Next's English error page, permanently if the cause is persisted state.
   (U1, confirmed)
7. **Help tooltips never open on touch devices**, the owner's main device
   class. (U6, confirmed)
8. **A flaky E2E test silently blocks production deploys**: production stayed on
   an old commit for 6.6 days. The gate also tests `next dev`, not the bundle
   that ships. (T1, T4, confirmed)
9. **`next@16.1.6` and friends carry 5 critical / 36 high advisories.** (T2)
10. **Two PDF statements are wrong by construction**: "the pension covers 95 %
    of the budget" (gross nominal vs. today's euros; the real residual is ~9×
    larger) and the "expected effect on the success rate" table (a formula that
    contradicts the measured levers). (E5, E6, confirmed)

## Simulation engine and finance logic

| Id | Sev. | Where | Defect | Status |
|---|---|---|---|---|
| E1 | major | `engine.ts` ~550, ~589, ~1004 | Dynamic withdrawal rules apply the rate to total spending and net income only afterwards; with a pension they cut spending far too much (Vanguard median 5,242 → 3,946 €/month at 80; GK P10 2,178 at 67 with 1.18 M € left). | engine |
| E2 | major | `engine.ts` ~688-718, `cashFlows.ts` ~811 | Flow windows and one-off ages are clamped into the horizon instead of dropped: past tuition, a past roof repair, a past inheritance and care after the horizon are all booked. | engine |
| E3 | major | `cashFlows.ts` ~329, ~805; `engine.ts` ~967 | A lifetime expense with a growth rate or a fixed-nominal flag is charged during working years (growth 0.0001 on one item: 94.95 % → 78.7 %). Two predicates define "budget". | engine |
| E4 | major | `engine.ts` ~660-718, `planInsights.ts` ~79 | Results can be permanently "stale" because `results.params` is the normalised copy; levers then never measure and the report is withheld. | engine |
| E5 | major | `pdf-generator/insights/keyFindings.ts` ~29, ~149 | "Pension covers 95 %" compares the gross nominal pension with the today's-euro budget. | pdf |
| E6 | major | `insights/recommendations.ts` ~240, PDF `Recommendations.tsx` ~284 | "Expected effect on the success rate" is a formula, captioned as a model estimate, contradicting measured levers (+13–17 pp vs +2.5 pp). | pdf |
| E7 | major | `cashFlows.ts` ~850, ~880 | A one-off taxed as ordinary income is taxed in the year after booking; 100 k at 66 pays 41,302 instead of 30,864. | engine |
| E8 | major | `engine.ts` ~661, ~712 | A pension already in payment gets today's cohort (84 % taxable instead of 72 %). | engine |
| E9 | minor | `cashFlows.ts` ~886 | Two one-fifth lump sums in one year are taxed separately (15,700 vs 36,045). | engine |
| E10 | minor | recommendations, transformer, planInsights, planHealth | "First-year withdrawal rate" computed four ways with mixed units (3.7 %, 7.0 %, 6.4 %). | pdf |
| E11 | minor | `insights/planHealth.ts` ~40 | PDF plan score has a constant placeholder component and contradicts the dashboard band. | pdf |
| E12 | minor | `insights/bridge.ts` ~73, `keyFindings.ts` ~119 | Bridge need and bridge years use different end points; a small early pension makes the need "0 €". | pdf |
| E13 | minor | `reportTypes.ts` ~413 | "Total horizon need" counts working years. | pdf |
| E14 | minor | `workerClient.ts` ~29-93 | One worker error stalls all later runs; no fallback. | engine |
| E15 | minor | `engine.ts` ~1050, `spendingCorridor.ts` ~253 | Spending percentiles show requested, not funded spending; depleted paths look fully funded. | engine |
| E16 | minor | `spendingCorridor.ts` ~57 | The corridor ceiling excludes scheduled flows; the median can sit above it. | engine |
| E17 | minor | `cashFlows.ts` ~843, ~883 | The tax base mixes nominal pension euros with today's-euro income (over-tax 14 % → 37 %). | engine |
| E18 | minor | `engine.ts` ~936, ~1101; PDF `Results.tsx` ~55 | Index i is the closing balance of age i but deflated by the opening price level; the PDF "Today" row shows 716,768 for 630,000 entered. | engine, pdf |
| E19 | minor | `engine.ts` ~1065 | Success means "balance > 0": pension = budget with no assets is 0 %, one euro less is 100 %. | engine |
| E20 | minor | `types/index.ts` ~565, ~569; `germanTax.ts` | Default capital-gains rate 26.25 (should be 26.375); default taxable pension share is the 2024 cohort for a 2038 pension; the tariff has no year switch. | engine |
| E21 | minor | `engine.ts` ~856 | Today's portfolio is assumed to carry no unrealised gain; undocumented. | pdf (limits) |
| E22 | nit | various | Copy ("more than 51 % equity", "cannot be exhausted"), no run-count clamp, one-off at `endAge` dropped, `messageerror` unhandled. | engine, pdf |

Checked and sound: random numbers and common random numbers, percentile
interpolation, the ledger identity on 45 edge plans, capital-gains gross-up with
allowance and partial exemption, the § 32a 2026 tariff incl. splitting and the
one-fifth rule, the pension cohort tables, the historical series, glide path,
`flowBreakdown` totals, worker ordering and stale-result discard.

## State, sync, API, security

| Id | Sev. | Where | Defect | Status |
|---|---|---|---|---|
| S1 | **blocker** | `server/planStore.ts` ~169, `api/plans/route.ts` ~142, `planSync.ts` ~131 | A failed store read is served as "empty account"; the client then overwrites the cloud. | sync |
| S2 | major | `PlanCloudSync.tsx` ~105-209, `route.ts` ~151 | The client pushes without ever having pulled; PUT is an unconditional replace. | sync |
| S3 | major | `planSync.ts` ~168 | Deleted plans come back (union merge, no tombstones). | sync |
| S4 | major | `simulationStore.ts` ~670 | Tabs overwrite each other's plans in localStorage; an older build downgrades the stored shape. | local |
| S5 | major | `AuthProvider.tsx` ~47, `AuthStorageSync.tsx` ~116 | One failed session refetch swaps the workspace to the anonymous one, and it stays. | local |
| S6 | major | `plans.ts` ~7, `planSync.ts` ~168 | Every device's first plan is `plan-base`; first sync silently discards one. | sync |
| S7 | major | i18n ~57, ~71, ~114, ~150; `GenerateReportButton.tsx` ~77 | The privacy claims are false: the PDF export posts params, results and plan name. | pdf |
| S8 | major | `api/generate-pdf/route.ts`, `schema/reportData.ts` | Unauthenticated, unbounded CPU sink (a 440 KB body rendered for 4.1 minutes). | pdf (route removed) |
| S9 | major | `package.json` | 76 advisories in production dependencies (5 critical, 36 high); no audit in CI. | infra |
| S10 | minor | `next.config.ts` ~11, workflow ~69 | `x-build-id` is never sent in production (`VERCEL_GIT_COMMIT_SHA` only exists on Vercel's builders). | infra |
| S11 | minor | `simulationStore.ts` ~260, `planSync.ts` ~173 | A device whose clock runs ahead wins every merge. | sync |
| S12 | minor | `planSync.ts` ~88, ~189 | Different selected plans on two devices rewrite the blob on every focus. | sync |
| S13 | minor | `simulationStore.ts` ~544, ~265 | A throwing `localStorage.setItem` escapes from store actions (`isLoading` stuck). | local |
| S14 | minor | `simulationStore.ts` ~718 | Results (56–134 KB) are persisted with the plans and rewritten ~4× per edit. | local |
| S15 | minor | `plans.ts` ~194 | Without the legacy-import marker a lone `plan-base` is rebuilt. | local |
| S16 | minor | `ExamplePlanButton.tsx` ~48, `PlanSwitcher.tsx` ~119 | Two paths drop an unsaved draft without the switch guard. | local |
| S17 | minor | `PlanCloudSync.tsx` ~175 | A debounced push is lost on sign-out or tab close. | sync |
| S18 | minor | `middleware.ts` ~24 | Runs in production but not in dev/E2E; its `auth()` wrapper sets cookies on every cached page. | infra |
| S19 | minor | `[locale]/layout.tsx` ~41, `planStore.ts` ~90 | Auth/sync flags are baked at build time; the Redis key has no environment prefix. | infra, sync |
| S20 | minor | `[locale]/layout.tsx` ~19 | Arbitrary paths create ISR cache entries. | infra |
| S21 | minor | `next.config.ts`, `vercel.json` | No security headers at all. | infra |
| S22 | minor | `app/reports/[id]/print` | The legacy print route is live and unauthenticated. | infra (deleted) |
| S23 | minor | workflow | Production deploys can land out of order (no concurrency group); CLI unpinned; token on the command line. | infra |
| S24 | nit | stores | Dead store API (`saveSetup`, `loadFromStorage`, …), duplicated helpers. | local |

From the last-commit review: `push`/`reconcile` re-check only `cancelled`, not
`stopped`; `outdated-server` is handled like `outdated-client`; every PUT does a
full-blob GET to read one integer (all: sync).

Checked and sound: `/api/plans` authorisation (account id only from the session
JWT), the schema-guard order, open-redirect probes, cookies and CSRF, the inline
scripts, PDF content sources, logging, namespace switching, hydration.

## UI code, accessibility, performance

| Id | Sev. | Where | Defect | Status |
|---|---|---|---|---|
| U1 | major | no `error.tsx` anywhere | No error boundary; persisted malformed results crash every reload. | ui |
| U2 | major | `simulation/page.tsx` ~95, `useWorkspaceHash.ts` ~104, `setup/page.tsx` ~138 | Both app routes crash when web storage is unavailable. | ui |
| U3 | major | `ResultBar.tsx` ~274, `LeverImpactList.tsx` ~295 | Keyboard focus drops to `<body>` after Save, Discard and "Übernehmen". | ui |
| U4 | major | `ui/toast.tsx` ~20 | The undo toast is effectively unavailable to keyboard users (8 s, pauses only on hover). | ui |
| U5 | major | CSS | Focused controls are hidden behind sticky chrome (no `scroll-padding`). | ui |
| U6 | major | `ui/info-tip.tsx` ~50, `LabeledNumberInput.tsx` ~258 | Help tooltips never open on touch devices. | ui |
| U7 | major | `CashFlowList.tsx` ~275, ~351, ~468 | The cash-flow form silently throws away invalid input. | ui |
| U8 | major | `WithdrawalPlanner.tsx` ~10 | Recharts (160 KB gzip, 37 % of first-load JS) is loaded for one below-the-fold chart. | ui |
| U9 | minor | `GenerateReportButton.tsx` ~94 | Report errors show "[object Object]" or raw exception text. | pdf |
| U10 | minor | `[locale]/layout.tsx` ~34 | The whole message catalog (83 KB) is inlined into every page; 612 of 1,600 keys are unreferenced. | cleanup |
| U11 | minor | `ResultBar.tsx` ~168, `EditPanel.tsx` ~130 | Every auto-run is announced to screen readers. | ui |
| U12 | minor | `CompareView.tsx` ~113 | Compare mode runs each plan after the first twice. | compare |
| U13 | minor | `ws-page.css` ~1580 | At 400 % zoom the phone sheet leaves 40 px for the form. | ui |
| U14 | minor | `EuroDisplay.tsx` ~17 | `role="radio"` without the radio keyboard pattern. | ui |
| U15 | minor | `WithdrawalPlanner.tsx` ~662, fan charts | Several controls share identical accessible names. | ui |
| U16 | minor | `app/layout.tsx` ~7 | English, identical page titles on `/simulation` and `/setup`. | ui |
| U17 | minor | `simulation-compact/format.ts`, 16 files | Money and delta formatting hard-coded and inconsistent ("pp" vs "Pkt."). | ui, compare |
| U18 | minor | four files | Flow-period wording exists four times and has drifted. | compare |
| U19 | minor | `globals.css` ~217-322 | 75 `!important` rules rewrite Tailwind utilities; 58 dead class selectors. | ui |
| U20 | minor | `eslint.config.mjs` | ESLint enforces only `semi` and `quotes`. | cleanup |
| U21 | minor | `components/report/**` | The legacy print pipeline is still shipped (20 files). | infra |
| U22 | minor | `CashFlowList.tsx` ~287 | `<input type="month">` is a silent no-op on desktop Safari and Firefox. | ui |
| U23 | minor | `CashflowCard.tsx` ~93 | Hovering the Sankey re-renders the whole card incl. a 600-cell table. | ui |
| U24-29 | nit | various | Refs written during render, missing plural, heading order in the wizard, dead animation classes, breakpoint drift (767 vs 760). | ui, compare |

Checked and sound: axe (WCAG 2.0–2.2 A/AA) reports 0 violations on the workspace
in light and dark at four widths and in all four panels; no horizontal overflow
at 320 px anywhere; no hydration warnings; no rules-of-hooks violations; typing
latency p90 144 ms at 4× CPU throttle.

## Tests, tooling, CI/CD, docs

| Id | Sev. | Where | Defect | Status |
|---|---|---|---|---|
| T1 | major | `playwright.config.ts`, workflow | One flaky E2E blocks production and nobody is told (no retries, no notification). | infra |
| T2 | major | `package.json` | See S9. | infra |
| T3 | major | `next.config.ts` ~32, workflow ~69 | See S10. | infra |
| T4 | major | `playwright.config.ts` ~10 | The deploy gate tests `next dev`, not the production build. | infra |
| T5 | major | `eslint.config.mjs` ~38 | ESLint enforces almost nothing (probe: 11 exhaustive-deps, 5 floating promises, 8 a11y errors). | cleanup |
| T6 | major | `pdf-generator/react-pdf/**` | The PDF renderer has no real test (the route test mocks the renderer). | pdf |
| T7 | minor | workflow | A CI failure leaves no evidence (no reporter, trace or artifact). | infra |
| T8 | minor | workflow | One job for everything, write token on PR code, no concurrency or timeout, deprecated action runtimes. | infra |
| T9 | minor | `playwright.config.ts` | Chromium only while the main user is on iPad Safari; WebKit is feasible (117/139 pass untuned). | infra |
| T10 | minor | `flow-switches.spec.ts` ~441 | The four axe tests never run in CI. | infra |
| T11 | minor | Prettier | Not enforced; `pnpm format` would rewrite the lockfile. | infra, cleanup |
| T12 | minor | `package.json` | Unused or misplaced dependencies (`puppeteer-core`, `@sparticuz/chromium`, `vega`, `vega-lite`, `commander`, `@openai/codex`). | infra |
| T13 | minor | `jest.config.js` | No coverage floor; UI covered only through Playwright. | infra |
| T14 | minor | `tsconfig.json` | Cheap strictness flags off (`noImplicitReturns`, `noUnusedLocals`, …). | cleanup |
| T15 | minor | root docs | README, DEPLOYMENT, ACCESSIBILITY, AGENTS are stale. | infra |
| T16 | minor | repo root | Stray tracked files (`build.log`, `scratchpad.txt`, `sanitize_node.sh`, …). | infra |
| T17 | minor | `Makefile` ~17, ~27 | `make deploy` and the improvement loop `git add -A` and push straight to main. | infra |
| T18 | minor | `package.json` ~51 | `next-auth` pinned to a v5 beta that never went stable. | noted |
| T19-28 | nit | various | `reuseExistingServer` adopts any server on :3000; hard-coded schema version in a spec; unseeded randomness in one statistical test; golden values without a regenerate script; dead build-info pipeline; ignore gaps. | infra |

Coverage today: `src/lib/simulation` 96 % lines, `src/lib/stores` 90 %,
`src/lib/pdf-generator` 29 %, components 2–33 % (Playwright only). 1,051 unit
tests, 140 E2E tests.

## Fix lanes

Each lane works in its own worktree with regression tests for every finding.

| Lane | Scope |
|---|---|
| engine | Withdrawal rules with income, funded spending, success definition, horizon handling, expense classification, staleness, one-off taxation, tax units, deflator, constants, worker recovery. |
| sync | Discriminated store reads, pull-before-push with compare-and-set, tombstones, conflict copies, clock skew, flush on hide, schema version 3. |
| local | Cross-tab storage listener, schema stamp and write guard, session-refetch handling, storage errors, results out of the persisted blob, dead store API. |
| compare | Flow matching, own-terms comparison, statutory pension row, one matcher, one window label, compare re-runs. |
| ui | Error boundaries, storage-less mode, focus management, toasts, scroll padding, touch help, form validation, lazy Recharts, announcers, zoom, names, metadata, one money hook, `globals.css` cleanup. |
| infra | Workflow restructure, retries and notification, production-build gate, build id, dependency upgrades and removals, security headers, proxy, legacy print route removal, docs, stray files. |
| pdf | PDF rendered in the browser (route removed, privacy claims made true), corrected key findings, measured lever effects, one withdrawal-rate definition, honest plan score, bridge and horizon need, real render tests. |
| cleanup (after merge) | ESLint rules and their hits, Prettier pass, catalog pruning, strictness flags, directory renames. |
