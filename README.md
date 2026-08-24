## Tech Stack

- Node.js 24.14.0, pnpm 10, TypeScript 5
- Next.js 16 (App Router) with Turbopack
- Tailwind CSS 4 + shadcn/ui
- zod, react-hook-form
- React PDF (`@react-pdf/renderer`) for report generation
- Jest + ts-jest for unit tests; Playwright for E2E

## Prerequisites

- Node.js 24.14.0 or newer on the Node 24 line (see `package.json#engines`)
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

## Google Authentication & Account Sync

Sign-in is powered by [Auth.js (next-auth v5)](https://authjs.dev) with the Google
provider and a **JWT session strategy** — there is no user database. Two separate
capabilities sit on top of it, and each is switched on by its own environment
variables:

| Capability | Needs | Effect |
| ---------- | ----- | ------ |
| **Sign-in** | `AUTH_SECRET` + Google client id/secret | Several Google accounts can share one browser, each with its own plans in a namespaced `localStorage` key. Device-local. |
| **Account sync** | the above **plus** `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Plans are additionally stored per Google account on the server and follow that account to every device and browser it signs in on. |

### Optional by design

Both switches degrade gracefully and independently:

- **Nothing configured** — the app builds, runs and tests exactly as before.
  `/api/auth/*` answers `404`, no session is ever fetched, and the sign-in
  control renders disabled with a "Sign-in not configured" tooltip.
- **Auth configured, no storage** — behaviour is exactly the pre-sync one:
  plans live in a per-account `localStorage` namespace on that device.
  `/api/plans` answers `501` once, the client stops asking for the rest of the
  session, and the account menu keeps showing the plain "Signed in" label.
- **Both configured** — plans sync, and the account menu shows a
  "Synced · just now" / "Syncing…" / "Offline (stored on this device)" line.

Signed **out** is untouched in every case: the anonymous workspace is
device-only and is never uploaded.

### Setup checklist — *Google-Konto-Sync einrichten*

Work through A, B and C, then redeploy. `<domain>` below is your production
domain, e.g. `retirement-simulator.vercel.app` or `plan.example.com`.

#### A. Google Cloud Console — the OAuth client

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
   and pick or create a project.
2. Configure the **OAuth consent screen** (External is fine). Only the
   `openid`, `email` and `profile` scopes are requested; no Google API access is
   needed. While the app is in *Testing*, add every Google account you want to
   sign in with as a **test user** — otherwise sign-in fails with `access_denied`.
3. **Create credentials → OAuth client ID → Web application.**
4. **Authorised JavaScript origins** — scheme + host, **no path, no trailing slash**:
   - `https://<domain>` ← the production domain
   - `http://localhost:3000` (only if you want local sign-in)
5. **Authorised redirect URIs** — must be exactly:
   - `https://<domain>/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (local only)
6. Copy the **client ID** and **client secret**; they go into block B.

#### B. Vercel — authentication variables

Project → **Settings → Environment Variables**, scope **Production** (see
[preview deployments](#vercel-preview-deployments) below):

| Variable | Value |
| -------- | ----- |
| `AUTH_SECRET` | output of `openssl rand -base64 32` (or `npx auth secret`) |
| `GOOGLE_CLIENT_ID` | from step A.6 |
| `GOOGLE_CLIENT_SECRET` | from step A.6 |
| `AUTH_TRUST_HOST` | `true` |

Stop here and redeploy if you only want per-account separation on one device.

#### C. Vercel — storage for the plans

1. Project → **Storage → Create Database → Upstash (Redis)** in the Vercel
   Marketplace (the free plan is far more than this needs — one JSON blob of a
   few kB per account), and connect it to the project.
2. The integration injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` into the
   project automatically. Confirm both appear under **Environment Variables**
   for **Production**.
3. Creating the database outside Vercel works too: set `KV_REST_API_URL` /
   `KV_REST_API_TOKEN` (or the equivalent `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`) by hand from the Upstash console's REST section.

#### Then: redeploy

The configured/unconfigured decision is resolved at build time, so
**changing any of these variables requires a redeploy** (Deployments → ⋯ →
Redeploy) before it takes effect.

Verify: sign in on device 1, create a plan, sign in with the *same* Google
account on device 2 — the plan is there, and the account menu reads
"Synced · just now".

### How sync behaves

- Storage is one JSON blob per account under the Redis key
  `plans:v1:<hash-of-account-id>` — the raw account id or e-mail never becomes a
  key. Blobs above 256 kB are rejected.
- Reconciliation is **last write wins per plan**, keyed on the plan's
  `updatedAt`: two devices editing *different* plans both keep their work; two
  devices editing the *same* plan keep whichever was saved last. There is no
  field-level merge and no conflict prompt.
- First sign-in on a device with local plans and an empty account **seeds** the
  account; a fresh device with an untouched workspace **adopts** the account's
  plans; otherwise the two sets are merged by plan id (capped at `MAX_PLANS`,
  oldest dropped first, never the plan you are looking at).
- Pushes are debounced ~2 s after a plan changes; pulls happen when the tab
  regains focus. Unsaved slider edits (the working copy) stay on the device
  until you save them into a plan.
- Every failure — offline, storage down, expired session — silently degrades to
  device-local behaviour and retries on the next change.

### Environment variables

| Variable               | Required | Notes                                                            |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| `AUTH_SECRET`          | for sign-in | Signs the session JWT. `openssl rand -base64 32` (or `npx auth secret`). |
| `GOOGLE_CLIENT_ID`     | for sign-in | OAuth 2.0 Web application client ID.                              |
| `GOOGLE_CLIENT_SECRET` | for sign-in | OAuth 2.0 client secret.                                          |
| `AUTH_TRUST_HOST`      | Vercel   | Set to `true` so Auth.js trusts the forwarded host. Needed for preview deployments, whose hostname is generated per build. |
| `AUTH_URL`             | rarely   | Explicit callback base, e.g. `https://your-app.vercel.app/api/auth`. Only needed behind a proxy that rewrites the host; leave unset otherwise. |
| `KV_REST_API_URL`      | for sync | Upstash Redis REST endpoint. Injected by the Vercel Marketplace integration. |
| `KV_REST_API_TOKEN`    | for sync | Upstash Redis REST token. Injected by the same integration. Server-only — never exposed to the browser. |

All three of `AUTH_SECRET`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be
present — any missing one keeps auth switched off. `NEXTAUTH_SECRET`,
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are accepted as aliases, as are
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` for the storage pair.
Sync additionally requires sign-in to be configured: storage without auth stays
switched off, because there is no account to store anything under.

### Local setup

```bash
cp .env.example .env.local
# fill in AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
# optionally add KV_REST_API_URL / KV_REST_API_TOKEN to exercise sync locally
pnpm dev
```

`.env.local` is git-ignored. `.env.example` is the only committed env file and
contains no secrets.

### Vercel preview deployments

Google does **not** support wildcards in redirect URIs, so the per-commit preview
hostnames (`your-app-git-<branch>-<team>.vercel.app`) cannot each be registered.
Pick one:

- **Leave auth off on previews** (the default and simplest): don't add the
  variables to the Preview environment. Previews then show the disabled
  sign-in control and everything else works — this is exactly what the graceful
  degradation is for.
- **Use a stable preview alias**: assign a fixed domain (e.g.
  `preview.your-domain.com`) to the preview branch, register only that redirect
  URI, and set `AUTH_URL=https://preview.your-domain.com/api/auth` plus
  `AUTH_TRUST_HOST=true` for the Preview environment.

In the Vercel dashboard add `AUTH_SECRET`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET` and `AUTH_TRUST_HOST=true` to **Production** (and to
Preview only if you took the stable-alias route). The pages are statically
rendered, so **redeploy after changing these variables** — the
configured/unconfigured decision is baked in at build time.

### Per-user local data

While signed in, the Zustand persistence keys gain a suffix derived from a
stable hash of the Google account id (`retirement-simulator-store::u-<hash>`),
so two accounts on one browser never see each other's plans. The raw account id
or e-mail never appears in a storage key. Signed out, the original unsuffixed
keys are used, so data created before sign-in existed is untouched. See
`src/lib/stores/persistenceKey.ts`.

This namespace remains the working copy even with sync switched on: the browser
is the source of truth and the server holds a mirror per account
(`src/lib/stores/planSync.ts`, `src/lib/server/planStore.ts`). Without storage
configured it is **device-local separation, not sync or security** — the data
lives in the browser and is not protected from anyone with access to it.

## PDF Generation

The active PDF route is `/api/generate-pdf`, which validates report payloads, maps them into report content, and renders the final document with React PDF.

The legacy HTML print route under `src/app/reports/[id]/print` is retained for older experiments and should not be treated as the primary PDF pipeline.
