import { existsSync, writeFileSync } from 'node:fs'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const altDistDir = process.env.NEXT_DIST_DIR

/**
 * Next.js appends `<distDir>/types` to the tsconfig it type-checks with. For
 * an alternate dist dir that would rewrite the committed tsconfig.json on
 * every start, so such a server gets its own gitignored tsconfig that only
 * extends the real one.
 */
function altTsconfigPath(distDir: string): string {
  const slug = distDir.replace(/^\.+/, '').replace(/[^a-zA-Z0-9-]+/g, '-')
  const file = `tsconfig.${slug}.json`
  if (!existsSync(file)) {
    writeFileSync(file, `${JSON.stringify({ extends: './tsconfig.json' }, null, 2)}\n`)
  }
  return file
}

/**
 * Sent on every response (pages, API routes, static files).
 *
 * The CSP only uses directives that need no per-request nonce. A `script-src`
 * policy would: the pages are statically prerendered and carry inline
 * bootstrap scripts (Next.js flight data, the colour-scheme init script),
 * which only a nonce or hash list could allow, and nonces force dynamic
 * rendering. See DEPLOYMENT.md "Security headers".
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'serial=()',
      'bluetooth=()',
      'hid=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
      'display-capture=()',
      'browsing-topics=()',
    ].join(', '),
  },
  // Google sign-in is a full-page redirect, so no opener is needed; keeping
  // popups allowed costs nothing should that ever change.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  {
    key: 'Content-Security-Policy',
    value:
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self' https://accounts.google.com",
  },
]

const nextConfig: NextConfig = {
  // Allow isolated build/dev output directories (e.g. when several dev servers
  // run against the same checkout). Defaults to Next.js' standard `.next`.
  ...(altDistDir
    ? { distDir: altDistDir, typescript: { tsconfigPath: altTsconfigPath(altDistDir) } }
    : {}),
  // Build id inlined into server *and* client bundles (`BUILD_ID` in
  // `src/lib/plans/schemaVersion.ts`): `/api/plans` reports the server's in a
  // header, and a tab whose bundle differs offers a reload. Empty locally.
  // The deploy workflow builds on the GitHub runner (`vercel build`), where
  // VERCEL_GIT_COMMIT_SHA does not exist: it sets NEXT_PUBLIC_BUILD_ID, and
  // GITHUB_SHA is the fallback for any other Actions build.
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.NEXT_PUBLIC_BUILD_ID ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      '',
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
