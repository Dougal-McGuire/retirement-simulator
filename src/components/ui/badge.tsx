import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-none border-2 border-neo-black px-3 py-1 text-xs font-bold uppercase transition-neo',
  {
    variants: {
      variant: {
        default: 'bg-neo-blue text-neo-white shadow-neo-sm',
        secondary: 'bg-neo-yellow text-neo-black shadow-neo-sm',
        destructive: 'bg-neo-red text-neo-white shadow-neo-sm',
        success: 'bg-neo-green text-neo-black shadow-neo-sm',
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
