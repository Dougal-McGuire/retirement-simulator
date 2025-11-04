'use client'

import { useEffect, useMemo, useState } from 'react'
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
  onUpdate: (index: number, income: OneTimeIncome) => void
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

  const handleCellChange = (
    listIndex: number,
    field: keyof OneTimeIncome,
    rawValue: string
  ) => {
    const numericValue = Number(rawValue)
    if (!Number.isFinite(numericValue)) return
    const existing = incomes[listIndex]
    if (!existing) return
    const nextIncome: OneTimeIncome = {
      ...existing,
      [field]:
        field === 'age'
          ? clamp(Math.round(numericValue), minAge, maxAge)
          : Math.max(0, Math.round(numericValue)),
    }
    onUpdate(listIndex, nextIncome)
  }

  return (
    <div className="space-y-4">
      {orderedIncomes.length === 0 ? (
        <p className="rounded-none border-3 border-dashed border-neo-black bg-neo-white/80 p-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {strings.empty}
        </p>
      ) : (
        <div className="overflow-hidden border-3 border-neo-black bg-neo-white shadow-neo-sm">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-0 border-b-3 border-neo-black bg-neo-black px-4 py-3 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-neo-white">
            <span>{strings.tableHeaders.age}</span>
            <span className="text-right">{strings.tableHeaders.amount}</span>
            <span className="text-right">{strings.tableHeaders.actions}</span>
          </div>
          <div className="divide-y-3 divide-neo-black">
            {orderedIncomes.map(({ age, amount, index: originalIndex }) => (
              <div
                key={`${originalIndex}-${age}-${amount}`}
                className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
              >
                <Input
                  type="number"
                  value={age}
                  min={minAge}
                  max={maxAge}
                  onChange={(event) => handleCellChange(originalIndex, 'age', event.target.value)}
                  className="h-10 border-2 border-neo-black bg-neo-white px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
                />
                <Input
                  type="number"
                  value={amount}
                  min={0}
                  onChange={(event) =>
                    handleCellChange(originalIndex, 'amount', event.target.value)
                  }
                  className="h-10 border-2 border-neo-black bg-neo-white px-3 py-2 text-right text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(originalIndex)}
                    className="h-10 min-w-[4.5rem] border-3 border-neo-black text-[0.62rem] font-bold uppercase tracking-[0.18em]"
                  >
                    {strings.remove}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-3 border-neo-black bg-neo-white px-4 py-5 shadow-neo-sm">
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))_auto]"
          onSubmit={handleDraftSubmit}
        >
          <div className="space-y-2">
            <Label
              htmlFor="one-time-income-age"
              className="text-[0.68rem] font-semibold uppercase tracking-[0.14em]"
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
              className="h-11 border-2 border-neo-black bg-neo-white px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="one-time-income-amount"
              className="text-[0.68rem] font-semibold uppercase tracking-[0.14em]"
            >
              {strings.amountLabel}
            </Label>
            <Input
              id="one-time-income-amount"
              type="number"
              value={draftAmount}
              min={0}
              onChange={(event) => setDraftAmount(Number(event.target.value))}
              className="h-11 border-2 border-neo-black bg-neo-white px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
            />
          </div>

          <div className="flex items-end justify-start sm:justify-end">
            <Button type="submit" variant="secondary" size="sm" className="h-11 px-6">
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
