'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    // `@container` turns the list itself into the query context, so triggers
    // size against the panel that holds them (a 390px drawer, a sidebar, the
    // full-width dashboard) instead of the viewport. Without it a segmented
    // control inside a narrow drawer renders viewport-sized labels and the
    // three captions collide into one another.
    className={cn('@container inline-flex h-auto items-center gap-0 bg-transparent p-0', className)}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Padding and size step up with the *container* width so labels always
      // fit: cramped-but-legible in a narrow drawer, roomy on desktop.
      // Selection is painted with the accent, per the design system.
      'inline-flex h-auto min-h-12 w-full min-w-0 items-center justify-center whitespace-normal break-words px-1.5 py-2 text-center text-[0.6rem] font-extrabold leading-tight transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-white text-ink data-[state=inactive]:hover:bg-amber/15',
      '@sm:min-h-14 @sm:px-2 @sm:text-[0.66rem]',
      '@lg:min-h-16 @lg:px-4 @lg:text-[0.72rem]',
      '@2xl:px-6 @2xl:text-[0.78rem]',
      'data-[state=active]:bg-accent data-[state=active]:text-white data-[state=active]:shadow-sm',
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('focus-visible:outline-none', className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
