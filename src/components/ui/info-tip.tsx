'use client'

import type { ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface InfoTipProps {
  /** Tooltip body. Plain text or small inline markup. */
  content: ReactNode
  /**
   * What the tip explains, e.g. the field label. The trigger is named
   * "Help: {label}" so it never collides with the control it sits next to.
   */
  label: string
  /**
   * When set, the content is also rendered visually hidden under this id so a
   * form control can keep pointing at it via `aria-describedby`. Screen readers
   * then hear the explanation with the field, sighted users get it on demand.
   */
  descriptionId?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  iconClassName?: string
}

/**
 * The one way explanatory copy is folded out of the way across the app: a
 * small ⓘ trigger next to a label or heading with the explanation in a
 * tooltip. Keeps the visible UI to labels and numbers without losing the
 * words for anyone who wants them.
 */
export function InfoTip({
  content,
  label,
  descriptionId,
  side = 'top',
  className,
  iconClassName,
}: InfoTipProps) {
  const t = useTranslations('ui')
  return (
    <>
      {descriptionId && (
        <span id={descriptionId} className="sr-only">
          {content}
        </span>
      )}
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-slot="info-tip"
              className={cn(
                'inline-flex shrink-0 cursor-help items-center rounded-full align-middle text-muted-foreground/70 transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2',
                className
              )}
              aria-label={t('fieldHelp', { label })}
            >
              <HelpCircle className={cn('h-3.5 w-3.5', iconClassName)} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side={side}
            className="rounded-sm max-w-xs border-2 border-border bg-white px-3 py-2 text-ink shadow-sm"
          >
            <div className="text-xs font-medium normal-case leading-relaxed ">
              {content}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  )
}
