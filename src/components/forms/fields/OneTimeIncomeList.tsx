'use client'

import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OneTimeIncome } from '@/types'

interface OneTimeIncomeListStrings {
  addButton: string
  empty: string
  ageLabel: string
  amountLabel: string
  remove: string
  summaryLabel: string
  tableHeaders: {
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
  onRemove,
  formatCurrency,
}: OneTimeIncomeListProps) {
  const [draftAge, setDraftAge] = useState<number>(defaultAge)
  const [draftAmount, setDraftAmount] = useState<number>(0)

  useEffect(() => {
    setDraftAge(defaultAge)
  }, [defaultAge])

  const orderedIncomes = useMemo(
    () =>
      incomes
        .map((income, index) => ({ ...income, index }))
        .sort((a, b) => a.age - b.age),
    [incomes]
  )

  const totalAmount = useMemo(
    () => incomes.reduce((sum, income) => sum + income.amount, 0),
    [incomes]
  )

  const handleAdd = () => {
    const nextAge = clamp(Math.round(draftAge), minAge, maxAge)
    const nextAmount = Math.max(0, Math.round(draftAmount))
    if (!Number.isFinite(nextAge) || !Number.isFinite(nextAmount)) return
    if (nextAmount === 0) return

    onAdd({ age: nextAge, amount: nextAmount })
    setDraftAge(defaultAge)
    setDraftAmount(0)
  }

  const handleDraftSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    handleAdd()
  }

  return (
    <div className="space-y-4">
      {orderedIncomes.length === 0 ? (
        <p className="rounded-none border-3 border-dashed border-neo-black bg-neo-white/80 p-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {strings.empty}
        </p>
      ) : (
        <div className="overflow-hidden border-3 border-neo-black bg-neo-white shadow-neo-sm">
          <table className="w-full">
            <thead className="border-b-3 border-neo-black bg-neo-black">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 text-left text-[0.65rem] font-bold uppercase tracking-[0.16em] text-neo-white">
                  {strings.tableHeaders.age}
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-[0.65rem] font-bold uppercase tracking-[0.16em] text-neo-white">
                  {strings.tableHeaders.amount}
                </th>
                <th className="w-12 whitespace-nowrap px-2 py-3 text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-neo-white">
                  {strings.tableHeaders.actions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y-3 divide-neo-black">
              {orderedIncomes.map(({ age, amount, index: originalIndex }) => (
                <tr key={`${originalIndex}-${age}-${amount}`}>
                  <td className="px-4 py-3 text-left text-[0.74rem] font-bold uppercase tracking-[0.12em]">
                    {age}
                  </td>
                  <td className="px-4 py-3 text-right text-[0.74rem] font-bold uppercase tracking-[0.12em]">
                    {formatCurrency(amount)}
                  </td>
                  <td className="w-12 px-2 py-3 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemove(originalIndex)}
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
        <form
          className="grid grid-cols-1 gap-4"
          onSubmit={handleDraftSubmit}
        >
          <div className="grid grid-cols-2 gap-4">
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
