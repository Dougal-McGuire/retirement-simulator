'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        className={cn(
          'h-4 w-4 rounded border-neo-black text-neo-blue focus:ring-neo-blue',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
