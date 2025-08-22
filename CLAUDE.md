# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start development server with Turbopack (runs on http://localhost:3000)
- `npm run build` - Build production version with Turbopack
- `npm start` - Start production server

### Testing
- `npm test` - Run Jest tests
- `npm run test:watch` - Run Jest tests in watch mode

## Architecture

This is a Next.js 15 retirement planning simulator using React 19, TypeScript, and Tailwind CSS v4. The application uses a Monte Carlo simulation approach to model retirement scenarios with market volatility.

### Core Architecture
- **State Management**: Zustand store with persistence for simulation parameters and results
- **Simulation Engine**: Monte Carlo simulation using Box-Muller transform for normal distributions in `src/lib/simulation/engine.ts`
- **Type Safety**: Comprehensive TypeScript interfaces defined in `src/types/index.ts`

### Key Components
- **Setup Wizard**: Multi-step form at `/setup` for collecting user parameters
- **Simulation Dashboard**: Interactive results display at `/simulation` with charts and controls
- **Real-time Updates**: Automatic simulation re-runs when parameters change (debounced 100ms)

### State Flow
1. User inputs parameters via setup wizard or parameter controls
2. `SimulationStore` manages state with auto-persistence to localStorage
3. Parameter changes trigger automatic simulation runs
4. Results include percentile data (P10, P50, P90) and success rates
5. Charts display asset evolution and spending projections over time

### Data Model
- **SimulationParams**: Complete parameter set including demographics, assets, expenses, and market assumptions
- **SimulationResults**: Percentile-based results with success rate calculations
- **Default Values**: Realistic German retirement scenario in `DEFAULT_PARAMS`

The simulation calculates two phases: accumulation (working years with ROI and savings) and distribution (retirement years with expenses, inflation, and pension income).