import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
