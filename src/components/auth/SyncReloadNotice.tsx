'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from '@/components/ui/toast'
import { ActionToast } from '@/components/ui/action-toast'
import { planDisplayName } from '@/lib/plans/planName'
import { usePlanSyncStore, type ReloadNotice } from '@/lib/stores/planSync'
import { setConflictCopyNamer } from './PlanCloudSync'

/** One toast for the whole app, so an escalation replaces it in place. */
export const SYNC_RELOAD_TOAST_ID = 'plan-sync-reload'
export const SYNC_CONFLICT_TOAST_ID = 'plan-sync-conflict'
export const SYNC_LIMIT_TOAST_ID = 'plan-sync-limit'

/**
 * The cards cloud sync raises — everything else about sync stays in the
 * account menu's status dot.
 *
 * "New version available — reload":
 *  - `required`: `/api/plans` refused this build's plan schema as too old
 *    (409 `outdated-client`) and this tab stopped syncing. Local edits keep
 *    working; a reload loads the new build, which syncs again.
 *  - `suggested`: the API reports a different build id, but the schema still
 *    matches, so sync carries on — the reload is only an offer.
 *  A server that is *older* than this tab (a rollback) raises nothing here:
 *  there is nothing to reload, and the status dot says why sync is paused.
 *
 * "Kept as a copy": a merge found a plan changed both here and in the account
 * and kept this device's version under a new name. Nothing was lost, but a
 * plan appearing in the list unannounced would look like a bug.
 *
 * "Plan limit reached": more plans exist across the user's devices than one
 * account holds; some stay where they are until plans are deleted.
 *
 * These toasts stay until the user acts (no timer, so they are the toasts
 * that sit bottom-left — clear of the docked edit panel); "Later" dismisses the
 * reload card, and the account menu's status dot keeps saying "Sync paused" in
 * the `required` case. Each reload level is shown at most once per page life.
 *
 * Also the place where sync learns the UI language: the name a conflict copy
 * gets is registered here, because the sync loop itself runs without
 * translations.
 */
export function SyncReloadNotice() {
  const t = useTranslations('auth.sync')
  const tp = useTranslations('plans')
  const notice = usePlanSyncStore((state) => state.reloadNotice)
  const conflictCopyNames = usePlanSyncStore((state) => state.conflictCopyNames)
  const planLimit = usePlanSyncStore((state) => state.planLimit)
  const shown = useRef<ReloadNotice>(null)
  const limitShown = useRef(false)

  useEffect(() => {
    // A built-in plan renders from its translation key, so the copy is named
    // after what the user sees, in the language they see it in.
    setConflictCopyNamer((plan) => t('conflictCopyName', { name: planDisplayName(plan, tp) }))
    return () => setConflictCopyNamer(null)
  }, [t, tp])

  useEffect(() => {
    if (!notice || shown.current === notice) return
    shown.current = notice

    toast(
      (instance) => (
        <ActionToast
          testId="sync-reload-notice"
          message={
            <span data-notice={notice}>
              {notice === 'required' ? t('reloadRequired') : t('reloadSuggested')}
            </span>
          }
          actions={[
            {
              label: t('reload'),
              tone: 'primary',
              testId: 'sync-reload-notice-reload',
              onClick: () => window.location.reload(),
            },
            {
              label: t('later'),
              testId: 'sync-reload-notice-later',
              onClick: () => toast.dismiss(instance.id),
            },
          ]}
        />
      ),
      // Bottom-left: it stays up while the user keeps working, and bottom-right
      // is where the docked edit panel has its Done button.
      { id: SYNC_RELOAD_TOAST_ID, duration: Infinity, position: 'bottom-left' }
    )
  }, [notice, t])

  useEffect(() => {
    if (conflictCopyNames.length === 0) return
    const names = conflictCopyNames.join(', ')
    usePlanSyncStore.getState().clearConflictCopies()

    toast(
      (instance) => (
        <ActionToast
          testId="sync-conflict-notice"
          message={t('conflictCopies', { names })}
          actions={[
            {
              label: t('dismiss'),
              tone: 'primary',
              testId: 'sync-conflict-notice-dismiss',
              onClick: () => toast.dismiss(instance.id),
            },
          ]}
        />
      ),
      { id: SYNC_CONFLICT_TOAST_ID, duration: Infinity, position: 'bottom-left' }
    )
  }, [conflictCopyNames, t])

  useEffect(() => {
    if (!planLimit) {
      // Everything fits again: the next time it does not is news again.
      if (limitShown.current) toast.dismiss(SYNC_LIMIT_TOAST_ID)
      limitShown.current = false
      return
    }
    if (limitShown.current) return
    limitShown.current = true

    toast(
      (instance) => (
        <ActionToast
          testId="sync-limit-notice"
          message={t('planLimitNotice', { count: planLimit.unsynced + planLimit.hidden })}
          actions={[
            {
              label: t('dismiss'),
              tone: 'primary',
              testId: 'sync-limit-notice-dismiss',
              onClick: () => toast.dismiss(instance.id),
            },
          ]}
        />
      ),
      { id: SYNC_LIMIT_TOAST_ID, duration: Infinity, position: 'bottom-left' }
    )
  }, [planLimit, t])

  return null
}
