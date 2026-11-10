'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '@/lib/utils'

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'bg-card text-ink border border-border shadow-sm opacity-100 mix-blend-normal z-[99999] w-fit origin-(--radix-tooltip-content-transform-origin) rounded-none px-3 py-2 text-xs text-balance',
          className
        )}
        style={{ backgroundColor: 'var(--white)', backdropFilter: 'none' }}
        {...props}
      >
        {children}
        {/* A diamond in the tooltip's own surface and border tokens; its
            outer two edges carry the border so it reads as part of the card. */}
        <TooltipPrimitive.Arrow
          className="z-[99999] size-2.5 translate-y-[calc(-50%_-_1px)] rotate-45 border-r border-b border-border"
          style={{ fill: 'transparent', backgroundColor: 'var(--white)' }}
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
