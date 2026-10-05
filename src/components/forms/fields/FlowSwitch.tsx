'use client'

import { useTranslations } from 'next-intl'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface FlowSwitchProps {
  /** Element id and test id (`cashflow-switch-<flow id>` in the flow list). */
  id: string
  /** The flow's display name, for the accessible name. */
  name: string
  on: boolean
  onToggle: () => void
}

/**
 * A flow's on/off switch: "„{name}“ in der Berechnung", with the
 * "Berücksichtigen" / "Ausgeschaltet – bleibt im Plan …" tooltip. The flow
 * list and the setup wizard's one-off list use the same control, so a flow
 * switched off in one place reads and switches back the same way in the other.
 */
export function FlowSwitch({ id, name, on, onToggle }: FlowSwitchProps) {
  const t = useTranslations('setup.cashFlows')
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <button
          type="button"
          role="switch"
          id={id}
          aria-checked={on}
          aria-label={t('switch.aria', { name })}
          data-testid={id}
          onClick={onToggle}
          className="group rounded-sm inline-flex h-7 w-10 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          <span
            aria-hidden="true"
            className={cn(
              'relative h-[18px] w-8 rounded-full border transition-colors motion-reduce:transition-none',
              on ? 'border-action bg-action' : 'border-ink/50 bg-muted'
            )}
          >
            <span
              className={cn(
                'absolute left-[2px] top-[2px] h-3 w-3 rounded-full transition-transform motion-reduce:transition-none',
                on ? 'translate-x-[14px] bg-action-foreground' : 'bg-ink/60'
              )}
            />
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="rounded-sm border border-border bg-card px-2 py-1 text-xs font-medium text-ink shadow-sm"
      >
        {on ? t('switch.label') : t('switch.offHint')}
      </TooltipContent>
    </Tooltip>
  )
}

/** The "Aus" tag after a switched-off flow's name. */
export function FlowOffTag({ testId }: { testId?: string }) {
  const t = useTranslations('setup.cashFlows')
  return (
    <span
      className="rounded-sm ml-1.5 inline-block border border-border bg-card px-1 align-[1px] text-[11px] font-semibold leading-4 text-muted-foreground"
      data-testid={testId}
    >
      {t('switch.off')}
    </span>
  )
}
