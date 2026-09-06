import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'theme-control inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium leading-normal transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'border border-accent bg-accent text-white hover:opacity-90',
        destructive: 'border border-danger bg-danger text-white hover:opacity-90',
        outline: 'border border-border bg-white text-ink hover:bg-muted',
        secondary: 'border border-border bg-muted text-ink hover:bg-muted/70',
        success: 'border border-accent bg-accent text-white hover:opacity-90',
        ghost: 'border border-transparent bg-transparent text-ink hover:bg-muted',
        link: 'border border-transparent text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-10 px-3 py-2',
        lg: 'h-12 px-6 py-3',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
