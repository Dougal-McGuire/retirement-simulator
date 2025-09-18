'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

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
  className = 'mt-2',
  helpText,
}: LabeledNumberInputProps) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
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
        className={className}
      />
      {helpText && <p className="mt-1 text-sm text-slate-500">{helpText}</p>}
    </div>
  )
}
