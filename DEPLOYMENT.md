# Deployment

The app is deployed to Vercel by GitHub Actions (`.github/workflows/vercel-deploy.yml`). Vercel's own Git integration is switched off (`vercel.json`: `git.deploymentEnabled: false`), so nothing reaches Vercel without passing the gate below.

## Pipeline

```
push to main / PR to main
  ├─ verify          lint · typecheck · unit tests (coverage floors) · prod-deps audit (informational)
  │                  · E2E against a production build (`next build` + `next start`, Chromium)
  │                  · E2E render-isolation spec against `next dev`
  │                  · Playwright report + traces uploaded as an artifact (14 days)
  ├─ webkit          E2E on iPad WebKit, production build — informational, never blocks
  ├─ deploy          needs verify; pushes and same-repo PRs only (fork PRs get no secrets)
  │                  vercel pull → env check → vercel build → vercel deploy --prebuilt
  │                  main: --prod, then smoke test of x-build-id · PRs: preview + one updated PR comment
  └─ report-failure  main only: opens (or comments on) one "Production deploy blocked" issue
```

- **Retries**: in CI each E2E test gets two retries. A flaky test no longer blocks production; one that fails three times does. The retry records a trace (`trace: on-first-retry`), failures a screenshot.
- **When it fails on main**, production keeps the previous deployment. The `report-failure` job opens an issue titled `Production deploy blocked: <sha>` with the commit and run link, or comments on the open one. Download the `playwright-report-*` artifact from the run and open `playwright-report/index.html` (`pnpm exec playwright show-report <dir>`); traces are under `test-results/`. Close the issue once a later push deploys.
- **Concurrency**: one run per ref. A new push to a PR cancels the older run; runs on `main` always finish.
- **Vercel CLI** is pinned (`VERCEL_CLI_VERSION` in the workflow). Dependabot does not see it; bump it by hand.

## Build id

`NEXT_PUBLIC_BUILD_ID` is inlined into server and client bundles (`next.config.ts`) and sent by `/api/plans` as `x-build-id`; a tab whose bundle differs offers a reload. The deploy job sets it to the deployed commit (a PR's head SHA). Fallbacks: `VERCEL_GIT_COMMIT_SHA` (Vercel's builders), `GITHUB_SHA` (other Actions builds), else empty. After a production deploy the workflow requests `/api/plans` and fails if `x-build-id` is not the commit.

## Auth and cloud sync are fixed at build time

The locale pages are prerendered, so whether the sign-in control and cloud sync are on (`isAuthConfigured()` / `isCloudStoreConfigured()` in `src/app/[locale]/layout.tsx`) is decided by the env `vercel pull` fetched, while `/api/auth` and `/api/plans` read the runtime env. To keep the two from drifting, the production deploy runs `scripts/check-deploy-env.mjs --require` on `.vercel/.env.production.local` and fails unless `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or their aliases) are non-empty. Previews only log what they bake in. Changing these variables in Vercel needs a new deploy.

(Resolving the flags per request would avoid this, but makes every page dynamic.)

## Required settings

GitHub → Settings → Secrets and variables → Actions:

| Name | Kind | Purpose |
| --- | --- | --- |
| `VERCEL_TOKEN` | secret | Vercel access token (vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | secret | Vercel team id (`.vercel/project.json` after `vercel link`, or team settings) |
| `VERCEL_PROJECT_ID` | secret | Vercel project id (same file, or project settings) |
| `PRODUCTION_URL` | variable, optional | Public URL for the post-deploy smoke test, e.g. `https://example.com`; without it the deployment URL is used, which Vercel's deployment protection may answer with 401 |
| `DEPLOY_REQUIRE_AUTH` / `DEPLOY_REQUIRE_CLOUD_STORE` | variable, optional | `false` lets production deploy deliberately without sign-in / cloud sync |

Vercel → Project → Settings → Environment Variables (Production, and Preview if previews should sign in): `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_TRUST_HOST=true` (previews), `KV_REST_API_URL`, `KV_REST_API_TOKEN` (see `.env.example`). If the env check reports a variable as empty although it is set, it may be marked "Sensitive", which `vercel pull` can return empty.

The workflow's `report-failure` job needs Issues enabled on the repository.

## Security headers

`next.config.ts` sends on every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, a `Permissions-Policy` that denies camera, microphone, geolocation, payment and similar, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, and `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self' https://accounts.google.com`. `X-Powered-By` is off. `tests/platform.spec.ts` checks them on `/de` and `/api/plans`.

There is deliberately **no `script-src` / `default-src` CSP**: the pages are statically prerendered and contain inline scripts (Next.js bootstrap and flight data, the colour-scheme init script in `src/app/layout.tsx`). Allowing them needs a per-request nonce, and nonces force dynamic rendering of every page. Revisit if the pages become dynamic anyway.

Anonymous page responses set no cookies. The only exception is next-intl's `NEXT_LOCALE` preference cookie, set when the URL's locale differs from the browser language (e.g. an English browser opening `/de`). Auth.js cookies only appear on `/api/auth/*`.

## Routing

`src/proxy.ts` (Next.js 16 "proxy", formerly middleware; with `src/app` it must live in `src/`) redirects locale-less paths (`/`, `/simulation`) to `/de/…` or `/en/…` by `NEXT_LOCALE` cookie or `Accept-Language`. Only `en` and `de` exist (`dynamicParams = false`); any other first segment is a 404.

## Dependency notes

- `next-auth` is pinned to `5.0.0-beta.32`. Auth.js v5 has not left beta and now gets mostly maintenance; a security fix may mean a jump to a newer beta, and the exit path is a move to another library (the Auth.js project points to Better Auth). Watch its advisories; Dependabot ignores it.
- Majors deliberately not taken yet: ESLint 10, TypeScript 7, `lucide-react` 1.x, `@vercel/analytics` 2.x.
- `pnpm-workspace.yaml` holds `overrides` for transitive packages whose parents pin vulnerable releases; drop each once `pnpm why <name>` shows the parent moved on.
