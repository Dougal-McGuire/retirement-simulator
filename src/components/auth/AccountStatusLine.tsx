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
 * Sync status next to the account name in the auth menu: a coloured dot with
 * the sentence ("Synced · just now", "Offline (stored on this device)") in its
 * tooltip and read out to assistive technology.
 *
 * Without a cloud store — the default, and every deployment that only
 * configured Google sign-in — this is a neutral "Signed in" dot. Sync only
 * ever *adds* state; it never changes what an unsynced deployment shows.
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

  const dotClass =
    phase === 'syncing'
      ? 'bg-accent animate-pulse'
      : phase === 'offline'
        ? 'bg-viz-orange'
        : isSynced
          ? 'bg-ok'
          : 'bg-ink/30'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid="auth-sync-status"
          data-phase={phase}
          className="inline-flex h-8 w-5 shrink-0 cursor-help items-center justify-center"
          tabIndex={0}
          aria-label={label ?? t('signedIn')}
        >
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
          {/* Screen readers get told when a background sync finishes, but never
              interrupted: this is ambient status, not an action result. */}
          <span className="sr-only" aria-live="polite">
            {label ?? t('signedIn')}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[16rem]">
        <span className="block font-bold">{label ?? t('signedIn')}</span>
        <span className="block text-muted-foreground">{tooltip}</span>
      </TooltipContent>
    </Tooltip>
  )
}
