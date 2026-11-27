import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, localePrefix, locales } from './i18n/config'
import {
  DASHBOARD_PATH,
  STAY_ON_LANDING_PARAM,
  hasSessionCookie,
  landingLocale,
} from './lib/auth/landingForward'

const intl = createMiddleware({
  locales,
  defaultLocale,
  localePrefix,
})

/**
 * Locale routing (Next.js "proxy", formerly middleware). With an `src/app`
 * directory the file has to live in `src/`; a root `proxy.ts` /
 * `middleware.ts` is ignored by `next dev` and only half-picked up by builds.
 *
 * Locale-less paths (`/`, `/simulation`) redirect to `/<locale>/…`, chosen
 * from the `NEXT_LOCALE` cookie (set only when someone switches language) or
 * `Accept-Language`.
 *
 * A visitor with an Auth.js session cookie who opens the landing page (`/`,
 * `/<locale>`, without `?stay`) is sent on to `/<locale>/simulation` here,
 * before any HTML: forwarding only in the browser (`ReturningUserForward`,
 * kept as the fallback) showed the landing page until the JS had loaded and
 * `/api/auth/session` had answered — seconds after a deploy. Only the
 * cookie's presence is read; nothing here calls Auth.js, which used to set
 * `authjs.*` cookies on every (otherwise cacheable) page response.
 */
export default function proxy(request: NextRequest) {
  const response = intl(request)
  const { nextUrl } = request
  if (
    nextUrl.searchParams.has(STAY_ON_LANDING_PARAM) ||
    !hasSessionCookie(request.cookies.getAll().map((cookie) => cookie.name))
  ) {
    return response
  }

  // `/de`: straight to the dashboard, keeping what next-intl set (cookies).
  const locale = landingLocale(nextUrl.pathname)
  if (locale) {
    const target = nextUrl.clone()
    target.pathname = `/${locale}${DASHBOARD_PATH}`
    const forward = NextResponse.redirect(target, 307)
    response.headers.getSetCookie().forEach((cookie) => forward.headers.append('set-cookie', cookie))
    return forward
  }

  // `/`: next-intl picked the locale and redirects to `/<locale>`; point that
  // redirect at the dashboard instead, so there is one hop, not two.
  const location = response.headers.get('location')
  if (location) {
    const target = new URL(location, request.url)
    const redirectedLocale = landingLocale(target.pathname)
    if (redirectedLocale) {
      target.pathname = `/${redirectedLocale}${DASHBOARD_PATH}`
      response.headers.set('location', target.toString())
    }
  }
  return response
}

export const config = {
  // Skip API routes (incl. /api/auth/*, handled by Auth.js itself), Next.js
  // internals and anything with a file extension (static assets).
  matcher: ['/((?!api|_next|.*\\..*).*)'],
}
