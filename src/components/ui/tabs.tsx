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
      'inline-flex min-h-10 min-w-0 items-center justify-center whitespace-normal px-3 py-2 text-sm font-medium leading-normal transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 bg-transparent text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=active]:bg-muted data-[state=active]:text-ink',
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
