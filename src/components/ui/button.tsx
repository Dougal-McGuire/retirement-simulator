import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap text-[0.72rem] font-bold uppercase tracking-[0.18em] leading-none transition-neo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 disabled:pointer-events-none disabled:translate-x-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-slate-400 disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none disabled:opacity-70',
  {
    variants: {
      variant: {
        default:
          'border-2 border-neo-black bg-neo-black text-neo-white shadow-neo-blue hover:-translate-y-[2px] hover:-translate-x-[2px] hover:shadow-neo-green active:translate-x-0 active:translate-y-0 active:shadow-none',
        destructive:
          'border-3 border-neo-black bg-neo-red text-neo-white shadow-neo hover:-translate-y-[2px] hover:-translate-x-[2px] hover:shadow-neo-md active:translate-x-0 active:translate-y-0 active:shadow-none',
        outline:
          'border-2 border-neo-black bg-card text-neo-black shadow-neo-sm hover:-translate-y-[1px] hover:-translate-x-[1px] hover:shadow-neo active:translate-x-0 active:translate-y-0 active:shadow-none',
        secondary:
          'border-2 border-neo-black bg-neo-yellow text-neo-black shadow-neo-sm hover:-translate-y-[1px] hover:-translate-x-[1px] hover:shadow-neo active:translate-x-0 active:translate-y-0 active:shadow-none',
        success:
          'border-3 border-neo-black bg-neo-green text-neo-black shadow-neo hover:-translate-y-[2px] hover:-translate-x-[2px] hover:shadow-neo-md active:translate-x-0 active:translate-y-0 active:shadow-none',
        ghost:
          'border-3 border-transparent text-neo-black hover:border-neo-black hover:bg-muted shadow-none hover:shadow-neo-sm',
        link:
          'border-none shadow-none text-neo-blue underline-offset-4 hover:underline hover:text-neo-black tracking-[0.16em] uppercase',
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
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
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
