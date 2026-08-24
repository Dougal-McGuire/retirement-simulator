'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePlanSyncStore } from '@/lib/stores/planSync'

/** Relative timestamps only need to be roughly right. */
const TICK_MS = 30_000

function useRelativeLabel(lastSyncedAt: number | null): string | null {
  const t = useTranslations('auth.sync')
  const [now, setNow] = useState<number>(() => Date.now())

  useEffect(() => {
    if (lastSyncedAt === null) return
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [lastSyncedAt])

  if (lastSyncedAt === null) return null

  const minutes = Math.max(0, Math.floor((now - lastSyncedAt) / 60_000))
  if (minutes < 1) return t('justNow')
  if (minutes < 60) return t('minutes', { count: minutes })
  return t('hours', { count: Math.floor(minutes / 60) })
}

/**
 * The sub-label under the account name in the auth menu.
 *
 * Without a cloud store — the default, and every deployment that only
 * configured Google sign-in — this is exactly the "Signed in" label it always
 * was, tooltip included. Sync only ever *adds* a line; it never changes what an
 * unsynced deployment shows.
 */
export function AccountStatusLine() {
  const t = useTranslations('auth')
  const phase = usePlanSyncStore((state) => state.phase)
  const lastSyncedAt = usePlanSyncStore((state) => state.lastSyncedAt)
  const relative = useRelativeLabel(lastSyncedAt)

  const label =
    phase === 'syncing'
      ? t('sync.syncing')
      : phase === 'offline'
        ? t('sync.offline')
        : phase === 'synced' && relative
          ? t('sync.synced', { when: relative })
          : null

  const isSynced = phase === 'synced'
  const tooltip = label === null ? t('localOnly') : isSynced ? t('sync.hint') : t('sync.offlineHint')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={
            // A sync status is a sentence, not a label: it wraps instead of
            // ellipsising, and drops the wide uppercase tracking that makes
            // "Offline (stored on this device)" twice as wide as its box.
            label === null
              ? 'truncate text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground'
              : 'text-[0.6rem] font-semibold leading-tight text-muted-foreground'
          }
          title={tooltip}
          // Screen readers get told when a background sync finishes, but never
          // interrupted: this is ambient status, not an action result.
          aria-live="polite"
        >
          {label ?? t('signedIn')}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[16rem]">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
