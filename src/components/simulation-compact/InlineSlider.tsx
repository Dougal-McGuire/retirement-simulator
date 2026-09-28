'use client'

import { useRef } from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { RotateCcw } from 'lucide-react'

/** Thumb diameter in px; `.ws-levers-slider-thumb` in levers.css must match. */
const THUMB_SIZE = 18

/**
 * Where Radix centres the thumb for a value at `percent`: it keeps the thumb
 * inside the track, shifting it by up to half its width at the ends. The plan
 * mark uses the same geometry so it sits exactly under the thumb's old spot.
 */
const thumbCenter = (percent: number) =>
  `calc(${percent}% + ${(THUMB_SIZE / 2) * (1 - percent / 50)}px)`

interface InlineSliderProps {
  /** Visible label; the thumb is named by `ariaLabel`. */
  label: string
  ariaLabel: string
  value: number
  min: number
  max: number
  step: number
  formattedValue: string
  valueText?: string
  onChange: (value: number) => void
  /** Present while the draft differs from the saved plan. */
  onReset?: () => void
  /** Accessible name and tooltip of the reset button, e.g. "Reset Annual savings". */
  resetLabel: string
  /** The saved plan's value: a quiet mark on the track while the draft differs. */
  planValue?: number
  disabled?: boolean
}

/**
 * A what-if slider for the Stellschrauben section: label and value on one
 * line, the track below. It fires on every drag step — the store debounces
 * the recompute, so scrubbing stays live. Styled by `.ws-levers-slider*` in
 * `workspace/sections/levers.css`.
 */
export function InlineSlider({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  formattedValue,
  valueText,
  onChange,
  onReset,
  resetLabel,
  planValue,
  disabled = false,
}: InlineSliderProps) {
  const thumbRef = useRef<HTMLSpanElement>(null)
  const span = max - min
  const markPercent =
    planValue !== undefined &&
    planValue !== value &&
    span > 0 &&
    planValue >= min &&
    planValue <= max
      ? ((planValue - min) / span) * 100
      : null

  return (
    <div className="ws-levers-slider" data-disabled={disabled || undefined}>
      <div className="ws-levers-slider-head">
        <span className="ws-levers-slider-label" aria-hidden="true">
          {label}
        </span>
        {onReset && (
          <button
            type="button"
            className="ws-levers-slider-reset"
            aria-label={resetLabel}
            title={resetLabel}
            onClick={() => {
              onReset()
              // The button leaves with the difference; keep focus on the lever.
              thumbRef.current?.focus()
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        )}
        <span className="ws-levers-slider-value" aria-hidden="true">
          {formattedValue}
        </span>
      </div>
      <SliderPrimitive.Root
        className="ws-levers-slider-control"
        disabled={disabled}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
      >
        <SliderPrimitive.Track className="ws-levers-slider-track">
          <SliderPrimitive.Range className="ws-levers-slider-range" />
        </SliderPrimitive.Track>
        {markPercent !== null && (
          <span
            className="ws-levers-slider-mark"
            style={{ left: thumbCenter(markPercent) }}
            aria-hidden="true"
          />
        )}
        <SliderPrimitive.Thumb
          ref={thumbRef}
          className="ws-levers-slider-thumb"
          aria-label={ariaLabel}
          aria-valuetext={valueText ?? formattedValue}
          // Radix marks a disabled slider with data-disabled only.
          aria-disabled={disabled || undefined}
        />
      </SliderPrimitive.Root>
    </div>
  )
}
