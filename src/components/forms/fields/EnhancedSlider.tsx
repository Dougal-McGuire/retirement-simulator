'use client'

import React from 'react'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EnhancedSliderProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  formatValue: (value: number) => string
  className?: string
  showControls?: boolean
  hint?: string
  ariaLabel?: string
  decrementAriaLabel?: string
  incrementAriaLabel?: string
}

export function EnhancedSlider({
  value,
  onChange,
  min,
  max,
  step,
  formatValue,
  className,
  showControls = true,
  hint,
  ariaLabel,
  decrementAriaLabel,
  incrementAriaLabel,
}: EnhancedSliderProps) {
  const decrementControlAriaLabel = decrementAriaLabel ?? 'Decrease value'
  const incrementControlAriaLabel = incrementAriaLabel ?? 'Increase value'

  const handleDecrement = () => {
    const newValue = Math.max(min, value - step)
    onChange(newValue)
  }

  const handleIncrement = () => {
    const newValue = Math.min(max, value + step)
    onChange(newValue)
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Current value display - prominent but not floating */}
      <div className="flex justify-center">
        <div className="rounded-sm inline-block border-2 border-border bg-amber px-3 py-1 shadow-sm">
          <span className="text-sm font-extrabold  r text-ink">
            {formatValue(value)}
          </span>
        </div>
      </div>

      {/* Slider with +/- controls */}
      <div className="flex items-center gap-2">
        {showControls && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={handleDecrement}
            disabled={value <= min}
            className="rounded-sm h-7 w-7 flex-shrink-0 border-2 border-border bg-white shadow-sm hover:-translate-y-[1px] hover:-translate-x-[1px] hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0"
            aria-label={decrementControlAriaLabel}
          >
            <Minus className="h-3 w-3" />
          </Button>
        )}

        <div className="flex-1">
          <Slider
            value={[value]}
            onValueChange={([newValue]) => onChange(newValue)}
            min={min}
            max={max}
            step={step}
            aria-label={ariaLabel}
          />
        </div>

        {showControls && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={handleIncrement}
            disabled={value >= max}
            className="rounded-sm h-7 w-7 flex-shrink-0 border-2 border-border bg-white shadow-sm hover:-translate-y-[1px] hover:-translate-x-[1px] hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0"
            aria-label={incrementControlAriaLabel}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Min/Max labels and optional hint */}
      <div className="flex items-center justify-between text-[0.62rem] font-semibold   text-muted-foreground">
        <span>{formatValue(min)}</span>
        {hint && (
          <span className="text-center text-accent font-extrabold r">{hint}</span>
        )}
        <span>{formatValue(max)}</span>
      </div>
    </div>
  )
}
