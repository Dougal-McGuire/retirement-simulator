'use client'

import { useEffect, useMemo, useState } from 'react'
import { Trash2, Edit2, Check, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OneTimeIncome } from '@/types'
import { useGroupedNumber } from './useGroupedNumber'
import { FlowOffTag, FlowSwitch } from './FlowSwitch'
import type { OneOffIncomeEntry } from './oneOffIncomeFlows'
import { cn } from '@/lib/utils'

interface OneTimeIncomeListStrings {
  addButton: string
  empty: string
  emptyHint?: string
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
  /** Hint explaining why the add button is disabled. */
  addHint?: string
  /** Screen-reader header of the switch column. */
  switchColumn?: string
  /** "1 Posten ausgeschaltet – in keiner Summe", when any is. */
  switchedOffSummary?: string
  tableHeaders: {
    name: string
    age: string
    amount: string
    actions: string
  }
}

interface OneTimeIncomeListProps {
  /**
   * Every one-off income flow, switched on or off (read from `cashFlows`,
   * not from the legacy projection, which omits switched-off ones).
   */
  incomes: OneOffIncomeEntry[]
  minAge: number
  maxAge: number
  defaultAge: number
  strings: OneTimeIncomeListStrings
  onAdd: (income: OneTimeIncome) => void
  onUpdate?: (id: string, income: OneTimeIncome) => void
  onRemove: (id: string) => void
  /** Flips the flow's switch; without it the list shows no switches. */
  onToggle?: (id: string) => void
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
  onToggle,
  formatCurrency,
}: OneTimeIncomeListProps) {
  const [draftName, setDraftName] = useState<string>('')
  const [draftAge, setDraftAge] = useState<string>(String(defaultAge))
  const [draftAmount, setDraftAmount] = useState<string>('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState<string>('')
  const [editAge, setEditAge] = useState<string>(String(defaultAge))
  const [editAmount, setEditAmount] = useState<string>('')
  const draftAmountField = useGroupedNumber(0)
  const editAmountField = useGroupedNumber(0)

  useEffect(() => {
    setDraftAge(String(defaultAge))
  }, [defaultAge])

  const orderedIncomes = useMemo(
    () =>
      [...incomes].sort((a, b) => {
        // Sort by age first, then by name if ages are equal
        if (a.age !== b.age) return a.age - b.age
        // Handle cases where name might not exist (legacy data)
        const nameA = a.name || ''
        const nameB = b.name || ''
        return nameA.localeCompare(nameB)
      }),
    [incomes]
  )

  // A switched-off income stays listed but counts in no total.
  const totalAmount = useMemo(
    () => incomes.reduce((sum, income) => (income.enabled ? sum + income.amount : sum), 0),
    [incomes]
  )
  const hasSwitchedOff = incomes.some((income) => !income.enabled)
  const isEmpty = orderedIncomes.length === 0
  const trimmedDraftName = draftName.trim()
  const parsedDraftAmount = draftAmountField.parse(draftAmount)
  const sanitizedDraftAmount = Number.isFinite(parsedDraftAmount)
    ? Math.max(0, Math.round(parsedDraftAmount))
    : 0
  const canAddDraft = trimmedDraftName.length > 0 && sanitizedDraftAmount > 0

  const handleAdd = () => {
    if (!canAddDraft) return

    const parsedAge = Number(draftAge)
    const nextAge = clamp(Math.round(parsedAge), minAge, maxAge)
    if (!Number.isFinite(nextAge)) return

    onAdd({
      name: trimmedDraftName,
      age: nextAge,
      amount: sanitizedDraftAmount,
    })
    setDraftName('')
    setDraftAge(String(defaultAge))
    setDraftAmount('')
  }

  const handleStartEdit = (income: OneOffIncomeEntry) => {
    setEditingId(income.id)
    setEditName(income.name)
    setEditAge(String(income.age))
    setEditAmount(editAmountField.format(income.amount))
  }

  const handleSaveEdit = () => {
    if (editingId === null || !onUpdate) return
    const trimmedName = editName.trim()
    if (!trimmedName) return // Name is required

    const parsedAge = Number(editAge)
    const parsedAmount = editAmountField.parse(editAmount)
    const nextAge = clamp(Math.round(parsedAge), minAge, maxAge)
    const nextAmount = Math.max(0, Math.round(parsedAmount))
    if (!Number.isFinite(nextAge) || !Number.isFinite(nextAmount)) return
    if (nextAmount === 0) return

    onUpdate(editingId, {
      name: trimmedName,
      age: nextAge,
      amount: nextAmount,
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

  const getIncomeName = (income: OneTimeIncome) =>
    income.name || `${strings.agePrefix} ${income.age}`

  const getIncomeContext = (income: OneTimeIncome) =>
    `${getIncomeName(income)}, ${strings.agePrefix} ${income.age}, ${formatCurrency(income.amount)}`

  const getIncomeControlLabel = (label: string, income: OneTimeIncome) =>
    `${label}: ${getIncomeContext(income)}`

  const renderIncomeRow = (income: OneOffIncomeEntry) => {
    const isEditing = editingId === income.id
    const on = income.enabled

    if (isEditing) {
      return (
        <tr key={`edit-${income.id}`} className="bg-accent/5">
          {onToggle && <td className="w-px py-2 pl-1 pr-0 sm:pl-2" />}
          <td className="px-2 py-2 sm:px-3">
            <div className="flex flex-col gap-2">
              <Input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={strings.namePlaceholder}
                className="rounded-sm h-10 border-2 border-border px-2 text-[0.68rem] font-semibold "
                aria-label={getIncomeControlLabel(strings.nameLabel, income)}
              />
              <Input
                type="number"
                value={editAge}
                onChange={(e) => {
                  setEditAge(e.target.value)
                }}
                onBlur={() => {
                  if (!editAge.trim()) return
                  const clamped = clamp(Math.round(Number(editAge)), minAge, maxAge)
                  if (Number.isFinite(clamped)) {
                    setEditAge(String(clamped))
                  }
                }}
                className="rounded-sm h-10 border-2 border-border px-2 text-[0.68rem] font-semibold "
                aria-label={getIncomeControlLabel(strings.ageLabel, income)}
              />
            </div>
          </td>
          <td className="px-2 py-2 sm:px-3">
            <Input
              ref={editAmountField.inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={editAmount}
              onChange={(e) => {
                setEditAmount(editAmountField.handleChange(e).display)
              }}
              onBlur={() => {
                if (!editAmount.trim()) return
                const clamped = Math.max(0, Math.round(editAmountField.parse(editAmount)))
                if (Number.isFinite(clamped)) {
                  setEditAmount(editAmountField.format(clamped))
                }
              }}
              className="rounded-sm h-10 border-2 border-border px-2 text-[0.68rem] font-semibold  text-right"
              aria-label={getIncomeControlLabel(strings.amountLabel, income)}
            />
          </td>
          <td className="w-20 px-1 py-2 text-center sm:px-2">
            <div className="flex items-center justify-center gap-0 sm:gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleSaveEdit}
                className="h-8 w-8 text-ok hover:bg-ok hover:text-on-hue"
                aria-label={getIncomeControlLabel(strings.save, income)}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCancelEdit}
                className="h-8 w-8 text-ink hover:bg-danger hover:text-muted-foreground"
                aria-label={getIncomeControlLabel(strings.cancel, income)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </td>
        </tr>
      )
    }

    return (
      <tr
        key={`view-${income.id}`}
        data-testid={`one-time-income-row-${income.id}`}
        data-enabled={on ? 'true' : 'false'}
        className={on ? undefined : 'bg-muted/30'}
      >
        {onToggle && (
          <td className="w-px py-2 pl-1 pr-0 sm:pl-2 align-middle">
            <FlowSwitch
              id={`one-time-income-switch-${income.id}`}
              name={getIncomeName(income)}
              on={on}
              onToggle={() => onToggle(income.id)}
            />
          </td>
        )}
        <td className="px-2 py-2 text-left sm:px-3">
          <div className="flex flex-col gap-0.5">
            <span className={cn('text-[0.74rem] font-bold', !on && 'text-muted-foreground')}>
              {getIncomeName(income)}
              {!on && <FlowOffTag testId={`one-time-income-off-${income.id}`} />}
            </span>
            <span className="text-[0.62rem] font-semibold   text-muted-foreground">
              {strings.agePrefix} {income.age}
            </span>
          </div>
        </td>
        <td
          className={cn(
            'px-2 py-2 text-right text-[0.74rem] font-bold sm:px-3',
            !on && 'text-muted-foreground'
          )}
        >
          {formatCurrency(income.amount)}
        </td>
        <td className="w-20 px-1 py-2 text-center sm:px-2">
          <div className="flex items-center justify-center gap-0 sm:gap-1">
            {onUpdate && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleStartEdit(income)}
                className="h-8 w-8 text-ink hover:bg-accent hover:text-muted-foreground"
                aria-label={getIncomeControlLabel(strings.edit, income)}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onRemove(income.id)}
              className="h-8 w-8 text-ink hover:bg-danger hover:text-muted-foreground"
              aria-label={getIncomeControlLabel(strings.remove, income)}
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
      {!isEmpty && (
        <div className="rounded-sm overflow-hidden border border-border bg-card shadow-sm">
          {/* Own cell padding (not the global table padding): with the switch
              column, four columns only fit a phone with tighter cells. */}
          <table className="table-own-padding w-full">
            <thead className="border-b border-border bg-muted">
              <tr>
                {onToggle && (
                  <th className="w-px py-2 pl-1 pr-0 sm:pl-2">
                    <span className="sr-only">{strings.switchColumn}</span>
                  </th>
                )}
                <th className="whitespace-nowrap px-2 py-2 sm:px-3 text-left text-[0.65rem] font-bold   text-muted-foreground">
                  {strings.tableHeaders.name}
                </th>
                <th className="whitespace-nowrap px-2 py-2 sm:px-3 text-right text-[0.65rem] font-bold   text-muted-foreground">
                  {strings.tableHeaders.amount}
                </th>
                <th className="w-20 whitespace-nowrap px-1 py-2 text-center sm:px-2 text-[0.65rem] font-bold   text-muted-foreground">
                  {strings.tableHeaders.actions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">{orderedIncomes.map(renderIncomeRow)}</tbody>
          </table>
        </div>
      )}

      <div
        className={cn(
          'rounded-sm border border-border px-4 py-5 shadow-sm',
          isEmpty ? 'bg-gradient-to-br from-accent/5 to-amber/5' : 'bg-card'
        )}
      >
        {isEmpty && (
          <div className="mb-5 flex items-start gap-3 border-b border-dashed border-border pb-4">
            <span className="rounded-full border border-border bg-amber p-2 shadow-sm">
              <Plus className="h-4 w-4 text-ink" strokeWidth={3} aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <p className="text-[0.72rem] font-extrabold   text-ink">{strings.empty}</p>
              <p className="text-[0.62rem] font-semibold   text-muted-foreground">
                {strings.emptyHint ??
                  'Add expected windfalls like inheritances, insurance payouts, property sales, or bonus payments'}
              </p>
            </div>
          </div>
        )}
        <form className="grid grid-cols-1 gap-4" onSubmit={handleDraftSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col sm:col-span-2">
              <Label
                htmlFor="one-time-income-name"
                className="mb-2 block min-h-[2rem] text-[0.68rem] font-semibold   leading-tight"
              >
                {strings.nameLabel}
              </Label>
              <Input
                id="one-time-income-name"
                type="text"
                value={draftName}
                placeholder={strings.namePlaceholder}
                onChange={(event) => setDraftName(event.target.value)}
                className="rounded-sm h-11 w-full border-2 border-border px-3 py-2 text-[0.68rem] font-semibold  "
                required
              />
            </div>

            <div className="flex flex-col">
              <Label
                htmlFor="one-time-income-age"
                className="mb-2 block min-h-[2rem] text-[0.68rem] font-semibold   leading-tight"
              >
                {strings.ageLabel}
              </Label>
              <Input
                id="one-time-income-age"
                type="number"
                value={draftAge}
                onChange={(event) => {
                  setDraftAge(event.target.value)
                }}
                onBlur={() => {
                  if (!draftAge.trim()) return
                  const clamped = clamp(Math.round(Number(draftAge)), minAge, maxAge)
                  if (Number.isFinite(clamped)) {
                    setDraftAge(String(clamped))
                  }
                }}
                className="rounded-sm h-11 w-full border-2 border-border px-3 py-2 text-[0.68rem] font-semibold  "
              />
            </div>

            <div className="flex flex-col">
              <Label
                htmlFor="one-time-income-amount"
                className="mb-2 block min-h-[2rem] text-[0.68rem] font-semibold   leading-tight"
              >
                {strings.amountLabel}
              </Label>
              <Input
                id="one-time-income-amount"
                ref={draftAmountField.inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={draftAmount}
                onChange={(event) => {
                  setDraftAmount(draftAmountField.handleChange(event).display)
                }}
                onBlur={() => {
                  if (!draftAmount.trim()) return
                  const clamped = Math.max(0, Math.round(draftAmountField.parse(draftAmount)))
                  if (Number.isFinite(clamped)) {
                    setDraftAmount(draftAmountField.format(clamped))
                  }
                }}
                className="rounded-sm h-11 w-full border-2 border-border px-3 py-2 text-[0.68rem] font-semibold  "
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="h-11 w-full px-6 disabled:border-ink/40 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
              disabled={!canAddDraft}
              aria-describedby={
                !canAddDraft && strings.addHint ? 'one-time-income-add-hint' : undefined
              }
            >
              {strings.addButton}
            </Button>
            {!canAddDraft && strings.addHint && (
              <p
                id="one-time-income-add-hint"
                className="text-[0.62rem] font-semibold   text-muted-foreground"
              >
                {strings.addHint}
              </p>
            )}
          </div>
        </form>
        <div className="mt-4 border-t border-dashed border-border pt-4 text-[0.65rem] font-semibold   text-muted-foreground">
          {strings.summaryLabel}: {formatCurrency(totalAmount)}
          {hasSwitchedOff && strings.switchedOffSummary && (
            <p className="mt-1" data-testid="one-time-income-switched-off-summary">
              {strings.switchedOffSummary}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
