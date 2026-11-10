'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { CalcChangeNotice } from '@/components/plans/CalcChangeNotice'
import { LocalSaveNotice } from '@/components/plans/LocalSaveNotice'
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
 * Notices about where the plans are (not) being stored. They need no session:
 * a tab can meet plans from a newer build, or a full localStorage, on a
 * deployment without sign-in just as well — so they are mounted either way.
 */
function StorageNotices() {
  return (
    <>
      <SyncReloadNotice />
      <LocalSaveNotice />
      <CalcChangeNotice />
    </>
  )
}

/**
 * When auth is unconfigured we deliberately do NOT mount `SessionProvider`:
 * it would poll `/api/auth/session`, which 404s, producing console noise and
 * pointless requests. `useAuthEnabled()` lets the UI render a disabled state
 * instead, and `useSession()` is only ever called beneath the real provider.
 */
export function AuthProvider({ enabled, cloudSync = false, children }: AuthProviderProps) {
  if (!enabled) {
    return (
      <AuthEnabledContext.Provider value={false}>
        <StorageNotices />
        {children}
      </AuthEnabledContext.Provider>
    )
  }

  return (
    <AuthEnabledContext.Provider value>
      <CloudSyncEnabledContext.Provider value={cloudSync}>
        {/* No refetch on window focus. Auth.js turns every failed session
            request into "signed out", and a tab coming back to the foreground
            (a laptop waking without network) is exactly when one fails. The
            session is read on load and whenever another tab signs in or out;
            a sign-out it reports is verified first — see `AuthStorageSync`. */}
        <SessionProvider refetchOnWindowFocus={false}>
          <AuthStorageSync />
          {/* Runs only once `AuthStorageSync` has settled the namespace, and only
              for a signed-in account — see `usePlanCloudSync`. */}
          <PlanCloudSync />
          <StorageNotices />
          {children}
        </SessionProvider>
      </CloudSyncEnabledContext.Provider>
    </AuthEnabledContext.Provider>
  )
}
