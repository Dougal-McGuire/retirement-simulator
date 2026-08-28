'use client'

import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'

import { cn } from '@/lib/utils'

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /** Reads the value out as text ("€3,200 / month") instead of the raw number. */
  'aria-valuetext'?: string
}

/**
 * `role="slider"` lives on the *thumb*, not on the root Radix renders, so an
 * `aria-label` left on the root named an element no screen reader announces —
 * every slider in the app read out as a bare number ("60", "48000"). The
 * naming props are therefore pulled off the root and put where the role is.
 */
const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  (
    {
      className,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      'aria-valuetext': ariaValueText,
      ...props
    },
    ref
  ) => (
    <SliderPrimitive.Root
      ref={ref}
      className={cn('relative flex w-full touch-none select-none items-center', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-3 w-full grow bg-field border-2 border-neo-black">
        <SliderPrimitive.Range className="absolute h-full bg-neo-blue" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-valuetext={ariaValueText}
        className="block h-6 w-6 border-2 border-neo-black bg-neo-yellow shadow-neo transition-transform duration-100 hover:translate-x-[1px] hover:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 focus-visible:ring-offset-neo-white disabled:pointer-events-none disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  )
)
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
