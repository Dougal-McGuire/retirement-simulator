# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Prerequisites

- **Node.js**: >= 22 (< 23)
- **Package Manager**: pnpm >= 10 (use `corepack enable` to activate)
- **Chrome/Chromium**: Required for local PDF generation (see PDF Generation section)

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
- `pnpm format` - Format code with Prettier

### Testing

- `pnpm test` - Run Jest unit tests
- `pnpm test:watch` - Run Jest tests in watch mode
- `npx playwright test` - Run Playwright E2E tests (config: `playwright.config.ts`, tests in `./tests`)

## Architecture

This is a Next.js 15 retirement planning simulator using React 19, TypeScript, and Tailwind CSS v4. The application uses a Monte Carlo simulation approach to model retirement scenarios with market volatility.

### Tech Stack

- **Framework**: Next.js 15 (App Router) with Turbopack
- **UI**: React 19, Tailwind CSS 4, shadcn/ui components (Radix UI)
- **State**: Zustand with localStorage persistence
- **Forms**: react-hook-form + zod validation
- **Charts**: Recharts for interactive visualizations
- **i18n**: next-intl (locales: en, de)
- **PDF**: Puppeteer-core + @sparticuz/chromium
- **Testing**: Jest (unit) + Playwright (E2E)

### Core Architecture

- **State Management**: Zustand store (`src/lib/stores/simulationStore.ts`) with auto-persistence to localStorage and auto-run capability
- **Simulation Engine**: Monte Carlo simulation in `src/lib/simulation/engine.ts` using Box-Muller transform for lognormal distributions
- **Type Safety**: Comprehensive TypeScript interfaces in `src/types/index.ts`
- **Internationalization**: next-intl with locale routing (`/[locale]/...`), translations in `src/i18n/messages/{en,de}.json`

### Key Routes

- `/[locale]/` - Landing page
- `/[locale]/setup` - Multi-step wizard for parameter input
- `/[locale]/simulation` - Results dashboard with interactive charts and parameter controls
- `/reports/[id]/print` - Print-optimized report layout (for PDF generation)
- `/api/generate-pdf` - PDF generation endpoint using Puppeteer

### Simulation Flow

1. User inputs parameters via setup wizard or parameter controls
2. `SimulationStore.updateParams()` triggers auto-run (debounced 100ms)
3. `runMonteCarloSimulation()` runs N simulations (default: 500) with lognormal market returns
4. Results include percentile data (P10, P20, P50, P80, P90) and success rate
5. Charts display asset evolution and spending projections over time
6. Auto-run can be suspended during interactions (e.g., chart brushing)

### Simulation Phases

1. **Accumulation Phase** (current age → retirement age): Assets grow with ROI + annual savings
2. **Distribution Phase** (retirement age → end age): Assets deplete with expenses, pension income added

### State Management Details

- **Persistence**: Zustand middleware persists params and savedSetups to localStorage
- **Auto-run**: Parameter changes trigger simulation after 100ms (debounced)
- **Suspension**: Auto-run can be suspended (e.g., during chart interactions) with `setAutoRunSuspended()`
- **Saved Setups**: Up to 10 named parameter sets can be saved/loaded

### PDF Generation

- **Local Development**: Requires Chrome/Chromium installed. Set `CHROME_PATH` env var if not auto-detected (e.g., `export CHROME_PATH=/usr/bin/chromium-browser`)
- **Production/Vercel**: Uses `@sparticuz/chromium` automatically
- **Process**: API route renders `/reports/[id]/print` with Puppeteer, waits for `window.__REPORT_READY__`, generates PDF
- **Cache**: Report data stored temporarily in memory cache with UUID token

### Data Model

- **SimulationParams**: Demographics (ages), assets, income (savings, pension), expenses (monthly, annual), market assumptions (ROI, inflation, volatility, taxes)
- **SimulationResults**: Percentile data for assets and spending at each age, success rate
- **DEFAULT_PARAMS**: Realistic German retirement scenario (see `src/types/index.ts:142`)

### Component Structure

- **UI Components**: shadcn/ui components in `src/components/ui/`
- **Form Components**: Parameter controls and labeled inputs in `src/components/forms/`
- **Chart Components**: Recharts-based visualizations in `src/components/charts/`
- **Report Components**: PDF report sections in `src/components/report/sections/`
- **Navigation**: Locale switcher, skip links, parameter sidebar in `src/components/navigation/`
