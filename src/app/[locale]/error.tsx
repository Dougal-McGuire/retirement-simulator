'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { ErrorScreen } from '@/components/errors/ErrorScreen'
import { isChunkLoadError } from '@/lib/lazy/chunkError'
import { useSimulationStore } from '@/lib/stores/simulationStore'

/**
 * Localized error screen for every page under `/[locale]` (the providers of
 * the locale layout are still mounted). Errors inside a workspace section are
 * caught closer to where they happen (`SectionBoundary`); this is for the
 * rest.
 */
export default function LocaleError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('ui.errors')
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <ErrorScreen
      chunk={isChunkLoadError(error)}
      digest={error.digest}
      onBeforeDiscard={() => useSimulationStore.getState().clearResults()}
      copy={{
        title: t('title'),
        body: t('body'),
        chunkBody: t('chunkBody'),
        reload: t('reload'),
        discard: t('discard'),
        discardHint: t('discardHint'),
        digest: t('digest'),
      }}
    />
  )
}
