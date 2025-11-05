'use client'

import { useEffect, useMemo, useState } from 'react'
import { Trash2, Edit2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OneTimeIncome } from '@/types'

interface OneTimeIncomeListStrings {
  addButton: string
  empty: string
  nameLabel: string
  namePlaceholder: string
  ageLabel: string
  agePrefix: string
  amountLabel: string
  remove: string
  edit: string
  save: string
  cancel: string
  summaryLabel: string
  tableHeaders: {
    name: string
    age: string
    amount: string
    actions: string
  }
}

interface OneTimeIncomeListProps {
  incomes: OneTimeIncome[]
  minAge: number
  maxAge: number
  defaultAge: number
  strings: OneTimeIncomeListStrings
  onAdd: (income: OneTimeIncome) => void
  onUpdate?: (index: number, income: OneTimeIncome) => void
  onRemove: (index: number) => void
  formatCurrency: (value: number) => string
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function OneTimeIncomeList({
  incomes,
  minAge,
  maxAge,
  defaultAge,
  strings,
  onAdd,
  onUpdate,
  onRemove,
  formatCurrency,
}: OneTimeIncomeListProps) {
  const [draftName, setDraftName] = useState<string>('')
  const [draftAge, setDraftAge] = useState<number>(defaultAge)
  const [draftAmount, setDraftAmount] = useState<number>(0)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editName, setEditName] = useState<string>('')
  const [editAge, setEditAge] = useState<number>(defaultAge)
  const [editAmount, setEditAmount] = useState<number>(0)

  useEffect(() => {
    setDraftAge(defaultAge)
  }, [defaultAge])

  const orderedIncomes = useMemo(
    () =>
      incomes
        .map((income, index) => ({ ...income, index }))
        .sort((a, b) => {
          // Sort by age first, then by name if ages are equal
          if (a.age !== b.age) return a.age - b.age
          // Handle cases where name might not exist (legacy data)
          const nameA = a.name || ''
          const nameB = b.name || ''
          return nameA.localeCompare(nameB)
        }),
    [incomes]
  )

  const totalAmount = useMemo(
    () => incomes.reduce((sum, income) => sum + income.amount, 0),
    [incomes]
  )

  const handleAdd = () => {
    const trimmedName = draftName.trim()
    if (!trimmedName) return // Name is required

    const nextAge = clamp(Math.round(draftAge), minAge, maxAge)
    const nextAmount = Math.max(0, Math.round(draftAmount))
    if (!Number.isFinite(nextAge) || !Number.isFinite(nextAmount)) return
    if (nextAmount === 0) return

    onAdd({
      name: trimmedName,
      age: nextAge,
      amount: nextAmount,
    })
    setDraftName('')
    setDraftAge(defaultAge)
    setDraftAmount(0)
  }

  const handleStartEdit = (income: OneTimeIncome & { index: number }) => {
    setEditingIndex(income.index)
    setEditName(income.name)
    setEditAge(income.age)
    setEditAmount(income.amount)
  }

  const handleSaveEdit = () => {
    if (editingIndex === null || !onUpdate) return
    const trimmedName = editName.trim()
    if (!trimmedName) return // Name is required

    const nextAge = clamp(Math.round(editAge), minAge, maxAge)
    const nextAmount = Math.max(0, Math.round(editAmount))
    if (!Number.isFinite(nextAge) || !Number.isFinite(nextAmount)) return
    if (nextAmount === 0) return

    onUpdate(editingIndex, {
      name: trimmedName,
      age: nextAge,
      amount: nextAmount,
    })

    setEditingIndex(null)
  }

  const handleCancelEdit = () => {
    setEditingIndex(null)
  }

  const handleDraftSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    handleAdd()
  }

  const renderIncomeRow = (income: OneTimeIncome & { index: number }) => {
    const isEditing = editingIndex === income.index

    if (isEditing) {
      return (
        <tr key={`edit-${income.index}`} className="bg-neo-blue/5">
          <td className="px-4 py-3">
            <div className="flex flex-col gap-2">
              <Input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Name"
                className="h-10 border-2 border-neo-black bg-neo-white px-2 text-[0.68rem] font-semibold uppercase"
              />
              <Input
                type="number"
                value={editAge}
                min={minAge}
                max={maxAge}
                onChange={(e) => setEditAge(Number(e.target.value))}
                className="h-10 border-2 border-neo-black bg-neo-white px-2 text-[0.68rem] font-semibold uppercase"
              />
            </div>
          </td>
          <td className="px-4 py-3">
            <Input
              type="number"
              value={editAmount}
              min={0}
              onChange={(e) => setEditAmount(Number(e.target.value))}
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
      <tr key={`view-${income.index}`}>
        <td className="px-4 py-3 text-left">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.74rem] font-bold uppercase tracking-[0.12em]">
              {income.name || `${strings.agePrefix} ${income.age}`}
            </span>
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {strings.agePrefix} {income.age}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-[0.74rem] font-bold uppercase tracking-[0.12em]">
          {formatCurrency(income.amount)}
        </td>
        <td className="w-20 px-2 py-3 text-center">
          <div className="flex items-center justify-center gap-1">
            {onUpdate && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleStartEdit(income)}
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
              onClick={() => onRemove(income.index)}
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
      {orderedIncomes.length === 0 ? (
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
              Add expected windfalls like inheritances, insurance payouts, property sales, or bonus payments
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
              {orderedIncomes.map(renderIncomeRow)}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-3 border-neo-black bg-neo-white px-4 py-5 shadow-neo-sm">
        <form
          className="grid grid-cols-1 gap-4"
          onSubmit={handleDraftSubmit}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col sm:col-span-2">
              <Label
                htmlFor="one-time-income-name"
                className="mb-2 block min-h-[2rem] text-[0.68rem] font-semibold uppercase tracking-[0.14em] leading-tight"
              >
                {strings.nameLabel}
              </Label>
              <Input
                id="one-time-income-name"
                type="text"
                value={draftName}
                placeholder={strings.namePlaceholder}
                onChange={(event) => setDraftName(event.target.value)}
                className="h-11 w-full border-2 border-neo-black bg-neo-white px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
                required
              />
            </div>

            <div className="flex flex-col">
              <Label
                htmlFor="one-time-income-age"
                className="mb-2 block min-h-[2rem] text-[0.68rem] font-semibold uppercase tracking-[0.14em] leading-tight"
              >
                {strings.ageLabel}
              </Label>
              <Input
                id="one-time-income-age"
                type="number"
                value={draftAge}
                min={minAge}
                max={maxAge}
                onChange={(event) => setDraftAge(Number(event.target.value))}
                className="h-11 w-full border-2 border-neo-black bg-neo-white px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
              />
            </div>

            <div className="flex flex-col">
              <Label
                htmlFor="one-time-income-amount"
                className="mb-2 block min-h-[2rem] text-[0.68rem] font-semibold uppercase tracking-[0.14em] leading-tight"
              >
                {strings.amountLabel}
              </Label>
              <Input
                id="one-time-income-amount"
                type="number"
                value={draftAmount}
                min={0}
                onChange={(event) => setDraftAmount(Number(event.target.value))}
                className="h-11 w-full border-2 border-neo-black bg-neo-white px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
              />
            </div>
          </div>

          <div className="flex items-center justify-start">
            <Button type="submit" variant="secondary" size="sm" className="h-11 w-full px-6">
              {strings.addButton}
            </Button>
          </div>
        </form>
        <div className="mt-4 border-t-3 border-dashed border-neo-black pt-4 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {strings.summaryLabel}: {formatCurrency(totalAmount)}
        </div>
      </div>
    </div>
  )
}
