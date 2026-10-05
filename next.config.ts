import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {
  // Allow isolated build/dev output directories (e.g. when several dev servers
  // run against the same checkout). Defaults to Next.js' standard `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Build id inlined into server *and* client bundles (`BUILD_ID` in
  // `src/lib/plans/schemaVersion.ts`): `/api/plans` reports the server's in a
  // header, and a tab whose bundle differs offers a reload. Empty locally.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA || '',
  },
  serverExternalPackages:['@sparticuz/chromium', 'puppeteer-core'],
  // Ensure the locally bundled report fonts are traced into the serverless
  // bundle for the PDF endpoint (they are read from disk at runtime).
  outputFileTracingIncludes: {
    '/api/generate-pdf': ['./src/lib/pdf-generator/react-pdf/fonts/*.ttf'],
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
