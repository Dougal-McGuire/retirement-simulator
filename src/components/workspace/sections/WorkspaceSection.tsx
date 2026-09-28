import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { WorkspaceSectionId } from '../workspaceNav'

export interface WorkspaceSectionProps {
  id: WorkspaceSectionId
  title: ReactNode
  description?: ReactNode
  /** Right-aligned on the heading's baseline (e.g. the guided-setup link). */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * One section of the workspace page: the anchor the index and the URL hash
 * point at, a focusable `h2` (index clicks move focus there) and the ruled
 * header every section shares. Frozen after Phase 1.
 */
export function WorkspaceSection({
  id,
  title,
  description,
  actions,
  children,
  className,
}: WorkspaceSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('ws-section', className)}
      data-section={id}
    >
      <header className="ws-section-header">
        <h2 id={`${id}-title`} tabIndex={-1}>
          {title}
        </h2>
        {description && <p>{description}</p>}
        {actions && <div className="ws-section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  )
}
