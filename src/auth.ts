import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { getGoogleCredentials, isAuthConfigured } from '@/lib/auth/env'

const googleCredentials = getGoogleCredentials()

/**
 * Auth.js (next-auth v5) instance.
 *
 * There is no database in this project, so sessions are JWT-only. When the
 * OAuth credentials are absent the instance is still constructed (so imports
 * never throw) but registers zero providers — callers gate on
 * `isAuthConfigured()` and must not invoke `auth()`/`handlers` in that case.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: googleCredentials
    ? [
        Google({
          clientId: googleCredentials.clientId,
          clientSecret: googleCredentials.clientSecret,
          // Only identity is needed; no Google APIs are called on the user's behalf.
          authorization: {
            params: { scope: 'openid email profile', prompt: 'select_account' },
          },
        }),
      ]
    : [],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, profile }) {
      // `sub` is Google's stable, opaque account id. Persist it once at sign-in
      // so the client can namespace local data without ever seeing the e-mail.
      if (profile?.sub) {
        token.sub = profile.sub
      }
      return token
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      return session
    },
    /**
     * Redirect hardening: only ever hand control back to this deployment.
     * Anything cross-origin (or unparseable) collapses to the app root, so a
     * crafted `callbackUrl` cannot turn sign-in into an open redirect.
     */
    redirect({ url, baseUrl }) {
      if (url.startsWith('/') && !url.startsWith('//')) {
        return `${baseUrl}${url}`
      }
      try {
        if (new URL(url).origin === baseUrl) return url
      } catch {
        // fall through to baseUrl
      }
      return baseUrl
    },
  },
})

export { isAuthConfigured }
