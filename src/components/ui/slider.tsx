'use client'

import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'

import { cn } from '@/lib/utils'

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn('relative flex w-full touch-none select-none items-center', className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-3 w-full grow bg-neo-white border-2 border-neo-black">
      <SliderPrimitive.Range className="absolute h-full bg-neo-blue" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-6 w-6 border-2 border-neo-black bg-neo-yellow shadow-neo transition-transform duration-100 hover:translate-x-[1px] hover:translate-y-[1px] focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
