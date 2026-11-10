# Contributing

`CLAUDE.md` describes the architecture and conventions; `DEPLOYMENT.md` the CI/CD pipeline.

## Setup

- Node 24 (`.nvmrc`), pnpm 10 (`corepack enable`)
- `pnpm install`
- `pnpm dev` — Turbopack dev server on :3000

## Before you push

CI runs the same steps (`.github/workflows/vercel-deploy.yml`); a red `verify` job blocks the deploy.

```bash
pnpm lint
pnpm typecheck
pnpm test            # or pnpm test:coverage: also enforces the coverage floors CI uses
pnpm test:e2e        # Playwright, Chromium
```

### E2E tests

- `pnpm test:e2e` starts its own `next dev` on :3000 with placeholder Google OAuth env, so the auth specs run the signed-in code path (nothing reaches Google).
- It refuses to reuse a server already listening on :3000: one started without that env would make the auth specs skip silently. To reuse your own running server on purpose, set `PW_REUSE=1`.
- `CI=1 pnpm test:e2e` mirrors CI: it builds and runs `next start`, retries failures twice and writes `playwright-report/` and traces to `test-results/`. `tests/perf-render.spec.ts` needs the development build and skips there; run it with `CI=1 PW_DEV_SERVER=1 pnpm test:e2e tests/perf-render.spec.ts`.
- `pnpm test:e2e:webkit` runs the suite on an iPad WebKit profile (`pnpm exec playwright install webkit` first). CI runs it as a non-blocking job.
- A pre-installed Chromium can be used with `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome`.
- The accessibility checks in `tests/flow-switches.spec.ts` use the `axe-core` devDependency (`AXE_CORE_PATH` overrides it).

## Pull requests

1. Branch from `main`, keep changes focused, add or adjust tests next to the code (`__tests__/` or `*.test.ts`) and in `tests/` for E2E.
2. Open a PR with the template. Same-repo PRs get a Vercel preview; its URL is kept up to date in one PR comment.
3. Don't commit stray files: `make deploy` and the improvement loop refuse untracked files outside `src/`, `tests/`, `public/`, `docs/`, `scripts/` and `.github/` (`scripts/check-untracked.sh`), and `make deploy` asks for `CONFIRM=1`.

## Style

- TypeScript strict, 2-space indent, single quotes, no semicolons; `@/*` imports for `src/*`
- Components in PascalCase; primitives in `src/components/ui` lowercase
- German UI copy uses "du"; the PDF report uses "Sie" (see `CLAUDE.md`)
- `pnpm format:check` reports Prettier drift (not enforced yet)
