'use client'

import * as SliderPrimitive from '@radix-ui/react-slider'

/**
 * The command bar's inline what-if lever (design 1b): 11px label, 3px track,
 * 9px round thumb, live value on the right. Fires on every drag step — the
 * simulation store debounces the recompute, so scrubbing is the live what-if
 * the design asks for.
 */
interface InlineSliderProps {
  label: string
  /** Accessible name; the visible label is abbreviated ("Save"). */
  ariaLabel: string
  value: number
  min: number
  max: number
  step: number
  /** Rendered to the right of the track, tabular-nums. */
  formattedValue: string
  /** Read out by screen readers instead of the raw number. */
  valueText?: string
  /** Fixed total width in px, straight from the mockup. */
  width: number
  onChange: (value: number) => void
}

export function InlineSlider({
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  formattedValue,
  valueText,
  width,
  onChange,
}: InlineSliderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, width }}>
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-label)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
        aria-hidden="true"
      >
        {label}
      </span>
      <SliderPrimitive.Root
        className="simx-slider"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
      >
        <SliderPrimitive.Track className="simx-slider-track">
          <SliderPrimitive.Range className="simx-slider-range" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="simx-slider-thumb"
          aria-label={ariaLabel}
          aria-valuetext={valueText ?? formattedValue}
        />
      </SliderPrimitive.Root>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {formattedValue}
      </span>
    </div>
  )
}
