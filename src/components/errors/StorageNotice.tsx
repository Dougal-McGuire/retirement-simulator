'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { HardDrive } from 'lucide-react'
import { isPersistentStorageAvailable } from '@/lib/storage/safeStorage'
import { cn } from '@/lib/utils'

const noop = () => () => {}

/**
 * One quiet line when the browser refuses local storage (blocked site data,
 * some private modes, a full quota): the app keeps working in memory, but
 * nothing survives closing the tab, and the user should know before they
 * spend an hour on a plan. Renders nothing on the server and wherever storage
 * works.
 */
export function StorageNotice({ className }: { className?: string }) {
  const t = useTranslations('ui')
  const blocked = useSyncExternalStore(
    noop,
    () => !isPersistentStorageAvailable(),
    () => false
  )
  if (!blocked) return null
  return (
    <p className={cn('storage-notice', className)} role="note" data-testid="storage-notice">
      <HardDrive size={14} aria-hidden="true" />
      <span>{t('storageBlocked')}</span>
    </p>
  )
}
