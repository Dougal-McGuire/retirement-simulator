'use client'

import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export interface SegmentedRadioOption<T> {
  value: T
  label: ReactNode
  /** Stable key (defaults to `String(value)`). */
  key?: string
}

interface SegmentedRadioProps<T> {
  options: readonly SegmentedRadioOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
  testId?: string
  /** Classes for one option, by state. */
  optionClassName?: (checked: boolean) => string | undefined
}

/**
 * A segmented control with the WAI-ARIA radio-group keyboard pattern: one
 * tab stop (the checked option, roving `tabIndex`), arrow keys move the
 * selection and focus together (wrapping), and every option is a real
 * `type="button"`. Shared by the appearance switch and the € display switch.
 */
export function SegmentedRadio<T>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  testId,
  optionClassName,
}: SegmentedRadioProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (!step) return
    event.preventDefault()
    const count = options.length
    // Move from the focused radio (WAI-ARIA radio group), not the stored value.
    const focused = refs.current.findIndex((node) => node === document.activeElement)
    const index =
      focused >= 0 ? focused : options.findIndex((option) => Object.is(option.value, value))
    const next = (Math.max(0, index) + step + count) % count
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid={testId}
      onKeyDown={onKeyDown}
      className={className}
    >
      {options.map((option, index) => {
        const checked = Object.is(option.value, value)
        return (
          <button
            key={option.key ?? String(option.value)}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-value={option.key ?? String(option.value)}
            onClick={() => onChange(option.value)}
            className={optionClassName?.(checked)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
