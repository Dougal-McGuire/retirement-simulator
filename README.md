## Tech Stack

- Node.js 22, pnpm 10, TypeScript 5
- Next.js 16 (App Router) with Turbopack
- Tailwind CSS 4 + shadcn/ui
- zod, react-hook-form
- React PDF (`@react-pdf/renderer`) for report generation
- Jest + ts-jest for unit tests; Playwright for E2E

## Prerequisites

- Node.js >= 22 (see `package.json#engines`)
- pnpm >= 10 (`corepack enable` recommended)

## Development

```bash
pnpm dev        # Start dev server (Turbopack)
pnpm build      # Production build
pnpm start      # Serve the production build
pnpm test       # Run unit tests
pnpm test:e2e   # Run Playwright E2E (auto-starts local app)
```

To free port 3000 and start dev quickly:

```bash
./dev.sh
```

## PDF Generation

The active PDF route is `/api/generate-pdf`, which validates report payloads, maps them into report content, and renders the final document with React PDF.

The legacy HTML print route under `src/app/reports/[id]/print` is retained for older experiments and should not be treated as the primary PDF pipeline.
