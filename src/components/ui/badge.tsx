import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border border-border px-2 py-1 text-xs font-medium  transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-muted text-ink',
        secondary: 'bg-muted text-ink',
        destructive: 'bg-danger text-white shadow-sm',
        success: 'bg-muted text-ink',
        outline: 'bg-background text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
