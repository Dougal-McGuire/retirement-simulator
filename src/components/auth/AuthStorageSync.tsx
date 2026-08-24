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
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { BASE_STORE_KEY, setActiveAuthUserId, storageKey } from '@/lib/stores/persistenceKey'
import {
  copyAnonymousWorkspace,
  decideMigration,
  markMigrationAnswered,
  readMigrationInputs,
} from '@/lib/stores/authMigration'
import { markNamespaceReady } from '@/lib/stores/planSync'

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

  // The persist middleware writes on *every* `setState`, so the reset below
  // lands on `nextKey` — the very namespace we are about to read — and would
  // overwrite the account's plans with the pristine state before `rehydrate()`
  // ever sees them (a signed-in workspace was lost on each reload). Keep the
  // stored value and put it back once the reset has done its work in memory.
  const stored = readRaw(nextKey)

  // Always drop the previous account's in-memory state before rehydrating.
  // Resetting unconditionally (rather than only for an empty namespace) means
  // no field can survive the switch — including ones the store derives rather
  // than persists, such as `savedSetups`. `rehydrate()` then loads the new
  // namespace and re-runs the store's own `onRehydrateStorage` normalisation.
  useSimulationStore.setState({ ...pristineState })

  restoreRaw(nextKey, stored)

  await reloadNamespace()
}

/** Reads a raw localStorage entry, tolerating disabled/full storage. */
function readRaw(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Puts a raw entry back exactly as it was (absent stays absent). */
function restoreRaw(key: string, value: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Nothing to do: the namespace simply starts empty, as it did before.
  }
}

/**
 * Reloads the *current* namespace from disk without resetting memory first.
 *
 * Used after copying the anonymous workspace across: any `setState` here would
 * be written straight back out by the persist middleware and would clobber the
 * copy we just made.
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
 * Mounted only inside the auth-enabled branch of `AuthProvider`, so an
 * unconfigured deployment never runs any of this and keeps writing to the
 * original, unsuffixed keys.
 */
export function AuthStorageSync() {
  const t = useTranslations('auth.migration')
  const { data: session, status } = useSession()
  const appliedKeyRef = useRef<string | null>(null)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  // Prefer Google's opaque account id; fall back to e-mail for the rare token
  // that carries no `sub`. Either way only its hash reaches localStorage.
  const accountId = session?.user?.id ?? session?.user?.email ?? null

  useEffect(() => {
    if (status === 'loading') return

    const signedInId = status === 'authenticated' ? accountId : null

    // Read *before* re-pointing the store: the decision compares what is on
    // disk in both namespaces, and rehydration may write to the new one.
    const migration =
      signedInId && typeof window !== 'undefined'
        ? decideMigration(readMigrationInputs(signedInId, window.localStorage))
        : 'none'

    setActiveAuthUserId(signedInId)
    const nextKey = storageKey(BASE_STORE_KEY)

    // Cloud sync waits for this signal: it must never read a workspace that is
    // about to be replaced by a namespace switch or a migration copy.
    if (appliedKeyRef.current === nextKey) {
      markNamespaceReady(signedInId)
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
      if (migration === 'prompt' && signedInId) {
        // Announced by `answer()` instead — the user may still bring plans in.
        setPendingUserId(signedInId)
        return
      }
      markNamespaceReady(signedInId)
    })
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
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
