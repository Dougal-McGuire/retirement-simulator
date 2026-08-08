'use client'

import { useMemo, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ArrowDownRight, ArrowUpRight, Edit2, Plus, Trash2 } from 'lucide-react'
import {
  CASHFLOW_FREQUENCIES,
  isCashFlowFrequency,
  type CashFlow,
  type CashFlowFrequency,
  type CashFlowKind,
} from '@/types'
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
import { useGroupedNumber } from './useGroupedNumber'
import { cn } from '@/lib/utils'

/**
 * One editor for every money movement in a plan.
 *
 * Groceries, a roof repair in 2031 and eight years of rent are the same kind of
 * thing to the engine, and separating them into "expenses" and "one-time
 * incomes" made the two things it could not express — an age window and an
 * income that is not a windfall — impossible to state at all. So there is one
 * list, one form, and a timeline strip that makes the windows legible at a
 * glance: without it a plan is a stack of numbers with invisible start dates.
 */

export interface CashFlowTemplate {
  key: string
  kind: CashFlowKind
  name: string
  amount: number
  frequency: CashFlowFrequency
  /** Resolved against the plan's ages by the caller. */
  startAge?: number
  endAge?: number
}

interface CashFlowListProps {
  flows: CashFlow[]
  currentAge: number
  retirementAge: number
  endAge: number
  templates?: CashFlowTemplate[]
  onChange: (flows: CashFlow[]) => void
  /** Compact mode drops the intro copy (used inside the plan editor card). */
  compact?: boolean
}

interface DraftState {
  kind: CashFlowKind
  name: string
  amount: string
  frequency: CashFlowFrequency
  startAge: string
  endAge: string
  inflationLinked: boolean
  growthRate: string
}

const emptyDraft = (kind: CashFlowKind = 'expense'): DraftState => ({
  kind,
  name: '',
  amount: '',
  frequency: 'monthly',
  startAge: '',
  endAge: '',
  inflationLinked: true,
  growthRate: '',
})

const draftFromFlow = (flow: CashFlow, formatAmount: (value: number) => string): DraftState => ({
  kind: flow.kind,
  name: flow.name,
  amount: formatAmount(flow.amount),
  frequency: flow.frequency,
  startAge: flow.startAge === undefined ? '' : String(flow.startAge),
  endAge: flow.endAge === undefined ? '' : String(flow.endAge),
  inflationLinked: flow.inflationLinked !== false,
  growthRate: flow.growthRate ? String(Number((flow.growthRate * 100).toFixed(2))) : '',
})

const parseAge = (value: string): number | undefined => {
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined
}

const createId = () => `flow-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

export function CashFlowList({
  flows,
  currentAge,
  retirementAge,
  endAge,
  templates,
  onChange,
  compact = false,
}: CashFlowListProps) {
  const t = useTranslations('setup.cashFlows')
  const format = useFormatter()
  // One grouped-number field per form: the add form and an open edit row can
  // both be on screen, and a shared caret ref would fight over them.
  const amountField = useGroupedNumber(0)
  const editAmountField = useGroupedNumber(0)

  const [draft, setDraft] = useState<DraftState>(() => emptyDraft())
  const [editDraft, setEditDraft] = useState<DraftState>(() => emptyDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const safeFlows = Array.isArray(flows) ? flows : []
  const horizon = Math.max(1, endAge - currentAge)

  const formatCurrency = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })

  // Templates already in the list would only create duplicates.
  const availableTemplates = useMemo(() => {
    const present = new Set(safeFlows.map((flow) => flow.name.trim().toLowerCase()))
    return (templates ?? []).filter((template) => !present.has(template.name.trim().toLowerCase()))
  }, [safeFlows, templates])

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const flow of safeFlows) {
      const perYear =
        flow.frequency === 'monthly'
          ? flow.amount * 12
          : flow.frequency === 'annual'
            ? flow.amount
            : 0
      if (flow.kind === 'income') income += perYear
      else expense += perYear
    }
    return { income, expense }
  }, [safeFlows])

  const commitDraft = (state: DraftState, id?: string) => {
    const name = state.name.trim()
    const parsedAmount = (id ? editAmountField : amountField).parse(state.amount)
    const amount = Number.isFinite(parsedAmount) ? Math.max(0, Math.round(parsedAmount)) : 0
    if (!name || amount <= 0) return

    const growth = Number(state.growthRate.trim())
    const startAge = parseAge(state.startAge)
    const endAgeValue = state.frequency === 'once' ? undefined : parseAge(state.endAge)

    const flow: CashFlow = {
      id: id ?? createId(),
      kind: state.kind,
      name,
      amount,
      frequency: state.frequency,
      ...(startAge !== undefined ? { startAge } : {}),
      ...(endAgeValue !== undefined ? { endAge: endAgeValue } : {}),
      ...(state.inflationLinked ? {} : { inflationLinked: false }),
      ...(state.growthRate.trim() !== '' && Number.isFinite(growth) && growth !== 0
        ? { growthRate: growth / 100 }
        : {}),
    }

    onChange(id ? safeFlows.map((entry) => (entry.id === id ? flow : entry)) : [...safeFlows, flow])
  }

  const handleAdd = () => {
    commitDraft(draft)
    setDraft(emptyDraft(draft.kind))
  }

  const handleAddTemplate = (template: CashFlowTemplate) => {
    onChange([
      ...safeFlows,
      {
        id: createId(),
        kind: template.kind,
        name: template.name,
        amount: template.amount,
        frequency: template.frequency,
        ...(template.startAge !== undefined ? { startAge: template.startAge } : {}),
        ...(template.endAge !== undefined && template.frequency !== 'once'
          ? { endAge: template.endAge }
          : {}),
      },
    ])
  }

  const handleRemove = (id: string) => {
    onChange(safeFlows.filter((flow) => flow.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const frequencyLabel = (frequency: CashFlowFrequency) => t(`frequency.${frequency}`)

  const windowLabel = (flow: CashFlow) => {
    if (flow.frequency === 'once') {
      return t('window.at', { age: flow.startAge ?? currentAge })
    }
    if (flow.startAge === undefined && flow.endAge === undefined) return t('window.lifetime')
    if (flow.startAge !== undefined && flow.endAge !== undefined) {
      return t('window.range', { from: flow.startAge, to: flow.endAge })
    }
    if (flow.startAge !== undefined) return t('window.from', { age: flow.startAge })
    return t('window.until', { age: flow.endAge ?? endAge })
  }

  /** Left offset / width of a flow's bar as a share of the plan horizon. */
  const barGeometry = (flow: CashFlow) => {
    const start = Math.min(endAge, Math.max(currentAge, flow.startAge ?? currentAge))
    const stop =
      flow.frequency === 'once' ? start : Math.min(endAge, Math.max(start, flow.endAge ?? endAge))
    const left = ((start - currentAge) / horizon) * 100
    const width = Math.max(((stop - start) / horizon) * 100, 1.5)
    return { left: `${left}%`, width: `${Math.min(100 - left, width)}%` }
  }

  const renderDraftForm = (
    state: DraftState,
    setState: (next: DraftState) => void,
    field: ReturnType<typeof useGroupedNumber>,
    id?: string
  ) => (
    <form
      className="grid grid-cols-1 gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (id) {
          commitDraft(state, id)
          setEditingId(null)
        } else {
          handleAdd()
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {(['expense', 'income'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={state.kind === kind}
            data-testid={id ? undefined : `cashflow-kind-${kind}`}
            onClick={() => setState({ ...state, kind })}
            className={cn(
              'inline-flex items-center gap-1.5 border-2 border-neo-black px-3 py-1.5 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] transition-neo',
              state.kind === kind
                ? kind === 'income'
                  ? 'bg-neo-green text-neo-black shadow-neo-xs'
                  : 'bg-neo-orange text-neo-black shadow-neo-xs'
                : 'bg-neo-white text-muted-foreground hover:bg-neo-blue/10'
            )}
          >
            {kind === 'income' ? (
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t(`kind.${kind}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col sm:col-span-2">
          <Label
            htmlFor={`cashflow-name-${id ?? 'new'}`}
            className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em]"
          >
            {t('fields.name')}
          </Label>
          <Input
            id={`cashflow-name-${id ?? 'new'}`}
            type="text"
            value={state.name}
            placeholder={t('fields.namePlaceholder')}
            onChange={(event) => setState({ ...state, name: event.target.value })}
            className="h-11 border-2 border-neo-black bg-neo-white px-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
          />
        </div>

        <div className="flex flex-col">
          <Label
            htmlFor={`cashflow-amount-${id ?? 'new'}`}
            className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em]"
          >
            {t('fields.amount')}
          </Label>
          <Input
            id={`cashflow-amount-${id ?? 'new'}`}
            ref={field.inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={state.amount}
            onChange={(event) => setState({ ...state, amount: field.handleChange(event).display })}
            className="h-11 border-2 border-neo-black bg-neo-white px-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em]"
          />
        </div>

        <div className="flex flex-col">
          <Label
            htmlFor={`cashflow-frequency-${id ?? 'new'}`}
            className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em]"
          >
            {t('fields.frequency')}
          </Label>
          <Select
            value={state.frequency}
            onValueChange={(value) =>
              isCashFlowFrequency(value) && setState({ ...state, frequency: value })
            }
          >
            <SelectTrigger
              id={`cashflow-frequency-${id ?? 'new'}`}
              className="h-11 border-2 border-neo-black bg-neo-white"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CASHFLOW_FREQUENCIES.map((frequency) => (
                <SelectItem key={frequency} value={frequency}>
                  {frequencyLabel(frequency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col">
          <Label
            htmlFor={`cashflow-start-${id ?? 'new'}`}
            className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em]"
          >
            {state.frequency === 'once' ? t('fields.atAge') : t('fields.startAge')}
          </Label>
          <Input
            id={`cashflow-start-${id ?? 'new'}`}
            type="number"
            inputMode="numeric"
            min={currentAge}
            max={endAge}
            value={state.startAge}
            placeholder={String(currentAge)}
            onChange={(event) => setState({ ...state, startAge: event.target.value })}
            className="h-11 border-2 border-neo-black bg-neo-white px-3 text-[0.68rem] font-semibold"
          />
        </div>

        {state.frequency !== 'once' && (
          <div className="flex flex-col">
            <Label
              htmlFor={`cashflow-end-${id ?? 'new'}`}
              className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em]"
            >
              {t('fields.endAge')}
            </Label>
            <Input
              id={`cashflow-end-${id ?? 'new'}`}
              type="number"
              inputMode="numeric"
              min={currentAge}
              max={endAge}
              value={state.endAge}
              placeholder={String(endAge)}
              onChange={(event) => setState({ ...state, endAge: event.target.value })}
              className="h-11 border-2 border-neo-black bg-neo-white px-3 text-[0.68rem] font-semibold"
            />
          </div>
        )}
      </div>

      <div className="space-y-3 border-2 border-dashed border-neo-black/40 px-3 py-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-neo-blue"
        >
          {advancedOpen ? t('advanced.hide') : t('advanced.show')}
        </button>
        {advancedOpen && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex items-start gap-2 text-[0.62rem] font-semibold leading-snug text-neo-black">
              <input
                type="checkbox"
                checked={state.inflationLinked}
                onChange={(event) => setState({ ...state, inflationLinked: event.target.checked })}
                className="mt-0.5 h-4 w-4 border-2 border-neo-black accent-neo-blue"
              />
              <span>
                {t('fields.inflationLinked')}
                <span className="mt-0.5 block font-medium normal-case text-muted-foreground">
                  {state.inflationLinked
                    ? t('fields.inflationLinkedOn')
                    : t('fields.inflationLinkedOff')}
                </span>
              </span>
            </label>
            <div className="flex flex-col">
              <Label
                htmlFor={`cashflow-growth-${id ?? 'new'}`}
                className="mb-2 text-[0.62rem] font-semibold uppercase tracking-[0.14em]"
              >
                {t('fields.growthRate')}
              </Label>
              <Input
                id={`cashflow-growth-${id ?? 'new'}`}
                type="number"
                inputMode="decimal"
                step="0.1"
                value={state.growthRate}
                placeholder="0"
                onChange={(event) => setState({ ...state, growthRate: event.target.value })}
                className="h-10 border-2 border-neo-black bg-neo-white px-3 text-[0.68rem] font-semibold"
              />
              <span className="mt-1 text-[0.58rem] font-medium text-muted-foreground">
                {t('fields.growthRateHint')}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          data-testid={id ? `cashflow-save-${id}` : 'cashflow-add'}
          className="h-11 flex-1 px-6"
        >
          {id ? t('actions.save') : t('actions.add')}
        </Button>
        {id && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-11"
            onClick={() => setEditingId(null)}
          >
            {t('actions.cancel')}
          </Button>
        )}
      </div>
    </form>
  )

  return (
    <div className="space-y-4" data-testid="cashflow-list">
      {!compact && (
        <p className="text-xs font-medium leading-relaxed text-muted-foreground">{t('intro')}</p>
      )}

      {safeFlows.length > 0 && (
        <>
          {/* Timeline: the only place a plan's windows are visible at a glance. */}
          <div
            className="space-y-2 border-3 border-neo-black bg-neo-white p-3 shadow-neo-sm"
            data-testid="cashflow-timeline"
          >
            <div className="flex items-center justify-between text-[0.55rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
              <span>{t('timeline.title')}</span>
              <span className="tabular-nums">
                {currentAge} – {endAge}
              </span>
            </div>
            <div className="space-y-1">
              {safeFlows.map((flow) => {
                const geometry = barGeometry(flow)
                return (
                  <div key={flow.id} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate text-[0.55rem] font-bold uppercase tracking-[0.1em] text-neo-black sm:w-32">
                      {flow.name}
                    </span>
                    <span className="relative h-3 flex-1 border-2 border-neo-black/20 bg-muted/40">
                      <span
                        className={cn(
                          'absolute inset-y-0 border-y-2 border-neo-black',
                          flow.kind === 'income' ? 'bg-neo-green' : 'bg-neo-orange',
                          flow.frequency === 'once' && 'border-x-2'
                        )}
                        style={geometry}
                        title={`${flow.name} · ${windowLabel(flow)}`}
                      />
                    </span>
                  </div>
                )
              })}
            </div>
            {/* Retirement marker, so a window reads against the plan's phases. */}
            <div className="relative ml-[6.5rem] h-3 sm:ml-[8.5rem]">
              <span
                className="absolute top-0 -translate-x-1/2 text-[0.5rem] font-extrabold uppercase tracking-[0.1em] text-neo-blue"
                style={{
                  left: `${((Math.min(endAge, Math.max(currentAge, retirementAge)) - currentAge) / horizon) * 100}%`,
                }}
              >
                {t('timeline.retirement', { age: retirementAge })}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto border-3 border-neo-black bg-neo-white shadow-neo-sm">
            <table className="w-full min-w-[17rem]">
              <thead className="border-b-3 border-neo-black bg-neo-black">
                <tr>
                  <th className="px-3 py-2 text-left text-[0.6rem] font-bold uppercase tracking-[0.14em] text-neo-white">
                    {t('table.item')}
                  </th>
                  <th className="hidden px-3 py-2 text-left text-[0.6rem] font-bold uppercase tracking-[0.14em] text-neo-white sm:table-cell">
                    {t('table.period')}
                  </th>
                  <th className="px-3 py-2 text-right text-[0.6rem] font-bold uppercase tracking-[0.14em] text-neo-white">
                    {t('table.amount')}
                  </th>
                  <th className="w-20 px-2 py-2 text-center text-[0.6rem] font-bold uppercase tracking-[0.14em] text-neo-white">
                    {t('table.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y-3 divide-neo-black">
                {safeFlows.map((flow) =>
                  editingId === flow.id ? (
                    <tr key={flow.id} className="bg-neo-blue/5">
                      <td colSpan={4} className="px-3 py-3">
                        {renderDraftForm(editDraft, setEditDraft, editAmountField, flow.id)}
                      </td>
                    </tr>
                  ) : (
                    <tr key={flow.id}>
                      <td className="px-3 py-2.5 text-left">
                        <span className="flex items-center gap-1.5 text-[0.72rem] font-bold uppercase tracking-[0.1em]">
                          {flow.kind === 'income' ? (
                            <ArrowUpRight
                              className="h-3.5 w-3.5 text-neo-green"
                              aria-label={t('kind.income')}
                            />
                          ) : (
                            <ArrowDownRight
                              className="h-3.5 w-3.5 text-neo-orange"
                              aria-label={t('kind.expense')}
                            />
                          )}
                          {flow.name}
                        </span>
                        <span className="mt-0.5 block text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          {/* Narrow screens fold the period column into this line. */}
                          <span className="sm:hidden">{windowLabel(flow)} · </span>
                          {frequencyLabel(flow.frequency)}
                          {flow.inflationLinked === false ? ` · ${t('fields.nominalTag')}` : ''}
                          {flow.growthRate
                            ? ` · ${format.number(flow.growthRate, { style: 'percent', maximumFractionDigits: 1 })}`
                            : ''}
                        </span>
                      </td>
                      <td className="hidden px-3 py-2.5 text-left text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:table-cell">
                        {windowLabel(flow)}
                      </td>
                      <td
                        className={cn(
                          'px-3 py-2.5 text-right text-[0.72rem] font-bold tabular-nums',
                          flow.kind === 'income' ? 'text-neo-green' : 'text-neo-black'
                        )}
                      >
                        {`${flow.kind === 'income' ? '+' : '−'}${formatCurrency(flow.amount)}`}
                      </td>
                      <td className="w-20 px-2 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-neo-black hover:bg-neo-blue hover:text-neo-white"
                            aria-label={`${t('actions.edit')}: ${flow.name}`}
                            onClick={() => {
                              setEditDraft(draftFromFlow(flow, editAmountField.format))
                              setEditingId(flow.id)
                            }}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-neo-black hover:bg-neo-red hover:text-neo-white"
                            aria-label={`${t('actions.remove')}: ${flow.name}`}
                            onClick={() => handleRemove(flow.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {availableTemplates.length > 0 && (
        <div className="space-y-2">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t('templates.label')}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {availableTemplates.map((template) => (
              <button
                key={template.key}
                type="button"
                onClick={() => handleAddTemplate(template)}
                className="border-2 border-dashed border-neo-black bg-neo-white/50 px-3 py-2 text-left text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-neo-black transition-neo hover:-translate-x-[1px] hover:-translate-y-[1px] hover:bg-neo-yellow/20 hover:shadow-neo-sm"
              >
                <span className="flex items-center gap-1.5">
                  {template.kind === 'income' ? (
                    <ArrowUpRight className="h-3 w-3 text-neo-green" aria-hidden="true" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-neo-orange" aria-hidden="true" />
                  )}
                  {template.name}
                </span>
                <span className="mt-1 block text-[0.58rem] font-medium normal-case text-muted-foreground">
                  {formatCurrency(template.amount)} · {frequencyLabel(template.frequency)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className={cn(
          'border-3 border-neo-black px-4 py-4 shadow-neo-sm',
          safeFlows.length === 0
            ? 'bg-gradient-to-br from-neo-blue/5 to-neo-yellow/5'
            : 'bg-neo-white'
        )}
      >
        {safeFlows.length === 0 && (
          <div className="mb-4 flex items-start gap-3 border-b-3 border-dashed border-neo-black pb-3">
            <span className="border-3 border-neo-black bg-neo-yellow p-1.5 shadow-neo-xs">
              <Plus className="h-4 w-4 text-neo-black" strokeWidth={3} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[0.7rem] font-extrabold uppercase tracking-[0.14em] text-neo-black">
                {t('empty.title')}
              </p>
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {t('empty.hint')}
              </p>
            </div>
          </div>
        )}
        {renderDraftForm(draft, setDraft, amountField)}
        {safeFlows.length > 0 && (
          <dl className="mt-4 space-y-1.5 border-t-3 border-dashed border-neo-black pt-3 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            <div className="flex justify-between">
              <dt>{t('summary.income')}</dt>
              <dd className="tabular-nums text-neo-green">+{formatCurrency(totals.income)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('summary.expense')}</dt>
              <dd className="tabular-nums text-neo-black">−{formatCurrency(totals.expense)}</dd>
            </div>
            <p className="pt-1 text-[0.55rem] font-medium normal-case tracking-normal">
              {t('summary.note')}
            </p>
          </dl>
        )}
      </div>
    </div>
  )
}
