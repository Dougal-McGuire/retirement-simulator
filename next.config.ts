import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  // Ensure the locally bundled report fonts are traced into the serverless
  // bundle for the PDF endpoint (they are read from disk at runtime).
  outputFileTracingIncludes: {
    '/api/generate-pdf': ['./src/lib/pdf-generator/react-pdf/fonts/*.ttf'],
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
