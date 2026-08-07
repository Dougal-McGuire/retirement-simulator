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

## Google Authentication

Sign-in is powered by [Auth.js (next-auth v5)](https://authjs.dev) with the Google
provider and a **JWT session strategy** — there is no database. Signing in is
purely about identity: it lets several Google accounts share one browser while
keeping separate plans and parameters in `localStorage`.

### Optional by design

Authentication is **entirely optional**. With none of the environment variables
set the app builds, runs and tests exactly as before; `/api/auth/*` answers
`404`, no session is ever fetched, and the sign-in control renders disabled with
a "Sign-in not configured" tooltip. Local dev, CI and secret-less preview
deployments therefore need no setup at all.

### Environment variables

| Variable               | Required | Notes                                                            |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| `AUTH_SECRET`          | yes      | Signs the session JWT. `openssl rand -base64 32` (or `npx auth secret`). |
| `GOOGLE_CLIENT_ID`     | yes      | OAuth 2.0 Web application client ID.                              |
| `GOOGLE_CLIENT_SECRET` | yes      | OAuth 2.0 client secret.                                          |
| `AUTH_TRUST_HOST`      | Vercel   | Set to `true` so Auth.js trusts the forwarded host. Needed for preview deployments, whose hostname is generated per build. |
| `AUTH_URL`             | rarely   | Explicit callback base, e.g. `https://your-app.vercel.app/api/auth`. Only needed behind a proxy that rewrites the host; leave unset otherwise. |

All three of `AUTH_SECRET`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be
present — any missing one keeps auth switched off. `NEXTAUTH_SECRET`,
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are accepted as aliases.

### Local setup

```bash
cp .env.example .env.local
# fill in AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
pnpm dev
```

`.env.local` is git-ignored. `.env.example` is the only committed env file and
contains no secrets.

### Creating the Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
   pick or create a project.
2. Configure the **OAuth consent screen** (External is fine). Only the
   `openid`, `email` and `profile` scopes are requested; no Google API access is
   needed. While the app is in *Testing*, add each Google account you want to
   sign in with as a test user.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
4. **Authorised JavaScript origins** (scheme + host, no path):
   - `http://localhost:3000`
   - `https://your-app.vercel.app`
   - `https://your-custom-domain.com` (if any)
5. **Authorised redirect URIs** (must end in `/api/auth/callback/google`):
   - `http://localhost:3000/api/auth/callback/google`
   - `https://your-app.vercel.app/api/auth/callback/google`
6. Copy the client ID and secret into your env vars.

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

Note that this is **device-local separation, not sync or security** — the data
still lives in the browser and is not protected from anyone with access to it.

## PDF Generation

The active PDF route is `/api/generate-pdf`, which validates report payloads, maps them into report content, and renders the final document with React PDF.

The legacy HTML print route under `src/app/reports/[id]/print` is retained for older experiments and should not be treated as the primary PDF pipeline.
