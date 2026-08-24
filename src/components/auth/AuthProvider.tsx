'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { AuthStorageSync } from './AuthStorageSync'
import { PlanCloudSync } from './PlanCloudSync'

/**
 * Whether this deployment has Google OAuth credentials. Resolved on the server
 * (see `isAuthConfigured()`), handed down once and constant for the page life,
 * so the conditional `SessionProvider` below never remounts.
 */
const AuthEnabledContext = createContext(false)

export function useAuthEnabled(): boolean {
  return useContext(AuthEnabledContext)
}

interface AuthProviderProps {
  enabled: boolean
  children: ReactNode
}

/**
 * When auth is unconfigured we deliberately do NOT mount `SessionProvider`:
 * it would poll `/api/auth/session`, which 404s, producing console noise and
 * pointless requests. `useAuthEnabled()` lets the UI render a disabled state
 * instead, and `useSession()` is only ever called beneath the real provider.
 */
export function AuthProvider({ enabled, children }: AuthProviderProps) {
  if (!enabled) {
    return <AuthEnabledContext.Provider value={false}>{children}</AuthEnabledContext.Provider>
  }

  return (
    <AuthEnabledContext.Provider value>
      <SessionProvider>
        <AuthStorageSync />
        {/* Runs only once `AuthStorageSync` has settled the namespace, and only
            for a signed-in account — see `usePlanCloudSync`. */}
        <PlanCloudSync />
        {children}
      </SessionProvider>
    </AuthEnabledContext.Provider>
  )
}
