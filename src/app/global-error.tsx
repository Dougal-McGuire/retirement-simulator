'use client'

import { useEffect } from 'react'
import { ErrorScreen, type ErrorScreenCopy } from '@/components/errors/ErrorScreen'
import { isChunkLoadError } from '@/lib/lazy/chunkError'
import './interface.css'

/**
 * Last-resort error screen: replaces the root layout when it (or the locale
 * layout's providers) failed, so no translation provider is available here.
 * The two locales' words are therefore inline — the same text as
 * `ui.errors` in the catalogs — and the locale comes from the URL.
 */
const COPY: Record<'de' | 'en', ErrorScreenCopy> = {
  de: {
    title: 'Etwas ist schiefgelaufen',
    body: 'Die Seite konnte nicht angezeigt werden. Deine Pläne sind sicher – lade die Seite neu.',
    chunkBody:
      'Ein Teil der App konnte nicht geladen werden, vermutlich wegen der Verbindung oder einer neuen Version. Lade die Seite neu.',
    reload: 'Neu laden',
    discard: 'Gespeicherte Ergebnisse verwerfen und neu laden',
    discardHint:
      'Verwirft nur die zwischengespeicherten Berechnungsergebnisse – deine Pläne bleiben erhalten und werden neu berechnet.',
    digest: 'Fehlerkennung:',
  },
  en: {
    title: 'Something went wrong',
    body: 'The page could not be shown. Your plans are safe – reload the page.',
    chunkBody:
      'Part of the app could not be loaded, probably because of the connection or a new version. Reload the page.',
    reload: 'Reload',
    discard: 'Discard saved results and reload',
    discardHint:
      'Discards only the cached simulation results – your plans are kept and recalculated.',
    digest: 'Error id:',
  },
}

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  const locale =
    typeof window !== 'undefined' && /^\/de(?:\/|$)/.test(window.location.pathname) ? 'de' : 'en'
  return (
    <html lang={locale}>
      <body>
        <ErrorScreen copy={COPY[locale]} chunk={isChunkLoadError(error)} digest={error.digest} />
      </body>
    </html>
  )
}
