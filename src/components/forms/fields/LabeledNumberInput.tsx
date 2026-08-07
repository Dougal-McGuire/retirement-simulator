'use client'

import { useMemo, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HelpCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGroupedNumber } from './useGroupedNumber'

export interface ValidationRule {
  min?: number
  max?: number
  typicalMin?: number
  typicalMax?: number
  warningMessage?: string
  errorMessage?: string
}

interface LabeledNumberInputProps {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  className?: string
  helpText?: string
  tooltip?: string
  /** Accessible label for the tooltip trigger (defaults to the field label). */
  tooltipAriaLabel?: string
  /** Short unit adornment rendered inside the input, e.g. "€" or "%/yr". */
  unit?: string
  /**
   * Show locale-aware thousands grouping while typing (630.000 / 630,000).
   * The value handed to `onChange` stays a plain number.
   */
  groupThousands?: boolean
  validation?: ValidationRule
  formatValue?: (value: number) => string
}

type ValidationState = 'error' | 'warning' | 'neutral'

function resolveValidation(
  value: number,
  validation?: ValidationRule
): { state: ValidationState; message: string } {
  if (!validation) return { state: 'neutral', message: '' }

  if (validation.min !== undefined && value < validation.min) {
    return {
      state: 'error',
      message: validation.errorMessage || `Value must be at least ${validation.min}`,
    }
  }
  if (validation.max !== undefined && value > validation.max) {
    return {
      state: 'error',
      message: validation.errorMessage || `Value must be at most ${validation.max}`,
    }
  }
  if (validation.typicalMin !== undefined && value < validation.typicalMin) {
    return {
      state: 'warning',
      message:
        validation.warningMessage ||
        `Unusual: typical range is ${validation.typicalMin} - ${validation.typicalMax ?? '∞'}`,
    }
  }
  if (validation.typicalMax !== undefined && value > validation.typicalMax) {
    return {
      state: 'warning',
      message:
        validation.warningMessage ||
        `Unusual: typical range is ${validation.typicalMin ?? 0} - ${validation.typicalMax}`,
    }
  }
  return { state: 'neutral', message: '' }
}

export function LabeledNumberInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  className,
  helpText,
  tooltip,
  tooltipAriaLabel,
  unit,
  groupThousands = false,
  validation,
  formatValue,
}: LabeledNumberInputProps) {
  const [touched, setTouched] = useState(false)
  const [draftValue, setDraftValue] = useState(() => String(value))
  const [isEditing, setIsEditing] = useState(false)
  const grouped = useGroupedNumber(0)

  const restValue = groupThousands ? grouped.format(value) : String(value)
  const displayValue = isEditing ? draftValue : restValue

  const { state: validationState, message: validationMessage } = useMemo(
    () => resolveValidation(value, validation),
    [value, validation]
  )

  // Reward early, punish late: surface issues only after first blur.
  const showValidation = touched && validationState !== 'neutral'

  const handleBlur = () => {
    setTouched(true)
    setIsEditing(false)

    const trimmedValue = draftValue.trim()
    if (!trimmedValue) return

    const parsedValue = groupThousands ? grouped.parse(trimmedValue) : Number(trimmedValue)
    if (!Number.isFinite(parsedValue)) return

    // Clamp value to min/max constraints on blur
    let clampedValue = parsedValue
    if (min !== undefined && clampedValue < min) {
      clampedValue = min
    }
    if (max !== undefined && clampedValue > max) {
      clampedValue = max
    }

    if (clampedValue !== value) {
      onChange(clampedValue)
    }
  }

  const descriptionIds: string[] = []
  if (helpText) {
    descriptionIds.push(`${id}-help`)
  }
  if (showValidation) {
    descriptionIds.push(`${id}-validation-message`)
  }
  const describedBy = descriptionIds.length > 0 ? descriptionIds.join(' ') : undefined

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label
          htmlFor={id}
          className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-neo-black"
        >
          {label}
        </Label>
        {tooltip && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="cursor-help rounded-full focus:outline-none focus:ring-2 focus:ring-neo-blue focus:ring-offset-2"
                  aria-label={tooltipAriaLabel ?? label}
                >
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70 transition-colors hover:text-neo-black" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-xs border-2 border-neo-black bg-neo-white px-3 py-2 text-neo-black shadow-neo-sm"
              >
                <p className="text-xs font-medium normal-case leading-relaxed">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="relative">
        <Input
          id={id}
          ref={groupThousands ? grouped.inputRef : undefined}
          type={groupThousands ? 'text' : 'number'}
          inputMode={groupThousands ? 'numeric' : 'decimal'}
          autoComplete="off"
          value={displayValue}
          onFocus={() => {
            setDraftValue(restValue)
            setIsEditing(true)
          }}
          onChange={(e) => {
            if (groupThousands) {
              const { display, numeric } = grouped.handleChange(e)
              setDraftValue(display)
              if (Number.isFinite(numeric)) onChange(numeric)
              return
            }

            const raw = e.target.value
            setDraftValue(raw)
            if (raw.trim() === '' || raw === '-' || raw === '.' || raw === '-.') return

            const nextValue = Number(raw)
            if (!Number.isFinite(nextValue)) return
            onChange(nextValue)
          }}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            }
          }}
          aria-describedby={describedBy}
          aria-invalid={showValidation && validationState === 'error' ? true : undefined}
          className={cn(
            'h-11 border-2 text-sm font-semibold tabular-nums',
            unit && 'pr-12',
            showValidation && validationState === 'error' && 'border-neo-red',
            showValidation && validationState === 'warning' && 'border-neo-orange',
            className
          )}
        />
        {unit && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground"
          >
            {unit}
          </span>
        )}
      </div>

      {/* Validation message */}
      {showValidation && (
        <div
          id={`${id}-validation-message`}
          role={validationState === 'error' ? 'alert' : 'status'}
          className={cn(
            'flex items-start gap-2 border-2 px-3 py-2 text-xs font-medium leading-relaxed',
            validationState === 'error' && 'border-neo-red/60 bg-neo-red/10 text-neo-red',
            validationState === 'warning' &&
              'border-neo-orange/60 bg-neo-orange/10 text-neo-black'
          )}
        >
          <span className="mt-0.5 flex-shrink-0">
            {validationState === 'error' ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-neo-orange" />
            )}
          </span>
          <span className="flex-1">
            {validationMessage}
            {formatValue &&
              validation &&
              validation.typicalMin !== undefined &&
              validation.typicalMax !== undefined && (
                <span className="mt-0.5 block text-muted-foreground">
                  {formatValue(validation.typicalMin)} – {formatValue(validation.typicalMax)}
                </span>
              )}
          </span>
        </div>
      )}

      {/* Help text */}
      {helpText && (
        <p id={`${id}-help`} className="text-xs font-medium leading-relaxed text-muted-foreground">
          {helpText}
        </p>
      )}
    </div>
  )
}
