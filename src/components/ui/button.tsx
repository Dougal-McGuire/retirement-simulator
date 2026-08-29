import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'theme-control inline-flex items-center justify-center whitespace-nowrap text-[0.72rem] font-bold   leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default:
          'rounded-sm border border-border bg-accent text-white shadow-sm hover:-translate-y-[2px] hover:-translate-x-[2px] hover:shadow-sm active:translate-x-0 active:translate-y-0 active:shadow-none',
        destructive:
          'rounded-sm border border-border bg-danger text-white shadow-sm hover:-translate-y-[2px] hover:-translate-x-[2px] hover:shadow-sm active:translate-x-0 active:translate-y-0 active:shadow-none',
        outline:
          'rounded-sm border border-border bg-white text-ink shadow-sm hover:-translate-y-[2px] hover:-translate-x-[2px] hover:shadow-sm active:translate-x-0 active:translate-y-0 active:shadow-none',
        secondary:
          'rounded-sm border border-border bg-secondary text-secondary-foreground shadow-sm hover:-translate-y-[2px] hover:-translate-x-[2px] hover:shadow-sm active:translate-x-0 active:translate-y-0 active:shadow-none',
        success:
          'rounded-sm border border-border bg-ok text-ink shadow-sm hover:-translate-y-[2px] hover:-translate-x-[2px] hover:shadow-sm active:translate-x-0 active:translate-y-0 active:shadow-none',
        ghost:
          'rounded-sm border border-transparent text-ink hover:border-border hover:bg-muted shadow-none hover:shadow-sm',
        link: 'border-none shadow-none text-accent underline-offset-4 hover:underline hover:text-ink  ',
      },
      size: {
        default: 'h-12 px-6 py-3',
        sm: 'h-10 px-5 py-2 text-[0.65rem]',
        lg: 'h-14 px-8 py-4 text-[0.78rem]',
        icon: 'h-12 w-12 p-0',
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
