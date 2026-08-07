'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { BASE_STORE_KEY, setActiveAuthUserId, storageKey } from '@/lib/stores/persistenceKey'

/**
 * The store's pristine, pre-hydration state. Captured once at module load so
 * switching into an empty namespace resets whatever fields the store happens to
 * define today — no hard-coded field list to drift against the store's shape.
 */
const pristineState = useSimulationStore.getInitialState()

/**
 * Keeps the Zustand persistence key in sync with the signed-in account.
 *
 * Renders nothing. Mounted only inside the auth-enabled branch of
 * `AuthProvider`, so an unconfigured deployment never runs any of this and
 * keeps writing to the original, unsuffixed keys.
 */
export function AuthStorageSync() {
  const { data: session, status } = useSession()
  const appliedKeyRef = useRef<string | null>(null)

  // Prefer Google's opaque account id; fall back to e-mail for the rare token
  // that carries no `sub`. Either way only its hash reaches localStorage.
  const accountId = session?.user?.id ?? session?.user?.email ?? null

  useEffect(() => {
    if (status === 'loading') return

    setActiveAuthUserId(status === 'authenticated' ? accountId : null)
    const nextKey = storageKey(BASE_STORE_KEY)

    if (appliedKeyRef.current === nextKey) return

    const isFirstResolution = appliedKeyRef.current === null
    appliedKeyRef.current = nextKey

    // Signed out on first paint: the store is already pointed at the base key
    // and has hydrated normally. Nothing to do.
    if (isFirstResolution && nextKey === BASE_STORE_KEY) return

    const store = useSimulationStore.persist
    if (!store) return

    store.setOptions({ name: nextKey })

    // Always drop the previous account's in-memory state before rehydrating.
    // Resetting unconditionally (rather than only for an empty namespace) means
    // no field can survive the switch — including ones the store derives rather
    // than persists, such as `savedSetups`. `rehydrate()` then loads the new
    // namespace and re-runs the store's own `onRehydrateStorage` normalisation.
    useSimulationStore.setState({ ...pristineState })

    void Promise.resolve(store.rehydrate()).then(() => {
      const state = useSimulationStore.getState()
      if (!state.results && !state.isLoading) {
        void state.runSimulation()
      }
    })
  }, [accountId, status])

  return null
}
