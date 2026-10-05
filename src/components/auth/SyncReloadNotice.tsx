'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from '@/components/ui/toast'
import { ActionToast } from '@/components/ui/action-toast'
import { usePlanSyncStore, type ReloadNotice } from '@/lib/stores/planSync'

/** One toast for the whole app, so an escalation replaces it in place. */
export const SYNC_RELOAD_TOAST_ID = 'plan-sync-reload'

/**
 * "New version available — reload" card, raised by cloud sync.
 *
 *  - `required`: `/api/plans` refused this build's plan schema (409) and this
 *    tab stopped syncing. Local edits keep working; a reload loads the new
 *    build, which syncs again.
 *  - `suggested`: the API reports a different build id, but the schema still
 *    matches, so sync carries on — the reload is only an offer.
 *
 * The toast stays until the user acts (no timer, so it is the one toast that
 * sits bottom-left — clear of the docked edit panel); "Later" dismisses it, and the
 * account menu's status dot keeps saying "Sync paused" in the `required` case.
 * Each level is shown at most once per page life.
 */
export function SyncReloadNotice() {
  const t = useTranslations('auth.sync')
  const notice = usePlanSyncStore((state) => state.reloadNotice)
  const shown = useRef<ReloadNotice>(null)

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

  return null
}
