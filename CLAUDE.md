# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Prerequisites

- **Node.js**: 24.14.0 (`.nvmrc`; `engines` requires >= 24.14.0 < 25, CI uses 24.14.0)
- **Package Manager**: pnpm >= 10 (use `corepack enable` to activate)

## Commands

### Development

- `pnpm dev` - Start development server with Turbopack (http://localhost:3000)
- `pnpm build` - Build production version with Turbopack
- `pnpm start` - Start production server
- `./dev.sh` - Quick dev start script (kills port 3000, then starts dev server)
- `pnpm dev:clean` - Alternative to dev.sh using npm scripts
- `pnpm stop` - Kill process on port 3000

### Code Quality

- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Auto-fix ESLint issues
- `pnpm typecheck` - Type-check with `tsc --noEmit`
- `pnpm format` - Format code with Prettier (`pnpm format:check` reports drift; not enforced yet)

### Testing

- `pnpm test` - Run Jest unit tests (`pnpm test:coverage` also enforces the coverage floors in `jest.config.js`, as CI does)
- `pnpm test:watch` - Run Jest tests in watch mode
- `pnpm test:e2e` - Run Playwright E2E tests on Chromium (config: `playwright.config.ts`, tests in `./tests`). Starts its own `next dev` with placeholder OAuth env; reuses a server on :3000 only with `PW_REUSE=1`. `CI=1` builds and runs `next start` instead, with retries and an HTML report
- `pnpm test:e2e:webkit` - The same suite on an iPad WebKit profile (non-blocking in CI)

## Architecture

This is a Next.js 16.4 retirement planning simulator using React 19, TypeScript, and Tailwind CSS v4. The application uses a Monte Carlo simulation approach to model retirement scenarios with market volatility.

### Tech Stack

- **Framework**: Next.js 16 (App Router) with Turbopack
- **UI**: React 19, Tailwind CSS 4, shadcn/ui components (Radix UI)
- **State**: Zustand with localStorage persistence (namespaced per signed-in account)
- **Validation**: zod (API request bodies; the report schema in tests)
- **Charts**: Recharts for interactive visualizations; the cash-flow Sankey uses its own layout (`cashflowSankeyLayout.ts`) so item labels never collide
- **Auth / sync**: Auth.js (`next-auth` v5) with Google; optional cloud plan sync via Upstash Redis REST
- **Theming**: color-scheme tokens in `src/app/interface.css` (System/Light/Dark, `src/lib/colorScheme.ts`)
- **i18n**: next-intl (locales: en, de)
- **PDF**: React PDF (`@react-pdf/renderer`)
- **Testing**: Jest (unit) + Playwright (E2E)

### Core Architecture

- **State Management**: Zustand store (`src/lib/stores/simulationStore.ts`) with auto-persistence to localStorage and auto-run capability
- **Simulation Engine**: Monte Carlo simulation in `src/lib/simulation/engine.ts` using Box-Muller transform for lognormal distributions
- **Type Safety**: Comprehensive TypeScript interfaces in `src/types/index.ts`
- **Internationalization**: next-intl with locale routing (`/[locale]/...`), translations in `src/i18n/messages/{en,de}.json`
- **Reports**: the PDF is built **in the browser** — there is no report endpoint and no request carries plan data. `GenerateReportButton` lazy-loads `src/lib/pdf-generator/client/generateReportPdf.ts` on click; React PDF renders in a dedicated worker (`client/report.worker.ts`); the four font files are fetched from the app's own origin (`react-pdf/fontAssets.ts`). `src/i18n/__tests__/privacyClaims.test.ts` fails when browser code gains another sender
- **Proxy**: `src/proxy.ts` (Next 16's name for middleware; with `src/app` it must live in `src/`) does next-intl locale routing only: `/` and locale-less paths redirect by `NEXT_LOCALE` cookie / `Accept-Language`. `[locale]` has `dynamicParams = false`, so unknown locales 404
- **Security headers**: `next.config.ts` `headers()` (nosniff, referrer, frame, permissions, COOP, a nonce-free CSP; see DEPLOYMENT.md for why there is no `script-src`), checked by `tests/platform.spec.ts`
- **CI/CD**: `.github/workflows/vercel-deploy.yml` — `verify` (lint, typecheck, coverage, E2E against a production build) gates `deploy` (Vercel CLI, `vercel build` on the runner, `NEXT_PUBLIC_BUILD_ID` = commit, `x-build-id` smoke test); see DEPLOYMENT.md
- **Auth & Cloud Sync**: Google sign-in (`src/auth.ts`, `src/lib/auth/env.ts`) and `/api/plans` (`src/lib/server/planStore.ts`, Upstash via `KV_REST_API_*` or `UPSTASH_REDIS_REST_*`) are both optional: without credentials the auth UI hides, `/api/plans` answers 501 and plans stay in localStorage. Protocol: `docs/specs/2026-11-09-sync-protocol.md` — revisions (`x-plan-rev`, atomic compare-and-set in Redis, `412` on a stale write), deletion tombstones (`deletedPlans`), conflict copies instead of last-write-wins, `502` (never `blob: null`) when the store cannot be read, non-production keys prefixed with `VERCEL_ENV`. The UI flags are baked into the prerendered pages at build time; the production deploy fails if the pulled env lacks them (`scripts/check-deploy-env.mjs`)
- **Plan schema guard**: every `/api/plans` request sends `x-plan-schema: PLAN_SCHEMA_VERSION` (`src/lib/plans/schemaVersion.ts`; no header = 1). A different version, or a stored blob newer than the server, gets `409 { error: 'outdated-client' | 'outdated-server' }` and nothing is read or written; for `outdated-client` the tab stops syncing (phase `outdated`) and `SyncReloadNotice` asks for a reload; for `outdated-server` (a rollback) it pauses (phase `server-outdated`) and retries on focus; local edits keep working either way. The blob's `schemaVersion` is the highest version that wrote it. **Bump `PLAN_SCHEMA_VERSION` whenever the persisted plan shape gains a field (or meaning) that older code would misread, rewrite or drop** — e.g. `CashFlow.enabled` made it 2, the v3 sync protocol (`deletedPlans`, `rev`) made it 3. Responses also carry `x-build-id` (`NEXT_PUBLIC_BUILD_ID` / `VERCEL_GIT_COMMIT_SHA`, inlined by `next.config.ts`); a different build only *suggests* a reload
- **Dark Mode**: `prefers-color-scheme` by default; an explicit choice sets `<html data-color-scheme>` before first paint. PDFs are always light

### Key Routes

- `/[locale]/` - Landing page
- `/[locale]/setup` - Multi-step wizard for parameter input
- `/[locale]/simulation` - One-page workspace built so the result stays in view while everything is edited (`docs/specs/2026-11-10-result-in-view.md`): a 48 px bar (plan menu, draft state, save; € switch, PDF, Menü); the result canvas — the head `#result` (figures, fan chart with the saved plan as a ghost, change chips), `#cashflow` (Geldfluss), `#withdrawal` (Entnahme, the outcome), `#levers` (Wirkung); the dock (the head's collapsed form, pinned under the bar); and the control column with every input once, in five groups (`person`, `savings`, `flows`, `rule`, `market`). The column is a permanent pane from 1180 px, a drawer at 761–1179 and the mode "Stellen" on phones. Hashes are `#<target>[:<group>]`: `#assumptions` focuses the column, `#assumptions:market` opens a group, `#withdrawal` also opens `rule`; `#compare` is plan comparison as a page mode
- `/api/plans` - Account-scoped plan storage (GET/PUT, needs sign-in and a configured store)
- `/api/auth/[...nextauth]` - Auth.js handlers

### Simulation Flow

1. User inputs parameters via the setup wizard or the workspace's control column (a lever under Wirkung or a change chip's ✕ is the same kind of edit)
2. `SimulationStore.updateParams()` triggers auto-run (debounced 100ms)
3. `runMonteCarloSimulation()` runs N simulations (default: 500) with lognormal market returns
4. Results include percentile data (P10, P20, P50, P80, P90) and success rate
5. The head's figures and the dock update first, the charts and sections follow in a deferred render; charts show asset evolution, cash flows and the spending corridor
6. Auto-run can be suspended (the setup wizard does this while it is open)

### Simulation Phases

1. **Accumulation Phase** (current age → retirement age): Assets grow with ROI + annual savings
2. **Distribution Phase** (retirement age → end age): Assets deplete with expenses, pension income added

### State Management Details

- **Persistence**: Zustand `persist` stores every store field except run state and results (`TRANSIENT_FIELDS` in `simulationStore.ts`) — today `plans`, `planSuccessRates`, `activePlanId`, `params`, `draftParams`; a new field is persisted without being listed. Results are recomputed on load (the engine is seeded). The entry is written through `src/lib/stores/planStorage.ts`, which never throws (a failed write shows `LocalSaveNotice`), writes only when something stored changed, and stamps the entry with `PLAN_SCHEMA_VERSION`
- **Plans**: Up to 12 named plans (`MAX_PLANS`); one is active. Edits go to a working copy (`draftParams`, `isDirty`) until `savePlanDraft()` or `revertPlanDraft()`; switching plans with unsaved edits goes through `PlanSwitchGuard`
- **Cloud Sync**: When signed in and configured, `PlanCloudSync` merges local and remote plans (`src/lib/stores/planSync.ts`) plan by plan against the persisted sync base (`syncedPlanStamps`); `deletedPlans` holds deletion tombstones; nothing is pushed before a pull succeeded in the session; a 409 `outdated-client` from the schema guard stops sync for the page life (see "Plan schema guard")
- **Auto-run**: Parameter changes trigger simulation after 100ms (debounced)
- **Suspension**: Auto-run can be suspended with `setAutoRunSuspended()` (the setup wizard does)
- **Workspace UI state**: never persisted. Compare mode and the "linked" column group (the one opened last) are mirrored to the URL hash, so reload and Back restore them; `useWorkspaceUiStore` is a small unpersisted store for the rest (open groups, whether the column is unfolded, whether the dock is pinned, active section, sticky geometry), so toggling them does not re-render the page
- **Saved plan's result (ghost)**: the store keeps only the working copy's result. While the plan is dirty the saved plan's result comes from an in-memory cache keyed by `simulationFingerprint(params)` (`useSavedPlanResults`), filled from every result the store receives and, if missing, by one run on the shared background queue (`backgroundQueue.ts`: levers, uncertain items and this run, one at a time, only while idle). `buildDraftChanges` (`src/lib/simulation/draftChanges.ts`) lists what the draft changes, each entry with the patch that takes it back
- **Several tabs**: tabs share one localStorage entry. A `storage` listener (`syncFromOtherTabs`) and a look-before-write in `planStorage` merge the other tab's plans per plan (`mergePlanLists`, then `applySyncedPlans`) instead of overwriting them. The entry's session part (`activePlanId`, `params`, `draftParams`) is only written by the tab where it changed, so a background tab never replaces the draft of the tab being edited
- **Newer build's data**: an entry with a higher store version or plan-schema stamp than this build's is never migrated down or written over; the tab runs from it read-only in memory and raises the reload notice (`requestReload('required')`)
- **Session**: `SessionProvider` does not refetch on window focus, and `AuthStorageSync` only leaves an account's namespace once `/api/auth/session` itself answered 200 with no session (`src/lib/auth/sessionProbe.ts`); a failed request keeps the workspace and is retried
- **Calculation version**: `CALC_VERSION` (`src/lib/simulation/calcVersion.ts`) is stored next to `planSuccessRates`. **Bump it when an engine change gives a stored plan visibly different numbers** (it is not the plan schema: the plan is read as before). Rates remembered by an older version are set aside on load (`ratesBeforeCalcChange`) instead of being shown as current, and `CalcChangeNotice` explains the change once on `/simulation` (old and new rate of the open plan) until it is dismissed; update its copy (`plans.calcChange`) with the bump
- **Saved Setups**: gone from the store. Pre-plan setups (a v0 entry's `savedSetups`, or the `retirement-simulator-saved-setups` key) are only read, once, by the legacy import in `bootstrapPlans`; plans are the source of truth

### PDF Generation

- **Runtime**: the browser. Click → lazy chunk (`client/generateReportPdf.ts`) → the three stress levers are measured on the simulation worker (`src/lib/insights/leverEffects.ts`) → `transformToReportData` + `mapReportDataToContent` on the main thread → `pdf(<RetirementReport/>).toBlob()` in the report worker → download. The worker is released after a minute idle; without `Worker` the render falls back to the main thread
- **Numbers**: every statement about money moving (pension coverage, bridge need, first-year withdrawal rate, retirement spending, plan score) is read from the engine's ledger through `src/lib/insights/ledger.ts` — never re-derived from the inputs. The stress case ("Deckungslücke") comes from `depletionByAge`, not from the P10 balance reaching zero
- **Errors**: `ReportGenerationError` codes (`chunkLoad` | `fonts` | `render`) map to `report.errors.*` catalog messages; raw exception text is never shown
- **Tests**: `src/lib/pdf-generator/__tests__/renderReport.test.ts` renders the real document in a child Node process (Jest cannot load `@react-pdf/renderer`) and reads the text back; the Zod schema (`schema/reportData.ts`) is used by tests only

### Data Model

- **SimulationParams**: Demographics (ages), assets, income (savings, pension), expenses (monthly, annual), market assumptions (ROI, inflation, volatility, taxes)
- **SimulationResults**: Percentile data for assets and spending at each age, success rate
- **Plan**: Named `SimulationParams` snapshot with id and timestamps (`MAX_PLANS = 12`)
- **CashFlow**: one list of incomes, expenses and pensions (`params.cashFlows`); `enabled: false` keeps a flow in the plan but out of every calculation (`isCashFlowEnabled`, see `docs/specs/2026-09-28-flow-switches.md`)
- **DEFAULT_PARAMS**: Realistic German retirement scenario (see `src/types/index.ts`). The withdrawal rate (`dsWithdrawalRate`, default 4 %) is what the portfolio pays *on top of* pensions and other income (`docs/specs/2026-11-09-withdrawal-rules-with-income.md`). A change to the defaults needs the landing preview re-baked (`src/components/landing/preview-data.ts`, guarded by its test); the engine master in `engine-golden.test.ts` is frozen at its own parameter set

### Component Structure

- **UI Components**: shadcn/ui components in `src/components/ui/`
- **Workspace** (`src/components/workspace/`): the one-page `/simulation` UI
  - `WorkspaceProvider` + `useWorkspace()`: page API (`openEditor`, `toggleGroup`, `setColumnOpen`, `scrollToSection`, compare mode); `useWorkspaceHash` (hash ↔ state, German aliases), `useScrollSpy` + `useWorkspaceUiStore`, `useStickyOffset`, `usePanelMode` (`docked` ≥1180 / `drawer` 761–1179 / `sheet` ≤760); pure rules in `workspaceNav.ts`
  - `ResultBar` (plan menu, draft state, Verwerfen, "Speichern ▾", Cmd/Ctrl+S; € switch, PDF, Menü), `ResultDock` (pinned figures + `MiniFanChart`; one IntersectionObserver on the head's chart), `ResultFigures` (rate, end assets, deltas, run status — the surface in view carries the canonical test ids, the other one `head-`/`dock-`), `ChangeChips` (`ChangeRow` in the head, `ChangeMenu` in the dock), `SectionIndex` (`SectionAnchors` under the head, `ModeBar` "Ansehen │ Stellen" on phones), `Popover`, `PlanMenu`, `PlanManagerDialog`, `EuroDisplay`
  - `sections/`: `ResultHead`, `CashflowSection`, `WithdrawalSection` (the outcome), `LeversSection` (Wirkung) on a shared `WorkspaceSection`
  - `edit/`: `EditPanel` — the control column: an `<aside>` with five groups (`COLUMN_GROUPS`), sticky 56 px headers with a key figure (`useGroupSummaries`) and a dot for unsaved changes, several open at once, code-split bodies (`panelContent.tsx`), `focusField` for deep links, Escape back to what led in
  - `levers/`: `LeverImpactList`, `UncertainFlowsList` ("Unsichere Posten"), `useLeverMeasurements` / `useFlowMeasurements` (background runs gated on idleness, sharing one queue)
  - `useSavedPlanResults` (the ghost's result), `useDraftChanges` (chips, counts, group dots), `savedDelta.ts`
  - Shared: `LazyMount` (mount near the viewport, `data-lazy-state`), `AnimatedNumber` (tweened numbers; tests read `data-value`), `Skeleton`
- **Plans**: Plan switcher, switch guard, name/scenario dialogs and `planSections.ts` (the column's groups and their body ids) in `src/components/plans/`; `WithdrawalPlanner.tsx` holds both halves of Entnahme — `WithdrawalRuleGroup` (the rule, in the column) and `WithdrawalOutcome` (readouts, corridor, four-rule comparison, on the canvas); the other group bodies are in `src/components/plans/editor/` (`PersonalGroup`, `SavingsGroup`, `FlowsGroup`, `MarketGroup`, `shared.tsx`)
- **Compare and fan chart**: `CompareView`, `CompareFanChart`, `FanChartCard` (ghost, held value axis; geometry in `fanGeometry.ts`), `MiniFanChart` and the Menü dialog (`DashboardTools`) in `src/components/simulation-compact/`
- **Auth**: Account menu, auth provider, cloud sync in `src/components/auth/`
- **Form Components**: Setup wizard fields and labeled inputs in `src/components/forms/`
- **Chart Components**: visualizations in `src/components/charts/`; `CashflowSankey` + `CashflowCard` (the "Aufstellung") share one expanded state and drill into flows via `src/lib/simulation/flowBreakdown.ts`
- **Report Components**: PDF report document and sections in `src/lib/pdf-generator/react-pdf/`
- **Navigation**: Locale switcher, appearance switch, header controls menu, skip links in `src/components/navigation/`

### Copy & Register

- German UI copy uses informal "du" (lowercase du/dein). The PDF report (`src/lib/pdf-generator/**`) stays formal "Sie"; copy shared by both (e.g. `src/lib/insights/recommendations.ts`) is written without direct address
- `en.json` and `de.json` must keep identical key sets
