import createMiddleware from 'next-intl/middleware'
import type { NextRequest } from 'next/server'
import { defaultLocale, localePrefix, locales } from './src/i18n/config'
import { auth } from './src/auth'
import { isAuthConfigured } from './src/lib/auth/env'

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix,
})

/**
 * Locale routing always runs and always owns the response. When Google sign-in
 * is configured we additionally wrap it in Auth.js' `auth()` so the decoded JWT
 * session is attached to the request (`req.auth`) and available to any future
 * session-aware routing. No route is gated on a session today.
 *
 * Without OAuth credentials the wrapper is skipped entirely: NextAuth would
 * throw `MissingSecret` while decoding, which would 500 every single page.
 */
const handleRequest = (request: NextRequest) => intlMiddleware(request)

export default isAuthConfigured() ? auth(handleRequest) : handleRequest

export const config = {
  // Exclude: api routes (incl. /api/auth/*, handled by Auth.js itself), _next
  // internals, static files, and /reports (used for PDF generation)
  matcher: ['/((?!api|_next|reports|.*\\..*).*)'],
}
