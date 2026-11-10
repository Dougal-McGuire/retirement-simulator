'use client'

import { useState } from 'react'
import { dropCachedResults } from '@/lib/recovery/dropCachedResults'

export interface ErrorScreenCopy {
  title: string
  body: string
  chunkBody: string
  reload: string
  discard: string
  discardHint: string
  digest: string
}

/**
 * The page-level error screen, shared by `app/[locale]/error.tsx` (with the
 * catalog's words) and `app/global-error.tsx` (which renders outside every
 * provider). Plain markup with inline styles on the colour tokens and
 * fallbacks for them: the stylesheet may be what failed to load.
 *
 * "Discard saved results and reload" drops only the cached simulation
 * results — never plans — since a malformed results payload is the one piece
 * of persisted state that can crash every reload.
 */
export function ErrorScreen({
  copy,
  chunk,
  digest,
  onBeforeDiscard,
}: {
  copy: ErrorScreenCopy
  chunk: boolean
  digest?: string
  /** Lets a live store clear its in-memory copy first, so it is not written back. */
  onBeforeDiscard?: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <main
      id="main-content"
      data-testid="error-screen"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px 16px',
        background: 'var(--ui-bg, Canvas)',
        color: 'var(--ui-text, CanvasText)',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div
        role="alert"
        style={{
          maxWidth: '32rem',
          width: '100%',
          border: '1px solid var(--line-strong, GrayText)',
          borderRadius: 'var(--ui-radius, 4px)',
          background: 'var(--surface-raised, Canvas)',
          padding: '24px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 650, lineHeight: 1.3 }}>
          {copy.title}
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: '0.95rem', lineHeight: 1.5 }}>
          {chunk ? copy.chunkBody : copy.body}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
          <button
            type="button"
            data-testid="error-reload"
            onClick={() => window.location.reload()}
            style={buttonStyle(true)}
          >
            {copy.reload}
          </button>
          <button
            type="button"
            data-testid="error-discard-results"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              try {
                onBeforeDiscard?.()
              } catch {
                // The store may be what failed; storage is cleaned below.
              }
              dropCachedResults()
              window.location.reload()
            }}
            style={buttonStyle(false)}
          >
            {copy.discard}
          </button>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: '0.8rem', opacity: 0.75, lineHeight: 1.4 }}>
          {copy.discardHint}
        </p>
        {digest && (
          <p style={{ margin: '8px 0 0', fontSize: '0.75rem', opacity: 0.6 }}>
            {copy.digest} <code>{digest}</code>
          </p>
        )}
      </div>
    </main>
  )
}

function buttonStyle(primary: boolean) {
  return {
    minHeight: 40,
    padding: '0 14px',
    borderRadius: 'var(--ui-radius, 4px)',
    border: `1px solid ${primary ? 'var(--action, #1f4fd1)' : 'var(--line-strong, GrayText)'}`,
    background: primary ? 'var(--action, #1f4fd1)' : 'transparent',
    color: primary ? 'var(--on-action, #fff)' : 'inherit',
    font: 'inherit',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  } as const
}
