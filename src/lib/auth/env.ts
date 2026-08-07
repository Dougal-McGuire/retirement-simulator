/**
 * Auth environment resolution.
 *
 * Google sign-in is an *optional* capability: local dev, CI and preview deploys
 * routinely run without OAuth secrets. Every auth code path funnels through
 * `isAuthConfigured()` so the app degrades to its pre-auth behaviour instead of
 * crashing when the variables are absent.
 *
 * No secret value is ever exported to the client — only the boolean flag is.
 */

export interface GoogleCredentials {
  clientId: string
  clientSecret: string
}

const readEnv = (value: string | undefined): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Auth.js signing secret. `AUTH_SECRET` is the v5 name, `NEXTAUTH_SECRET` the legacy alias. */
export function getAuthSecret(): string | null {
  return readEnv(process.env.AUTH_SECRET) ?? readEnv(process.env.NEXTAUTH_SECRET)
}

/** Google OAuth client credentials, or `null` when either half is missing. */
export function getGoogleCredentials(): GoogleCredentials | null {
  const clientId = readEnv(process.env.GOOGLE_CLIENT_ID) ?? readEnv(process.env.AUTH_GOOGLE_ID)
  const clientSecret =
    readEnv(process.env.GOOGLE_CLIENT_SECRET) ?? readEnv(process.env.AUTH_GOOGLE_SECRET)

  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/**
 * True only when Auth.js can actually complete a sign-in. Callers must treat a
 * `false` result as "hide / disable the auth UI and never touch NextAuth".
 */
export function isAuthConfigured(): boolean {
  return Boolean(getAuthSecret()) && getGoogleCredentials() !== null
}

/** Names of the env vars still missing — used for a dev-only console hint. */
export function missingAuthEnvVars(): string[] {
  const missing: string[] = []
  if (!getAuthSecret()) missing.push('AUTH_SECRET')
  const clientId = readEnv(process.env.GOOGLE_CLIENT_ID) ?? readEnv(process.env.AUTH_GOOGLE_ID)
  const clientSecret =
    readEnv(process.env.GOOGLE_CLIENT_SECRET) ?? readEnv(process.env.AUTH_GOOGLE_SECRET)
  if (!clientId) missing.push('GOOGLE_CLIENT_ID')
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET')
  return missing
}
