'use client'

import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { RotateCw, TriangleAlert } from 'lucide-react'
import { isChunkLoadError } from '@/lib/lazy/chunkError'
import { cn } from '@/lib/utils'

export interface SectionBoundaryProps {
  children: ReactNode
  /** Names the boundary in the DOM (`data-boundary`), for tests and logs. */
  name: string
  /**
   * Set for a workspace section: the fallback keeps the section's anchor and
   * heading, so the index, the URL hash and scroll-spy still find it.
   */
  section?: { id: string; title: ReactNode }
  className?: string
  /**
   * `floating`: for something that is not part of the page flow (a dialog
   * that failed to load) — a small fixed card with a close button.
   */
  variant?: 'inline' | 'floating'
  /** Floating only: the close button; the owner unmounts the boundary. */
  onDismiss?: () => void
}

interface BoundaryState {
  error: Error | null
  /** Bumped by "Try again": remounts the children from scratch. */
  attempt: number
  /** Consecutive failures since the last successful render. */
  failures: number
}

/**
 * Keeps a render error (or a code-split chunk that did not arrive) inside the
 * part of the page that failed: a compact inline message with "Try again"
 * replaces just that section, chart or panel body, and the result bar and the
 * other sections keep working. Without it any error replaced the whole app
 * with Next's error page.
 */
export class SectionBoundary extends Component<SectionBoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, attempt: 0, failures: 0 }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState((state) => ({ failures: state.failures + 1 }))
    console.error(`[${this.props.name}] render failed`, error, info.componentStack)
  }

  private retry = () => {
    this.setState((state) => ({ error: null, attempt: state.attempt + 1 }))
  }

  render() {
    const { error, attempt, failures } = this.state
    const { children, name, section, className, variant = 'inline', onDismiss } = this.props
    if (!error) {
      return <Fragment key={attempt}>{children}</Fragment>
    }
    const fallback = (
      <SectionErrorMessage
        name={name}
        chunk={isChunkLoadError(error)}
        repeated={failures > 1}
        onRetry={this.retry}
        onDismiss={variant === 'floating' ? onDismiss : undefined}
        className={cn(variant === 'floating' && 'ws-section-error--floating', className)}
      />
    )
    if (!section) return fallback
    return (
      <section
        id={section.id}
        aria-labelledby={`${section.id}-title`}
        className="ws-section"
        data-section={section.id}
      >
        <header className="ws-section-header">
          <h2 id={`${section.id}-title`} tabIndex={-1}>
            {section.title}
          </h2>
        </header>
        {fallback}
      </section>
    )
  }
}

function SectionErrorMessage({
  name,
  chunk,
  repeated,
  onRetry,
  onDismiss,
  className,
}: {
  name: string
  chunk: boolean
  repeated: boolean
  onRetry: () => void
  onDismiss?: () => void
  className?: string
}) {
  const t = useTranslations('ui.errors')
  return (
    <div
      role="alert"
      className={cn('ws-section-error', className)}
      data-boundary={name}
      data-testid="section-error"
      data-chunk={chunk ? 'true' : undefined}
    >
      <TriangleAlert size={16} aria-hidden="true" className="ws-section-error-icon" />
      <p>{chunk ? t('sectionChunk') : t('section')}</p>
      <div className="ws-section-error-actions">
        <button
          type="button"
          className="workspace-button"
          data-testid="section-error-retry"
          onClick={onRetry}
        >
          <RotateCw size={14} aria-hidden="true" />
          {t('retry')}
        </button>
        {/* A retry that failed again usually needs the newest build. */}
        {repeated && (
          <button
            type="button"
            className="workspace-button workspace-button-quiet"
            data-testid="section-error-reload"
            onClick={() => window.location.reload()}
          >
            {t('reload')}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            className="workspace-button workspace-button-quiet"
            data-testid="section-error-dismiss"
            onClick={onDismiss}
          >
            {t('dismiss')}
          </button>
        )}
      </div>
    </div>
  )
}
