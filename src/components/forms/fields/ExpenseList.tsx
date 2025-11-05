'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
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
  summaryLabel: string
  tableHeaders: {
    name: string
    amount: string
    interval: string
    actions: string
  }
}

interface ExpenseListProps {
  expenses: CustomExpense[]
  strings: ExpenseListStrings
  onAdd: (expense: Omit<CustomExpense, 'id'>) => void
  onRemove: (id: string) => void
  formatCurrency: (value: number) => string
}

export function ExpenseList({
  expenses,
  strings,
  onAdd,
  onRemove,
  formatCurrency,
}: ExpenseListProps) {
  const [draftName, setDraftName] = useState<string>('')
  const [draftAmount, setDraftAmount] = useState<number>(0)
  const [draftInterval, setDraftInterval] = useState<ExpenseInterval>('monthly')

  const totalMonthly = expenses
    .filter((e) => e.interval === 'monthly')
    .reduce((sum, e) => sum + e.amount, 0)
  const totalAnnual = expenses
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

  const handleDraftSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    handleAdd()
  }

  return (
    <div className="space-y-4">
      {expenses.length === 0 ? (
        <p className="rounded-none border-3 border-dashed border-neo-black bg-neo-white/80 p-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {strings.empty}
        </p>
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
                <th className="whitespace-nowrap px-4 py-3 text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-neo-white">
                  {strings.tableHeaders.interval}
                </th>
                <th className="w-12 whitespace-nowrap px-2 py-3 text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-neo-white">
                  {strings.tableHeaders.actions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y-3 divide-neo-black">
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td className="px-4 py-3 text-left text-[0.74rem] font-bold uppercase tracking-[0.12em]">
                    {expense.name}
                  </td>
                  <td className="px-4 py-3 text-right text-[0.74rem] font-bold uppercase tracking-[0.12em]">
                    {formatCurrency(expense.amount)}
                  </td>
                  <td className="px-4 py-3 text-center text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {expense.interval === 'monthly'
                      ? strings.intervalMonthly
                      : strings.intervalAnnual}
                  </td>
                  <td className="w-12 px-2 py-3 text-center">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                min={0}
                onChange={(event) => setDraftAmount(Number(event.target.value))}
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
