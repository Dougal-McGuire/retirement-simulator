'use client'

import { useState, useMemo } from 'react'
import { Trash2, Edit2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CustomExpense, ExpenseInterval } from '@/types'

interface ExpenseListStrings {
  addButton: string
  empty: string
  nameLabel: string
  namePlaceholder: string
  amountLabel: string
  intervalLabel: string
  intervalMonthly: string
  intervalAnnual: string
  remove: string
  edit: string
  save: string
  cancel: string
  summaryLabel: string
  templatesLabel?: string
  tableHeaders: {
    name: string
    amount: string
    interval: string
    actions: string
  }
}

interface ExpenseTemplate {
  name: string
  amount: number
  interval: ExpenseInterval
}

interface ExpenseListProps {
  expenses: CustomExpense[]
  strings: ExpenseListStrings
  templates?: ExpenseTemplate[]
  onAdd: (expense: Omit<CustomExpense, 'id'>) => void
  onUpdate?: (id: string, expense: Omit<CustomExpense, 'id'>) => void
  onRemove: (id: string) => void
  formatCurrency: (value: number) => string
}

export function ExpenseList({
  expenses,
  strings,
  templates,
  onAdd,
  onUpdate,
  onRemove,
  formatCurrency,
}: ExpenseListProps) {
  const [draftName, setDraftName] = useState<string>('')
  const [draftAmount, setDraftAmount] = useState<number>(0)
  const [draftInterval, setDraftInterval] = useState<ExpenseInterval>('monthly')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState<string>('')
  const [editAmount, setEditAmount] = useState<number>(0)
  const [editInterval, setEditInterval] = useState<ExpenseInterval>('monthly')

  // Defensive check: ensure expenses is always an array
  const safeExpenses = Array.isArray(expenses) ? expenses : []

  const totalMonthly = safeExpenses
    .filter((e) => e.interval === 'monthly')
    .reduce((sum, e) => sum + e.amount, 0)
  const totalAnnual = safeExpenses
    .filter((e) => e.interval === 'annual')
    .reduce((sum, e) => sum + e.amount, 0)
  const totalCombined = totalMonthly * 12 + totalAnnual

  const handleAdd = () => {
    const trimmedName = draftName.trim()
    if (!trimmedName) return
    const sanitizedAmount = Math.max(0, Math.round(draftAmount))
    if (sanitizedAmount === 0) return

    onAdd({
      name: trimmedName,
      amount: sanitizedAmount,
      interval: draftInterval,
    })

    setDraftName('')
    setDraftAmount(0)
    setDraftInterval('monthly')
  }

  const handleStartEdit = (expense: CustomExpense) => {
    setEditingId(expense.id)
    setEditName(expense.name)
    setEditAmount(expense.amount)
    setEditInterval(expense.interval)
  }

  const handleSaveEdit = () => {
    if (!editingId || !onUpdate) return
    const trimmedName = editName.trim()
    if (!trimmedName) return
    const sanitizedAmount = Math.max(0, Math.round(editAmount))
    if (sanitizedAmount === 0) return

    onUpdate(editingId, {
      name: trimmedName,
      amount: sanitizedAmount,
      interval: editInterval,
    })

    setEditingId(null)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  const handleDraftSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    handleAdd()
  }

  const renderExpenseRow = (expense: CustomExpense) => {
    const isEditing = editingId === expense.id

    if (isEditing) {
      return (
        <tr key={expense.id} className="bg-neo-blue/5">
          <td className="px-4 py-3">
            <div className="flex flex-col gap-2">
              <Input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Name"
                className="h-10 border-2 border-neo-black bg-neo-white px-2 text-[0.68rem] font-semibold uppercase"
              />
              <Select value={editInterval} onValueChange={(v) => setEditInterval(v as ExpenseInterval)}>
                <SelectTrigger className="h-10 border-2 border-neo-black bg-neo-white px-2 text-[0.62rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{strings.intervalMonthly}</SelectItem>
                  <SelectItem value="annual">{strings.intervalAnnual}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </td>
          <td className="px-4 py-3">
            <Input
              type="number"
              value={editAmount}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : Number(e.target.value)
                setEditAmount(val)
              }}
              onBlur={() => {
                const clamped = Math.max(0, Math.round(editAmount))
                if (clamped !== editAmount) setEditAmount(clamped)
              }}
              className="h-10 border-2 border-neo-black bg-neo-white px-2 text-[0.68rem] font-semibold uppercase text-right"
            />
          </td>
          <td className="w-20 px-2 py-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleSaveEdit}
                className="h-8 w-8 text-green-600 hover:bg-green-600 hover:text-neo-white"
                aria-label={strings.save}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCancelEdit}
                className="h-8 w-8 text-neo-black hover:bg-neo-red hover:text-neo-white"
                aria-label={strings.cancel}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </td>
        </tr>
      )
    }

    return (
      <tr key={expense.id}>
        <td className="px-4 py-3 text-left">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.74rem] font-bold uppercase tracking-[0.12em]">
              {expense.name}
            </span>
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {expense.interval === 'monthly' ? strings.intervalMonthly : strings.intervalAnnual}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-[0.74rem] font-bold uppercase tracking-[0.12em]">
          {formatCurrency(expense.amount)}
        </td>
        <td className="w-20 px-2 py-3 text-center">
          <div className="flex items-center justify-center gap-1">
            {onUpdate && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleStartEdit(expense)}
                className="h-8 w-8 text-neo-black hover:bg-neo-blue hover:text-neo-white"
                aria-label={strings.edit}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(expense.id)}
              className="h-8 w-8 text-neo-black hover:bg-neo-red hover:text-neo-white"
              aria-label={strings.remove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-4">
      {safeExpenses.length === 0 ? (
        <div className="rounded-none border-3 border-neo-black bg-gradient-to-br from-neo-blue/5 to-neo-yellow/5 p-6 shadow-neo-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-full border-3 border-neo-black bg-neo-yellow p-3 shadow-neo">
              <svg
                className="h-6 w-6 text-neo-black"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v12m6-6H6"
                />
              </svg>
            </div>
            <p className="text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-neo-black">
              {strings.empty}
            </p>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground max-w-md">
              Add recurring and one-time expenses like insurance, groceries, vacations, or home repairs
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden border-3 border-neo-black bg-neo-white shadow-neo-sm">
          <table className="w-full">
            <thead className="border-b-3 border-neo-black bg-neo-black">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 text-left text-[0.65rem] font-bold uppercase tracking-[0.16em] text-neo-white">
                  {strings.tableHeaders.name}
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-[0.65rem] font-bold uppercase tracking-[0.16em] text-neo-white">
                  {strings.tableHeaders.amount}
                </th>
                <th className="w-20 whitespace-nowrap px-2 py-3 text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-neo-white">
                  {strings.tableHeaders.actions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y-3 divide-neo-black">
              {safeExpenses.map(renderExpenseRow)}
            </tbody>
          </table>
        </div>
      )}

      {templates && templates.length > 0 && (
        <div className="space-y-3">
          {strings.templatesLabel && (
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {strings.templatesLabel}
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {templates.map((template, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onAdd(template)}
                className="border-2 border-dashed border-neo-black bg-neo-white/50 px-3 py-2 text-left text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-neo-black transition-neo hover:-translate-y-[1px] hover:-translate-x-[1px] hover:bg-neo-yellow/20 hover:shadow-neo-sm"
              >
                <span className="block">{template.name}</span>
                <span className="mt-1 block text-[0.62rem] text-muted-foreground">
                  {formatCurrency(template.amount)} / {template.interval === 'monthly' ? strings.intervalMonthly : strings.intervalAnnual}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-3 border-neo-black bg-neo-white px-4 py-5 shadow-neo-sm">
        <form className="grid grid-cols-1 gap-4" onSubmit={handleDraftSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col sm:col-span-2">
              <Label
                htmlFor="expense-name"
                className="mb-2 block min-h-[2rem] text-[0.68rem] font-semibold uppercase tracking-[0.14em] leading-tight"
              >
                {strings.nameLabel}
              </Label>
              <Input
                id="expense-name"
                type="text"
                value={draftName}
                placeholder={strings.namePlaceholder}
                onChange={(event) => setDraftName(event.target.value)}
                className="h-11 w-full border-2 border-neo-black bg-neo-white px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
              />
            </div>

            <div className="flex flex-col">
              <Label
                htmlFor="expense-amount"
                className="mb-2 block min-h-[2rem] text-[0.68rem] font-semibold uppercase tracking-[0.14em] leading-tight"
              >
                {strings.amountLabel}
              </Label>
              <Input
                id="expense-amount"
                type="number"
                value={draftAmount}
                onChange={(event) => {
                  const val = event.target.value === '' ? 0 : Number(event.target.value)
                  setDraftAmount(val)
                }}
                onBlur={() => {
                  const clamped = Math.max(0, Math.round(draftAmount))
                  if (clamped !== draftAmount) setDraftAmount(clamped)
                }}
                className="h-11 w-full border-2 border-neo-black bg-neo-white px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
              />
            </div>

            <div className="flex flex-col">
              <Label
                htmlFor="expense-interval"
                className="mb-2 block min-h-[2rem] text-[0.68rem] font-semibold uppercase tracking-[0.14em] leading-tight"
              >
                {strings.intervalLabel}
              </Label>
              <Select value={draftInterval} onValueChange={(value) => setDraftInterval(value as ExpenseInterval)}>
                <SelectTrigger id="expense-interval" className="h-11 border-2 border-neo-black bg-neo-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{strings.intervalMonthly}</SelectItem>
                  <SelectItem value="annual">{strings.intervalAnnual}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-start">
            <Button type="submit" variant="secondary" size="sm" className="h-11 w-full px-6">
              {strings.addButton}
            </Button>
          </div>
        </form>
        <div className="mt-4 space-y-2 border-t-3 border-dashed border-neo-black pt-4 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <div className="flex justify-between">
            <span>{strings.intervalMonthly}:</span>
            <span>{formatCurrency(totalMonthly)}</span>
          </div>
          <div className="flex justify-between">
            <span>{strings.intervalAnnual}:</span>
            <span>{formatCurrency(totalAnnual)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-dashed border-neo-black pt-2 text-[0.7rem] font-bold text-neo-black">
            <span>{strings.summaryLabel}:</span>
            <span>{formatCurrency(totalCombined)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
