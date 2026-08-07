'use client'

import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

interface WizardSliderFieldProps {
  id: string
  label: string
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  step: number
  /** Formatted display of the current value, e.g. "7.0%" or "Age 63". */
  valueLabel: string
  /** Formatted display of the slider bounds. */
  minLabel: string
  maxLabel: string
  helpText?: string
  /** Optional derived context rendered below the help text (e.g. a timeline summary). */
  meta?: ReactNode
  className?: string
}

/**
 * Slider field used by the setup wizard: label with a value chip,
 * a framed slider with min/max bounds, and optional helper/meta rows.
 */
export function WizardSliderField({
  id,
  label,
  value,
  onValueChange,
  min,
  max,
  step,
  valueLabel,
  minLabel,
  maxLabel,
  helpText,
  meta,
  className,
}: WizardSliderFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label
          htmlFor={id}
          className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-neo-black"
        >
          {label}
        </Label>
        <output
          htmlFor={id}
          aria-live="off"
          className="border-2 border-neo-black bg-neo-yellow px-2.5 py-0.5 text-xs font-bold tabular-nums text-neo-black shadow-neo-xs"
        >
          {valueLabel}
        </output>
      </div>
      <div className="border-2 border-neo-black bg-neo-white px-4 pb-3 pt-5 shadow-neo-xs">
        <Slider
          id={id}
          value={[value]}
          onValueChange={([next]) => onValueChange(next)}
          min={min}
          max={max}
          step={step}
          className="w-full"
          aria-label={label}
        />
        <div className="mt-2.5 flex items-center justify-between text-[0.65rem] font-medium tabular-nums text-muted-foreground">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      </div>
      {helpText && (
        <p className="text-xs font-medium leading-relaxed text-muted-foreground">{helpText}</p>
      )}
      {meta}
    </div>
  )
}
