'use client'

import * as SliderPrimitive from '@radix-ui/react-slider'

/**
 * The command bar's inline what-if lever. It fires on every drag step — the
 * simulation store debounces the recompute, so scrubbing stays live while the
 * larger typography and thumb make it comfortable on touch screens as well.
 */
interface InlineSliderProps {
  label: string
  ariaLabel: string
  value: number
  min: number
  max: number
  step: number
  formattedValue: string
  valueText?: string
  width: number
  onChange: (value: number) => void
  onReset?: () => void
  resetLabel?: string
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
  onReset,
  resetLabel,
}: InlineSliderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        flex: '1 1 auto',
        maxWidth: width,
        minWidth: Math.max(190, width - 70),
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: 'var(--text-label)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
        aria-hidden="true"
      >
        {label}
      </span>
      <SliderPrimitive.Root
        className="ds-slider"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
        style={{ minHeight: 34, flex: '1 1 90px' }}
      >
        <SliderPrimitive.Track className="ds-slider-track">
          <SliderPrimitive.Range className="ds-slider-range" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="ds-slider-thumb"
          aria-label={ariaLabel}
          aria-valuetext={valueText ?? formattedValue}
          style={{ width: 16, height: 16 }}
        />
      </SliderPrimitive.Root>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {formattedValue}
      </span>
      {onReset && (
        <button
          type="button"
          className="ds-btn ds-btn--ghost ds-btn--sm"
          aria-label={resetLabel ?? `Reset ${ariaLabel}`}
          title={resetLabel ?? `Reset ${ariaLabel}`}
          onClick={onReset}
          style={{
            flex: 'none',
            width: 32,
            minWidth: 32,
            minHeight: 32,
            padding: 0,
            fontSize: 17,
            lineHeight: 1,
          }}
        >
          ↺
        </button>
      )}
    </div>
  )
}
