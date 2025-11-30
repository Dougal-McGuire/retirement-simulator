import createMiddleware from 'next-intl/middleware'
import { defaultLocale, localePrefix, locales } from './src/i18n/config'

export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix,
})

export const config = {
  // Exclude: api routes, _next internals, static files, and /reports (used for PDF generation)
  matcher: ['/((?!api|_next|reports|.*\\..*).*)'],
}
