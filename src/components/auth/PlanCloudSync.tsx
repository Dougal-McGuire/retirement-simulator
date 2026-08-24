'use client'

import { useEffect } from 'react'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { isPristineWorkspace } from '@/lib/stores/authMigration'
import {
  fetchRemoteSnapshot,
  mergePlanSnapshots,
  pushSnapshot,
  snapshotSignature,
  usePlanSyncStore,
  type PlanSnapshot,
} from '@/lib/stores/planSync'

/** How long a change settles before it is written to the account. */
const PUSH_DEBOUNCE_MS = 2000
/** Floor between two focus-triggered pulls, so tab-flipping is not a request storm. */
const PULL_THROTTLE_MS = 10_000

const readSnapshot = (): PlanSnapshot => {
  const { plans, activePlanId } = useSimulationStore.getState()
  return { plans, activePlanId }
}

/**
 * Whether this namespace holds nothing the user would miss.
 *
 * Reuses the pristine check the first-sign-in migration prompt runs, by handing
 * it the live state in the persisted shape — one definition of "untouched
 * workspace" for both features.
 */
const localIsPristine = (): boolean => {
  const { plans, params, draftParams } = useSimulationStore.getState()
  return isPristineWorkspace(JSON.stringify({ state: { plans, params, draftParams } }))
}

/**
 * Keeps the signed-in account's plans in sync with the server.
 *
 * Lifecycle, per namespace:
 *   1. `AuthStorageSync` announces the namespace (after the switch and any
 *      migration prompt) — the anonymous namespace announces `null` and is
 *      never synced.
 *   2. One reconcile: fetch, merge (see `planSync`), apply and/or push.
 *   3. Then, until the namespace changes: a debounced push on every plan change
 *      and a throttled pull whenever the tab regains focus.
 *
 * Every failure path degrades to local-only and stays silent; the status line
 * in the account menu is the only thing the user sees.
 */
export function usePlanCloudSync(): void {
  const namespaceUserId = usePlanSyncStore((state) => state.namespaceUserId)
  const namespaceReady = usePlanSyncStore((state) => state.namespaceReady)

  useEffect(() => {
    const { setPhase } = usePlanSyncStore.getState()

    // Signed out, or the namespace has not settled yet: nothing to sync.
    if (!namespaceReady || !namespaceUserId) {
      setPhase('disabled', null)
      return
    }

    let cancelled = false
    let stopped = false
    let lastPushedSignature: string | null = null
    let lastPullAt = 0
    let pushTimer: ReturnType<typeof setTimeout> | null = null

    /** Turns the store off for this session: no store here, or no session. */
    const disable = () => {
      stopped = true
      setPhase('disabled', null)
    }

    const push = async (snapshot: PlanSnapshot): Promise<void> => {
      if (stopped) return
      const signature = snapshotSignature(snapshot)
      setPhase('syncing')

      const result = await pushSnapshot(snapshot)
      if (cancelled) return

      if (result.status === 'ok') {
        lastPushedSignature = signature
        setPhase('synced', Date.now())
        return
      }
      if (result.status === 'error') {
        setPhase('offline')
        return
      }
      disable()
    }

    const reconcile = async (): Promise<void> => {
      if (stopped) return
      lastPullAt = Date.now()
      setPhase('syncing')

      const remote = await fetchRemoteSnapshot()
      if (cancelled) return

      if (remote.status === 'unconfigured' || remote.status === 'unauthorized') {
        disable()
        return
      }
      if (remote.status === 'error') {
        setPhase('offline')
        return
      }

      const merged = mergePlanSnapshots({
        local: readSnapshot(),
        remote: remote.blob,
        localPristine: localIsPristine(),
      })

      if (merged.shouldApply) {
        useSimulationStore
          .getState()
          .applySyncedPlans(merged.plans, merged.activePlanId)
      }

      if (merged.shouldPush) {
        // `applySyncedPlans` may pin the active plan (unsaved edits win), so the
        // authoritative snapshot is what the store ended up with.
        await push(merged.shouldApply ? readSnapshot() : merged)
        return
      }

      lastPushedSignature = snapshotSignature(readSnapshot())
      setPhase('synced', Date.now())
    }

    const schedulePush = () => {
      if (pushTimer) clearTimeout(pushTimer)
      pushTimer = setTimeout(() => {
        pushTimer = null
        void push(readSnapshot())
      }, PUSH_DEBOUNCE_MS)
    }

    let unsubscribe: (() => void) | null = null

    const startWatching = () => {
      if (cancelled || stopped) return

      // Only plan-shaped state is compared, so a simulation finishing, a
      // comparison recomputing or a chart brushing never causes a write —
      // while a saved parameter change does, because params live in plans.
      unsubscribe = useSimulationStore.subscribe((state) => {
        if (stopped) return
        const signature = snapshotSignature({
          plans: state.plans,
          activePlanId: state.activePlanId,
        })
        if (signature === lastPushedSignature) return
        schedulePush()
      })
    }

    const onFocus = () => {
      if (stopped || cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (Date.now() - lastPullAt < PULL_THROTTLE_MS) return
      // The merge is a no-op when the account has not moved on, so an
      // unnecessary pull costs one request and changes nothing.
      void reconcile()
    }

    void reconcile().finally(startWatching)

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      cancelled = true
      if (pushTimer) clearTimeout(pushTimer)
      unsubscribe?.()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [namespaceReady, namespaceUserId])
}

/** Mount-only companion to `AuthStorageSync`; renders nothing. */
export function PlanCloudSync() {
  usePlanCloudSync()
  return null
}
