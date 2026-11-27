import { locales } from '@/i18n/config'

/**
 * Query flag that keeps a signed-in visitor on the landing page. Without it
 * an authenticated session is forwarded straight to the dashboard — the
 * marketing page has nothing new to tell someone who already has a plan.
 */
export const STAY_ON_LANDING_PARAM = 'stay'

/** Where a returning (signed-in) visitor is sent, below the locale prefix. */
export const DASHBOARD_PATH = '/simulation'

/**
 * Auth.js v5 session cookie names: `__Secure-` on HTTPS, plain on http
 * (localhost); a large JWT is split into `.0`, `.1`, …
 */
const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?$/

/**
 * Whether the request carries an Auth.js session cookie. Only its presence is
 * known here — the proxy does not decode the JWT — so an expired cookie also
 * counts. That is harmless: the workspace works signed out, and the client
 * session check then shows the visitor as signed out.
 */
export function hasSessionCookie(cookieNames: Iterable<string>): boolean {
  for (const name of cookieNames) if (SESSION_COOKIE.test(name)) return true
  return false
}

/** `'de'` for `/de` or `/de/`, `null` for anything else (the landing page's paths). */
export function landingLocale(pathname: string): string | null {
  const match = /^\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  return (locales as readonly string[]).includes(match[1]) ? match[1] : null
}
