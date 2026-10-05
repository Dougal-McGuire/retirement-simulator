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
- `pnpm format` - Format code with Prettier

### Testing

- `pnpm test` - Run Jest unit tests
- `pnpm test:watch` - Run Jest tests in watch mode
- `pnpm test:e2e` - Run Playwright E2E tests (config: `playwright.config.ts`, tests in `./tests`)

## Architecture

This is a Next.js 16 retirement planning simulator using React 19, TypeScript, and Tailwind CSS v4. The application uses a Monte Carlo simulation approach to model retirement scenarios with market volatility.

### Tech Stack

- **Framework**: Next.js 16 (App Router) with Turbopack
- **UI**: React 19, Tailwind CSS 4, shadcn/ui components (Radix UI)
- **State**: Zustand with localStorage persistence (namespaced per signed-in account)
- **Validation**: zod (API request bodies, report schema)
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
- **Reports**: `/api/generate-pdf` validates report data and renders PDFs with React PDF; the legacy `/reports/[id]/print` HTML route remains in the tree but is not the primary generation path
- **Auth & Cloud Sync**: Google sign-in (`src/auth.ts`, `src/lib/auth/env.ts`) and `/api/plans` (`src/lib/server/planStore.ts`, Upstash via `KV_REST_API_*` or `UPSTASH_REDIS_REST_*`) are both optional: without credentials the auth UI hides, `/api/plans` answers 501 and plans stay in localStorage
- **Plan schema guard**: every `/api/plans` request sends `x-plan-schema: PLAN_SCHEMA_VERSION` (`src/lib/plans/schemaVersion.ts`; no header = 1). A different version, or a stored blob newer than the server, gets `409 { error: 'outdated-client' | 'outdated-server' }` and nothing is read or written; the tab stops syncing (phase `outdated`) and `SyncReloadNotice` asks for a reload, while local edits keep working. The blob's `schemaVersion` is the highest version that wrote it. **Bump `PLAN_SCHEMA_VERSION` whenever the persisted plan shape gains a field (or meaning) that older code would misread, rewrite or drop** — e.g. `CashFlow.enabled` made it 2. Responses also carry `x-build-id` (`NEXT_PUBLIC_BUILD_ID` / `VERCEL_GIT_COMMIT_SHA`, inlined by `next.config.ts`); a different build only *suggests* a reload
- **Dark Mode**: `prefers-color-scheme` by default; an explicit choice sets `<html data-color-scheme>` before first paint. PDFs and the print route force light

### Key Routes

- `/[locale]/` - Landing page
- `/[locale]/setup` - Multi-step wizard for parameter input
- `/[locale]/simulation` - One-page workspace: sticky result bar (plan menu, success rate, save/discard) over five sections, `#result` (Ergebnis), `#assumptions` (Annahmen), `#cashflow` (Geldfluss), `#withdrawal` (Entnahme), `#levers` (Stellschrauben). Assumptions open in an edit panel (`#<section>:<panel>`, e.g. `#assumptions:market`); `#compare` is plan comparison as a page mode
- `/api/plans` - Account-scoped plan storage (GET/PUT, needs sign-in and a configured store)
- `/api/auth/[...nextauth]` - Auth.js handlers
- `/reports/[id]/print` - Legacy print-optimized report layout
- `/api/generate-pdf` - PDF generation endpoint using React PDF

### Simulation Flow

1. User inputs parameters via the setup wizard, the edit panel (Annahmen cards) or the levers (Stellschrauben)
2. `SimulationStore.updateParams()` triggers auto-run (debounced 100ms)
3. `runMonteCarloSimulation()` runs N simulations (default: 500) with lognormal market returns
4. Results include percentile data (P10, P20, P50, P80, P90) and success rate
5. The result bar and sections update live; charts show asset evolution, cash flows and the spending corridor
6. Auto-run can be suspended (the setup wizard does this while it is open)

### Simulation Phases

1. **Accumulation Phase** (current age → retirement age): Assets grow with ROI + annual savings
2. **Distribution Phase** (retirement age → end age): Assets deplete with expenses, pension income added

### State Management Details

- **Persistence**: Zustand middleware persists `plans`, `activePlanId`, `params`, `draftParams` and results to localStorage
- **Plans**: Up to 12 named plans (`MAX_PLANS`); one is active. Edits go to a working copy (`draftParams`, `isDirty`) until `savePlanDraft()` or `revertPlanDraft()`; switching plans with unsaved edits goes through `PlanSwitchGuard`
- **Cloud Sync**: When signed in and configured, `PlanCloudSync` merges local and remote plans (`src/lib/stores/planSync.ts`); a 409 from the schema guard stops sync for the page life (see "Plan schema guard")
- **Auto-run**: Parameter changes trigger simulation after 100ms (debounced)
- **Suspension**: Auto-run can be suspended with `setAutoRunSuspended()` (the setup wizard does)
- **Workspace UI state**: The open panel and compare mode are `WorkspaceProvider` state mirrored to the URL hash (reload and Back restore them), never persisted; `useWorkspaceUiStore` is a small unpersisted store for scroll state (active section, sticky geometry)
- **Saved Setups**: Legacy `savedSetups` is only a mirror of `plans` so old save/load calls keep working; plans are the source of truth

### PDF Generation

- **Primary Runtime**: `/api/generate-pdf` renders PDFs with React PDF and returns the binary directly
- **Validation**: Requests are validated with Zod before rendering
- **Legacy Path**: The HTML print page and related cache flow remain in the repo for reference, but they are not the active PDF pipeline

### Data Model

- **SimulationParams**: Demographics (ages), assets, income (savings, pension), expenses (monthly, annual), market assumptions (ROI, inflation, volatility, taxes)
- **SimulationResults**: Percentile data for assets and spending at each age, success rate
- **Plan**: Named `SimulationParams` snapshot with id and timestamps (`MAX_PLANS = 12`)
- **CashFlow**: one list of incomes, expenses and pensions (`params.cashFlows`); `enabled: false` keeps a flow in the plan but out of every calculation (`isCashFlowEnabled`, see `docs/specs/2026-09-28-flow-switches.md`)
- **DEFAULT_PARAMS**: Realistic German retirement scenario (see `src/types/index.ts`)

### Component Structure

- **UI Components**: shadcn/ui components in `src/components/ui/`
- **Workspace** (`src/components/workspace/`): the one-page `/simulation` UI
  - `WorkspaceProvider` + `useWorkspace()`: page API (sections, edit panel, compare mode); `useWorkspaceHash` (hash ↔ state, German aliases), `useScrollSpy` + `useWorkspaceUiStore` (active section), `useStickyOffset`, `usePanelMode`; pure rules in `workspaceNav.ts`
  - `ResultBar` (plan menu, KPIs, run status, save/discard, Cmd/Ctrl+S), `SectionIndex` (rail / chip row / bottom bar by width), `PlanMenu`, `PlanManagerDialog`, `EuroDisplay`
  - `sections/`: `ResultSection`, `AssumptionsSection`, `CashflowSection`, `WithdrawalSection`, `LeversSection` on a shared `WorkspaceSection`
  - `edit/`: `EditPanel` (Radix dialog, `modal={false}`: docked ≥1280, overlay 761–1279, bottom sheet on phones), code-split panel bodies, `focusField` for deep links
  - `levers/`: `QuickLevers`, `LeverImpactList`, `UncertainFlowsList` ("Unsichere Posten"), `useLeverMeasurements` / `useFlowMeasurements` (gated background runs sharing one queue)
  - Shared: `LazyMount` (mount near the viewport, `data-lazy-state`), `AnimatedNumber` (tweened numbers; tests read `data-value`), `Skeleton`
- **Plans**: Plan switcher, switch guard, name/scenario dialogs, withdrawal planner and `planSections.ts` (panel ids, field → panel) in `src/components/plans/`; the edit panel bodies are the groups in `src/components/plans/editor/` (`PersonalGroup`, `SavingsGroup`, `FlowsGroup`, `MarketGroup`, `shared.tsx`)
- **Compare and fan chart**: `CompareView`, `CompareFanChart`, `FanChartCard` and the Menu dialog (`DashboardTools`) in `src/components/simulation-compact/`
- **Auth**: Account menu, auth provider, cloud sync in `src/components/auth/`
- **Form Components**: Setup wizard fields and labeled inputs in `src/components/forms/`
- **Chart Components**: visualizations in `src/components/charts/`; `CashflowSankey` + `CashflowCard` (the "Aufstellung") share one expanded state and drill into flows via `src/lib/simulation/flowBreakdown.ts`
- **Report Components**: PDF report sections in `src/components/report/sections/`
- **Navigation**: Locale switcher, appearance switch, header controls menu, skip links in `src/components/navigation/`

### Copy & Register

- German UI copy uses informal "du" (lowercase du/dein). The PDF report (`src/lib/pdf-generator/**`, `src/components/report/**`) stays formal "Sie"; copy shared by both (e.g. `src/lib/insights/recommendations.ts`) is written without direct address
- `en.json` and `de.json` must keep identical key sets
