import createMiddleware from 'next-intl/middleware'
import { defaultLocale, localePrefix, locales } from './i18n/config'

/**
 * Locale routing (Next.js "proxy", formerly middleware). With an `src/app`
 * directory the file has to live in `src/`; a root `proxy.ts` /
 * `middleware.ts` is ignored by `next dev` and only half-picked up by builds.
 *
 * Locale-less paths (`/`, `/simulation`) redirect to `/<locale>/…`, chosen
 * from the `NEXT_LOCALE` cookie (set only when someone switches language) or
 * `Accept-Language`. Nothing here touches Auth.js: no route is gated on a
 * session, and wrapping this in `auth()` used to set `authjs.*` cookies on
 * every (otherwise cacheable) page response.
 */
export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix,
})

export const config = {
  // Skip API routes (incl. /api/auth/*, handled by Auth.js itself), Next.js
  // internals and anything with a file extension (static assets).
  matcher: ['/((?!api|_next|.*\\..*).*)'],
}
