'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSimulationStore, withoutPersisting } from '@/lib/stores/simulationStore'
import { BASE_STORE_KEY, setActiveAuthUserId, storageKey } from '@/lib/stores/persistenceKey'
import {
  copyAnonymousWorkspace,
  decideMigration,
  markMigrationAnswered,
  readMigrationInputs,
} from '@/lib/stores/authMigration'
import { markNamespaceReady } from '@/lib/stores/planSync'
import { SESSION_RETRY_DELAYS_MS, watchSignOut } from '@/lib/auth/sessionProbe'

/**
 * The store's pristine, pre-hydration state. Captured once at module load so
 * switching into an empty namespace resets whatever fields the store happens to
 * define today — no hard-coded field list to drift against the store's shape.
 */
const pristineState = useSimulationStore.getInitialState()

/** Re-points the persist middleware at `key`, resets memory, reloads. */
async function switchNamespace(nextKey: string): Promise<void> {
  const store = useSimulationStore.persist
  if (!store) return

  store.setOptions({ name: nextKey })

  // Always drop the previous account's in-memory state before rehydrating.
  // Replacing the whole state (rather than resetting known fields) means
  // nothing can survive the switch. The reset is memory-only: written out, it
  // would land on `nextKey` — the very namespace we are about to read — and
  // put the pristine state over the account's plans before `rehydrate()` ever
  // saw them. `rehydrate()` then loads the new namespace through the store's
  // own normalisation (`hydrateState`).
  withoutPersisting(() => useSimulationStore.setState({ ...pristineState }, true))

  await reloadNamespace()
}

/**
 * Reloads the *current* namespace from disk without resetting memory first.
 *
 * Used after copying the anonymous workspace across: the copy is on disk, and
 * memory still holds the empty account it replaces.
 */
async function reloadNamespace(): Promise<void> {
  const store = useSimulationStore.persist
  if (!store) return

  await Promise.resolve(store.rehydrate())

  const state = useSimulationStore.getState()
  if (!state.results && !state.isLoading) {
    void state.runSimulation()
  }
}

/**
 * Keeps the Zustand persistence key in sync with the signed-in account, and
 * offers to bring an anonymous workspace along on the first sign-in.
 *
 * A session that disappears is not taken at its word: Auth.js reports "signed
 * out" for every failed session request (see `sessionProbe`). The account's
 * workspace stays on screen until the server itself confirms there is no
 * session; an explicit sign-out is confirmed by the first probe, a network
 * hiccup never is.
 *
 * Mounted only inside the auth-enabled branch of `AuthProvider`, so an
 * unconfigured deployment never runs any of this and keeps writing to the
 * original, unsuffixed keys.
 */
export function AuthStorageSync() {
  const t = useTranslations('auth.migration')
  const { data: session, status, update } = useSession()
  const appliedKeyRef = useRef<string | null>(null)
  /** Account whose workspace is on screen; `null` for the anonymous one. */
  const appliedUserIdRef = useRef<string | null>(null)
  /** Recoveries attempted since the session was last seen: backs the probes off. */
  const recoveriesRef = useRef(0)
  const updateRef = useRef(update)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  useEffect(() => {
    updateRef.current = update
  }, [update])

  // Prefer Google's opaque account id; fall back to e-mail for the rare token
  // that carries no `sub`. Either way only its hash reaches localStorage.
  const accountId = session?.user?.id ?? session?.user?.email ?? null

  useEffect(() => {
    if (status === 'loading') return

    const signedInId = status === 'authenticated' ? accountId : null

    const applyNamespace = (userId: string | null) => {
      // Read *before* re-pointing the store: the decision compares what is on
      // disk in both namespaces, and rehydration may write to the new one.
      const migration =
        userId && typeof window !== 'undefined'
          ? decideMigration(readMigrationInputs(userId, window.localStorage))
          : 'none'

      setActiveAuthUserId(userId)
      appliedUserIdRef.current = userId
      const nextKey = storageKey(BASE_STORE_KEY)

      // Cloud sync waits for this signal: it must never read a workspace that is
      // about to be replaced by a namespace switch or a migration copy.
      if (appliedKeyRef.current === nextKey) {
        markNamespaceReady(userId)
        return
      }

      const isFirstResolution = appliedKeyRef.current === null
      appliedKeyRef.current = nextKey

      // Signed out on first paint: the store is already pointed at the base key
      // and has hydrated normally. Nothing to do.
      if (isFirstResolution && nextKey === BASE_STORE_KEY) {
        markNamespaceReady(null)
        return
      }

      void switchNamespace(nextKey).then(() => {
        if (migration === 'prompt' && userId) {
          // Announced by `answer()` instead — the user may still bring plans in.
          setPendingUserId(userId)
          return
        }
        markNamespaceReady(userId)
      })
    }

    if (status === 'authenticated') recoveriesRef.current = 0

    // The session is gone while an account's workspace is on screen. Leaving
    // it now would show the anonymous plans and send every edit there — so
    // ask the server first, and keep asking while it does not answer.
    if (status === 'unauthenticated' && appliedUserIdRef.current !== null) {
      const recoveries = recoveriesRef.current
      return watchSignOut({
        initialDelayMs:
          recoveries === 0
            ? 0
            : SESSION_RETRY_DELAYS_MS[Math.min(recoveries, SESSION_RETRY_DELAYS_MS.length) - 1],
        onSignedOut: () => applyNamespace(null),
        // The session is still there; Auth.js only lost track of it and will
        // not look again by itself. `update()` makes it refetch.
        onStillSignedIn: () => {
          recoveriesRef.current += 1
          void updateRef.current()
        },
      })
    }

    applyNamespace(signedInId)
  }, [accountId, status])

  const answer = useCallback(
    (bringPlans: boolean) => {
      const userId = pendingUserId
      setPendingUserId(null)
      if (!userId || typeof window === 'undefined') return

      markMigrationAnswered(userId, window.localStorage)
      if (!bringPlans) {
        markNamespaceReady(userId)
        return
      }

      // Copy first, then reload the (now populated) namespace. The anonymous
      // keys are only read, so signing out returns to the untouched workspace.
      copyAnonymousWorkspace(userId, window.localStorage)
      void reloadNamespace().then(() => markNamespaceReady(userId))
    },
    [pendingUserId]
  )

  return (
    <Dialog
      open={pendingUserId !== null}
      onOpenChange={(open) => {
        // Dismissing without choosing keeps the fresh account *and* leaves the
        // anonymous data alone; treat it as "start fresh" so it never re-asks.
        if (!open) answer(false)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <p className="text-[0.7rem] font-semibold   text-muted-foreground">
          {t('note')}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => answer(false)}>
            {t('decline')}
          </Button>
          <Button type="button" onClick={() => answer(true)}>
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
