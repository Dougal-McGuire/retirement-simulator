'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HelpCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { evaluateNumericDraft, type RangeIssue } from '@/lib/validation/fieldValidation'
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
  /**
   * Where `helpText` is shown. `inline` (default) prints it under the field;
   * `tooltip` folds it into the ⓘ next to the label and keeps it visually
   * hidden for `aria-describedby`, so the form stays quiet without losing the
   * words for assistive technology.
   */
  helpPlacement?: 'inline' | 'tooltip'
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
  /**
   * Message shown when the typed number falls outside `min`/`max`. Supply an
   * already-translated string — the fallback below is a developer safety net,
   * not user-facing copy.
   */
  rangeMessage?: string
  /** Message for text that is not a number at all. Falls back to `rangeMessage`. */
  invalidMessage?: string
  /**
   * Called whenever the field starts or stops refusing what the user typed, so
   * a parent can grey out the chips it derives from this value.
   */
  onInvalidChange?: (invalid: boolean) => void
  /** Greys the field out and stops editing (e.g. an input the active market model ignores). */
  disabled?: boolean
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
  helpPlacement = 'inline',
  tooltip,
  tooltipAriaLabel,
  unit,
  groupThousands = false,
  validation,
  formatValue,
  rangeMessage,
  invalidMessage,
  onInvalidChange,
  disabled = false,
}: LabeledNumberInputProps) {
  const [touched, setTouched] = useState(false)
  const [draftValue, setDraftValue] = useState(() => String(value))
  const [isEditing, setIsEditing] = useState(false)
  /**
   * Set once an entry has been *refused*. While it is set the rejected text
   * stays in the box — silently replacing it with the clamped value was the
   * whole bug: the field said 100, the plan meant something else, and the
   * derived chips next to it went quietly stale.
   */
  const [rangeIssue, setRangeIssue] = useState<RangeIssue | null>(null)
  const grouped = useGroupedNumber(0)

  const bounds = useMemo(() => ({ min, max }), [min, max])
  const restValue = groupThousands ? grouped.format(value) : String(value)
  const displayValue = isEditing || rangeIssue !== null ? draftValue : restValue

  const notifyInvalid = useRef(onInvalidChange)
  notifyInvalid.current = onInvalidChange

  // Mirrored in a ref so the parent notification happens in the event handler
  // rather than inside a state updater, which React may replay during render.
  const rangeIssueRef = useRef<RangeIssue | null>(null)
  const applyIssue = (next: RangeIssue | null) => {
    if (rangeIssueRef.current === next) return
    rangeIssueRef.current = next
    setRangeIssue(next)
    notifyInvalid.current?.(next !== null)
  }

  // A value that changed from somewhere else (reset, plan switch, a preset)
  // supersedes whatever was refused here, so the field stops complaining.
  const lastExternalValue = useRef(value)
  useEffect(() => {
    if (lastExternalValue.current === value) return
    lastExternalValue.current = value
    if (isEditing) return
    if (rangeIssueRef.current === null) return
    rangeIssueRef.current = null
    setRangeIssue(null)
    notifyInvalid.current?.(false)
  }, [value, isEditing])

  // Unmounting with an unresolved error would otherwise leave the parent
  // greying out chips forever (the plan editor tab remounts on every visit).
  useEffect(() => {
    return () => {
      if (rangeIssueRef.current !== null) notifyInvalid.current?.(false)
    }
  }, [])

  const { state: typicalState, message: typicalMessage } = useMemo(
    () => resolveValidation(value, validation),
    [value, validation]
  )

  const rangeText = (() => {
    if (rangeIssue === null) return ''
    if (rangeIssue === 'invalid') {
      return invalidMessage ?? rangeMessage ?? validation?.errorMessage ?? 'Enter a number.'
    }
    if (rangeMessage) return rangeMessage
    if (validation?.errorMessage) return validation.errorMessage
    if (min !== undefined && max !== undefined) return `Enter a value between ${min} and ${max}.`
    if (rangeIssue === 'below') return `Value must be at least ${min}`
    return `Value must be at most ${max}`
  })()

  // Reward early, punish late: the typical-range warning waits for the first
  // blur, while a refused entry always explains itself immediately.
  const showTypical = touched && typicalState !== 'neutral' && rangeIssue === null
  const validationState: ValidationState =
    rangeIssue !== null ? 'error' : showTypical ? typicalState : 'neutral'
  const validationMessage = rangeIssue !== null ? rangeText : showTypical ? typicalMessage : ''
  const showValidation = validationState !== 'neutral'

  /** Commits when the text is usable, refuses (and keeps it) when it is not. */
  const evaluate = (raw: string) =>
    evaluateNumericDraft(raw, bounds, groupThousands ? grouped.parse : undefined)

  const handleDraft = (raw: string) => {
    const { issue, value: parsed } = evaluate(raw)

    if (parsed !== null) {
      applyIssue(null)
      if (parsed !== value) onChange(parsed)
      return
    }

    // Out of range mid-typing ("1" on the way to "16") stays silent until the
    // field has been left once; after that it re-checks on every keystroke so
    // the message disappears the moment the entry becomes usable.
    if (issue !== null && rangeIssue !== null) applyIssue(issue)
  }

  const handleBlur = () => {
    setTouched(true)
    setIsEditing(false)

    const { issue, value: parsed } = evaluate(draftValue)

    if (parsed !== null) {
      applyIssue(null)
      if (parsed !== value) onChange(parsed)
      return
    }

    // Empty or half-typed: nothing was asked for, so snap back to the value in
    // force rather than inventing an error.
    applyIssue(issue)
  }

  const descriptionIds: string[] = []
  if (helpText) {
    descriptionIds.push(`${id}-help`)
  }
  if (showValidation) {
    descriptionIds.push(`${id}-validation-message`)
  }
  const describedBy = descriptionIds.length > 0 ? descriptionIds.join(' ') : undefined
  const foldedHelp = Boolean(helpText) && helpPlacement === 'tooltip'
  const tUi = useTranslations('ui')

  return (
    <div
      className={cn('space-y-2', disabled && 'opacity-55')}
      aria-disabled={disabled || undefined}
    >
      <div className="flex items-center gap-1.5">
        <Label
          htmlFor={id}
          className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-neo-black"
        >
          {label}
        </Label>
        {(tooltip || foldedHelp) && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="cursor-help rounded-full focus:outline-none focus:ring-2 focus:ring-neo-blue focus:ring-offset-2"
                  aria-label={tooltipAriaLabel ?? tUi('fieldHelp', { label })}
                >
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70 transition-colors hover:text-neo-black" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-xs border-2 border-neo-black bg-neo-white px-3 py-2 text-neo-black shadow-neo-sm"
              >
                {tooltip && (
                  <p className="text-xs font-medium normal-case leading-relaxed">{tooltip}</p>
                )}
                {foldedHelp && (
                  <p
                    className={cn(
                      'text-xs font-medium normal-case leading-relaxed',
                      tooltip && 'mt-1.5 text-muted-foreground'
                    )}
                  >
                    {helpText}
                  </p>
                )}
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
          disabled={disabled}
          inputMode={groupThousands ? 'numeric' : 'decimal'}
          autoComplete="off"
          value={displayValue}
          onFocus={() => {
            setDraftValue(rangeIssue !== null ? draftValue : restValue)
            setIsEditing(true)
          }}
          onChange={(e) => {
            if (groupThousands) {
              const { display } = grouped.handleChange(e)
              setDraftValue(display)
              handleDraft(display)
              return
            }

            const raw = e.target.value
            setDraftValue(raw)
            handleDraft(raw)
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
          data-testid={`${id}-validation-message`}
          role={validationState === 'error' ? 'alert' : 'status'}
          className={cn(
            'flex items-start gap-2 border-2 px-3 py-2 text-xs font-medium leading-relaxed',
            validationState === 'error' && 'border-neo-red/60 bg-neo-red/10 text-neo-red',
            validationState === 'warning' && 'border-neo-orange/60 bg-neo-orange/10 text-neo-black'
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
            {rangeIssue === null &&
              formatValue &&
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
        <p
          id={`${id}-help`}
          className={cn(
            foldedHelp ? 'sr-only' : 'text-xs font-medium leading-relaxed text-muted-foreground'
          )}
        >
          {helpText}
        </p>
      )}
    </div>
  )
}
