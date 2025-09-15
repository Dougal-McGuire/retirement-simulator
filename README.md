## Tech Stack

- Node.js 22, pnpm 10, TypeScript 5
- Next.js 15 (App Router) with Turbopack
- Tailwind CSS 4 + shadcn/ui
- zod, react-hook-form
- Puppeteer (core) + @sparticuz/chromium for PDF generation
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
```

To free port 3000 and start dev quickly:

```bash
./dev.sh
```

## PDF Generation (local)

The API route uses `puppeteer-core` locally. If Chromium is not auto-detected, set:

```bash
export CHROME_PATH=/usr/bin/chromium-browser
```

Vercel deployments use `@sparticuz/chromium` automatically.
