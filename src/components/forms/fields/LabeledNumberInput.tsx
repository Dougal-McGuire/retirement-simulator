'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { HelpCircle, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  validation?: ValidationRule
  formatValue?: (value: number) => string
}

type ValidationState = 'valid' | 'warning' | 'error' | 'neutral'

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
  validation,
  formatValue,
}: LabeledNumberInputProps) {
  const [validationState, setValidationState] = useState<ValidationState>('neutral')
  const [validationMessage, setValidationMessage] = useState<string>('')
  const [touched, setTouched] = useState(false)

  // Validate value
  useEffect(() => {
    if (!touched && validationState === 'neutral') return

    if (validation) {
      // Check for errors (hard limits)
      if (validation.min !== undefined && value < validation.min) {
        setValidationState('error')
        setValidationMessage(validation.errorMessage || `Value must be at least ${validation.min}`)
        return
      }
      if (validation.max !== undefined && value > validation.max) {
        setValidationState('error')
        setValidationMessage(validation.errorMessage || `Value must be at most ${validation.max}`)
        return
      }

      // Check for warnings (typical ranges)
      if (validation.typicalMin !== undefined && value < validation.typicalMin) {
        setValidationState('warning')
        setValidationMessage(
          validation.warningMessage ||
            `Unusual: Typical range is ${validation.typicalMin} - ${validation.typicalMax ?? '∞'}`
        )
        return
      }
      if (validation.typicalMax !== undefined && value > validation.typicalMax) {
        setValidationState('warning')
        setValidationMessage(
          validation.warningMessage ||
            `Unusual: Typical range is ${validation.typicalMin ?? '0'} - ${validation.typicalMax}`
        )
        return
      }
    }

    // All good
    setValidationState('valid')
    setValidationMessage('')
  }, [value, validation, touched, validationState])

  const handleBlur = () => {
    setTouched(true)
  }

  const getValidationIcon = () => {
    switch (validationState) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-neo-red" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case 'valid':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      default:
        return null
    }
  }

  const getInputBorderClass = () => {
    if (!touched) return 'border-neo-black'
    switch (validationState) {
      case 'error':
        return 'border-neo-red border-3'
      case 'warning':
        return 'border-yellow-600 border-3'
      case 'valid':
        return 'border-green-600 border-3'
      default:
        return 'border-neo-black'
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label
          htmlFor={id}
          className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-neo-black"
        >
          {label}
        </Label>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="cursor-help focus:outline-none focus:ring-2 focus:ring-neo-blue focus:ring-offset-2 rounded-full"
                  aria-label={`More information about ${label}`}
                >
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70 transition-colors hover:text-neo-black" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="max-w-xs border-4 border-neo-black bg-neo-white px-3 py-2 text-neo-black shadow-neo"
              >
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] leading-relaxed">
                  {tooltip}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="relative">
        <Input
          id={id}
          type="number"
          value={value}
          onChange={(e) => {
            const raw = e.target.value
            const nextValue = raw === '' ? 0 : Number(raw)
            if (!Number.isFinite(nextValue)) return
            onChange(nextValue)
          }}
          onBlur={handleBlur}
          min={min}
          max={max}
          className={cn(
            'h-11 border-2 font-semibold uppercase tracking-[0.12em] pr-10',
            getInputBorderClass(),
            className
          )}
        />
        {touched && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{getValidationIcon()}</div>
        )}
      </div>

      {/* Validation message */}
      {touched && validationMessage && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-none border-2 px-3 py-2 text-[0.62rem] font-semibold uppercase tracking-[0.1em]',
            validationState === 'error' && 'border-neo-red bg-neo-red/10 text-neo-red',
            validationState === 'warning' && 'border-yellow-600 bg-yellow-50 text-yellow-800'
          )}
        >
          <span className="flex-shrink-0 mt-0.5">
            {validationState === 'error' ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="flex-1">{validationMessage}</span>
        </div>
      )}

      {/* Typical range hint */}
      {validation && (validation.typicalMin !== undefined || validation.typicalMax !== undefined) && (
        <p className="text-[0.62rem] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Typical range:{' '}
          {formatValue
            ? `${formatValue(validation.typicalMin ?? 0)} - ${formatValue(validation.typicalMax ?? 0)}`
            : `${validation.typicalMin ?? 0} - ${validation.typicalMax ?? '∞'}`}
        </p>
      )}

      {/* Help text */}
      {helpText && (
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {helpText}
        </p>
      )}
    </div>
  )
}
