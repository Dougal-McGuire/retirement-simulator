'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { AuthStorageSync } from './AuthStorageSync'
import { PlanCloudSync } from './PlanCloudSync'
import { SyncReloadNotice } from './SyncReloadNotice'

/**
 * Whether this deployment has Google OAuth credentials. Resolved on the server
 * (see `isAuthConfigured()`), handed down once and constant for the page life,
 * so the conditional `SessionProvider` below never remounts.
 */
const AuthEnabledContext = createContext(false)

export function useAuthEnabled(): boolean {
  return useContext(AuthEnabledContext)
}

/** Whether signed-in plans are stored server-side (Upstash configured). */
const CloudSyncEnabledContext = createContext(false)

export function useCloudSyncEnabled(): boolean {
  return useContext(CloudSyncEnabledContext)
}

interface AuthProviderProps {
  enabled: boolean
  cloudSync?: boolean
  children: ReactNode
}

/**
 * When auth is unconfigured we deliberately do NOT mount `SessionProvider`:
 * it would poll `/api/auth/session`, which 404s, producing console noise and
 * pointless requests. `useAuthEnabled()` lets the UI render a disabled state
 * instead, and `useSession()` is only ever called beneath the real provider.
 */
export function AuthProvider({ enabled, cloudSync = false, children }: AuthProviderProps) {
  if (!enabled) {
    return <AuthEnabledContext.Provider value={false}>{children}</AuthEnabledContext.Provider>
  }

  return (
    <AuthEnabledContext.Provider value>
      <CloudSyncEnabledContext.Provider value={cloudSync}>
        <SessionProvider>
          <AuthStorageSync />
          {/* Runs only once `AuthStorageSync` has settled the namespace, and only
              for a signed-in account — see `usePlanCloudSync`. */}
          <PlanCloudSync />
          <SyncReloadNotice />
          {children}
        </SessionProvider>
      </CloudSyncEnabledContext.Provider>
    </AuthEnabledContext.Provider>
  )
}
