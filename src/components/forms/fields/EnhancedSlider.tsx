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
}: EnhancedSliderProps) {
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
        <div className="inline-block border-2 border-neo-black bg-neo-yellow px-3 py-1 shadow-neo-sm">
          <span className="text-sm font-extrabold uppercase tracking-wider text-neo-black">
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
            className="h-7 w-7 flex-shrink-0 border-2 border-neo-black bg-neo-white shadow-neo-xs hover:-translate-y-[1px] hover:-translate-x-[1px] hover:shadow-neo-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0"
            aria-label="Decrease value"
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
          />
        </div>

        {showControls && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={handleIncrement}
            disabled={value >= max}
            className="h-7 w-7 flex-shrink-0 border-2 border-neo-black bg-neo-white shadow-neo-xs hover:-translate-y-[1px] hover:-translate-x-[1px] hover:shadow-neo-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0"
            aria-label="Increase value"
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Min/Max labels and optional hint */}
      <div className="flex items-center justify-between text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span>{formatValue(min)}</span>
        {hint && (
          <span className="text-center text-neo-blue font-extrabold tracking-wider">{hint}</span>
        )}
        <span>{formatValue(max)}</span>
      </div>
    </div>
  )
}
