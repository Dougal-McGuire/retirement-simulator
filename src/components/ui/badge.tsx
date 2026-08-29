import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-none border-2 border-border px-3 py-1 text-xs font-bold  transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-accent text-white shadow-sm',
        secondary: 'bg-amber text-ink shadow-sm',
        destructive: 'bg-danger text-white shadow-sm',
        success: 'bg-ok text-ink shadow-sm',
        outline: 'bg-background text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
