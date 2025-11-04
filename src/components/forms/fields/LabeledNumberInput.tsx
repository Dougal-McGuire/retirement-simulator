'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface LabeledNumberInputProps {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  className?: string
  helpText?: string
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
}: LabeledNumberInputProps) {
  return (
    <div className="space-y-2">
      <Label
        htmlFor={id}
        className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-neo-black"
      >
        {label}
      </Label>
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
        min={min}
        max={max}
        className={cn(
          'h-11 border-2 border-neo-black font-semibold uppercase tracking-[0.12em]',
          className
        )}
      />
      {helpText && (
        <p className="mt-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {helpText}
        </p>
      )}
    </div>
  )
}
