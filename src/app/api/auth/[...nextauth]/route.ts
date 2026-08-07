import { handlers } from '@/auth'
import { isAuthConfigured } from '@/lib/auth/env'

/**
 * Auth.js route handler.
 *
 * Without OAuth credentials NextAuth would throw `MissingSecret` on every
 * request, so the unconfigured deployment answers a plain 404 instead — the
 * client treats that as "sign-in unavailable" and the app keeps working.
 */
const notConfigured = () =>
  Response.json({ error: 'Sign-in is not configured for this deployment.' }, { status: 404 })

export const GET = isAuthConfigured() ? handlers.GET : notConfigured
export const POST = isAuthConfigured() ? handlers.POST : notConfigured
