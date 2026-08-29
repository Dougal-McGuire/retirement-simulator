'use client'

import { useMemo, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ArrowDownRight, ArrowUpRight, Edit2, Landmark, Plus, Trash2 } from 'lucide-react'
import {
  type CashFlow,
  CASHFLOW_FREQUENCIES,
  type CashFlowFrequency,
  type CashFlowKind,
  INCOME_TAX_TREATMENTS,
  type IncomeTaxTreatment,
  isCashFlowFrequency,
  isIncomeTaxTreatment,
  isPensionTaxMode,
  PENSION_TAX_MODES,
  type PensionTaxMode,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InfoTip } from '@/components/ui/info-tip'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast, TOAST_DURATION } from '@/components/ui/toast'
import { ActionToast } from '@/components/ui/action-toast'
import { useGroupedNumber } from './useGroupedNumber'
import { cashFlowDisplayName } from '@/lib/plans/cashFlowName'
import {
  buildCashFlowSeries,
  currentBaseYear,
  yearForAge,
  type PensionContext,
} from '@/lib/simulation/cashFlows'
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
  /** Where a pension without its own start age begins. */
  legalRetirementAge: number
  endAge: number
  /** The plan's tax defaults: taxable share, income-tax rate, household, base year. */
  tax: PensionContext
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
  /** Pension only: taxable share as a percentage string; blank = plan default. */
  taxablePortion: string
  taxTreatment: IncomeTaxTreatment
  pensionTaxMode: PensionTaxMode
  /** One-off only: "YYYY-MM"; blank = age-based. */
  startDate: string
  note: string
  /**
   * Translation key of a seeded flow, plus the label the form was opened with.
   * A save that leaves the name untouched keeps the key (so the row goes on
   * following the UI language); typing anything else drops it and the user's
   * own text wins in every language from then on.
   */
  nameKey?: string
  nameSeed: string
  /** Canonical stored name behind `nameSeed`, restored when the key survives. */
  storedName: string
}

const emptyDraft = (kind: CashFlowKind = 'expense'): DraftState => ({
  kind,
  name: '',
  amount: '',
  frequency: 'monthly',
  startAge: '',
  endAge: '',
  // A pension is a fixed nominal amount until indexing is switched on.
  inflationLinked: kind !== 'pension',
  growthRate: '',
  taxablePortion: '',
  taxTreatment: 'none',
  pensionTaxMode: 'share',
  startDate: '',
  note: '',
  nameSeed: '',
  storedName: '',
})

const draftFromFlow = (
  flow: CashFlow,
  formatAmount: (value: number) => string,
  displayName: string,
  legalRetirementAge: number
): DraftState => ({
  kind: flow.kind,
  name: displayName,
  amount: formatAmount(flow.amount),
  frequency: flow.frequency,
  startAge:
    flow.startAge === undefined
      ? flow.kind === 'pension'
        ? String(legalRetirementAge)
        : ''
      : String(flow.startAge),
  endAge: flow.endAge === undefined ? '' : String(flow.endAge),
  inflationLinked: flow.inflationLinked !== false,
  growthRate: flow.growthRate ? String(Number((flow.growthRate * 100).toFixed(2))) : '',
  taxablePortion:
    flow.taxablePortion === undefined ? '' : String(Number((flow.taxablePortion * 100).toFixed(1))),
  taxTreatment: flow.taxTreatment ?? 'none',
  pensionTaxMode: flow.pensionTaxMode ?? 'share',
  startDate: flow.startDate ?? '',
  note: flow.note ?? '',
  ...(flow.nameKey !== undefined ? { nameKey: flow.nameKey } : {}),
  nameSeed: displayName,
  storedName: flow.name,
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
  legalRetirementAge,
  endAge,
  tax,
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
  const baseYear = tax.baseYear ?? currentBaseYear()
  const taxContext = useMemo<PensionContext>(() => ({ ...tax, legalRetirementAge }), [tax, legalRetirementAge])

  // What each taxed flow pays in its first year — the same arithmetic the
  // engine runs, so the row shows the number the projection uses.
  const taxByFlow = useMemo(
    () => buildCashFlowSeries(safeFlows, currentAge, endAge, taxContext).taxByFlow,
    [safeFlows, currentAge, endAge, taxContext]
  )

  const formatMonth = (value: string) => {
    const [year, month] = value.split('-').map(Number)
    return format.dateTime(new Date(year, month - 1, 1), { month: 'short', year: 'numeric' })
  }

  const formatCurrency = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })

  /** Seeded flows follow the UI language; user-named ones render verbatim. */
  const displayName = (flow: CashFlow) => cashFlowDisplayName(flow, (key) => t(`defaults.${key}`))

  // Templates already in the list would only create duplicates.
  const availableTemplates = useMemo(() => {
    const present = new Set(
      safeFlows.map((flow) =>
        cashFlowDisplayName(flow, (key) => t(`defaults.${key}`))
          .trim()
          .toLowerCase()
      )
    )
    return (templates ?? []).filter((template) => !present.has(template.name.trim().toLowerCase()))
  }, [safeFlows, templates, t])

  /**
   * Money in, then money out. Pensions are income like any other; the table
   * and the timeline both keep this order so a plan reads top to bottom.
   */
  const groupedFlows = useMemo(
    () =>
      (
        [
          { key: 'income', flows: safeFlows.filter((flow) => flow.kind !== 'expense') },
          { key: 'expense', flows: safeFlows.filter((flow) => flow.kind === 'expense') },
        ] as const
      ).filter((group) => group.flows.length > 0),
    [safeFlows]
  )
  const orderedFlows = useMemo(() => groupedFlows.flatMap((group) => group.flows), [groupedFlows])

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    let pension = 0
    for (const flow of safeFlows) {
      const perYear =
        flow.frequency === 'monthly'
          ? flow.amount * 12
          : flow.frequency === 'annual'
            ? flow.amount
            : 0
      if (flow.kind === 'pension') pension += perYear
      else if (flow.kind === 'income') income += perYear
      else expense += perYear
    }
    return { income, expense, pension }
  }, [safeFlows])

  const commitDraft = (state: DraftState, id?: string) => {
    const name = state.name.trim()
    const parsedAmount = (id ? editAmountField : amountField).parse(state.amount)
    const amount = Number.isFinite(parsedAmount) ? Math.max(0, Math.round(parsedAmount)) : 0
    if (!name || amount <= 0) return

    const growth = Number(state.growthRate.trim())
    const taxable = Number(state.taxablePortion.trim())
    const pension = state.kind === 'pension'
    const once = state.frequency === 'once' && !pension
    // A calendar month pins a one-off to a plan year: the year sets the age,
    // the month is kept for display.
    const startDate = once && /^\d{4}-(0[1-9]|1[0-2])$/.test(state.startDate.trim())
      ? state.startDate.trim()
      : undefined
    const startAge =
      startDate !== undefined
        ? Math.min(
            endAge,
            Math.max(currentAge, currentAge + Number(startDate.slice(0, 4)) - baseYear)
          )
        : parseAge(state.startAge)
    const note = state.note.trim()
    const endAgeValue = state.frequency === 'once' ? undefined : parseAge(state.endAge)

    // Untouched seeded name: keep the key and the canonical stored name, so a
    // pure amount edit does not freeze the row into the current language.
    const keepsKey = state.nameKey !== undefined && name === state.nameSeed.trim()

    const flow: CashFlow = {
      id: id ?? createId(),
      kind: state.kind,
      name: keepsKey ? state.storedName : name,
      ...(keepsKey ? { nameKey: state.nameKey } : {}),
      amount,
      // A pension is a stream; a single payment is a one-off income instead.
      frequency: pension && state.frequency === 'once' ? 'monthly' : state.frequency,
      ...(startAge !== undefined ? { startAge } : {}),
      ...(endAgeValue !== undefined ? { endAge: endAgeValue } : {}),
      ...(state.inflationLinked ? {} : { inflationLinked: false }),
      ...(state.growthRate.trim() !== '' && Number.isFinite(growth) && growth !== 0
        ? { growthRate: growth / 100 }
        : {}),
      ...(pension && state.pensionTaxMode === 'share' && state.taxablePortion.trim() !== '' && Number.isFinite(taxable)
        ? { taxablePortion: Math.min(1, Math.max(0, taxable / 100)) }
        : {}),
      ...(pension && state.pensionTaxMode !== 'share' ? { pensionTaxMode: state.pensionTaxMode } : {}),
      ...(state.kind === 'income' && state.taxTreatment !== 'none'
        ? { taxTreatment: state.taxTreatment }
        : {}),
      ...(startDate !== undefined ? { startDate } : {}),
      ...(note !== '' ? { note } : {}),
    }

    onChange(id ? safeFlows.map((entry) => (entry.id === id ? flow : entry)) : [...safeFlows, flow])
  }

  const handleAdd = () => {
    commitDraft(draft)
    setDraft(emptyDraft(draft.kind))
  }

  /**
   * A template is a starting point, not an answer: "care costs, ages 80–90" is
   * a guess about *this* person. So the new row opens straight into its edit
   * form with the window fields focused, and the add is undoable — clicking a
   * template can no longer silently plant numbers the user never chose.
   */
  const handleAddTemplate = (template: CashFlowTemplate) => {
    const previous = safeFlows
    const flow: CashFlow = {
      id: createId(),
      kind: template.kind,
      name: template.name,
      amount: template.amount,
      frequency: template.frequency,
      ...(template.startAge !== undefined ? { startAge: template.startAge } : {}),
      ...(template.endAge !== undefined && template.frequency !== 'once'
        ? { endAge: template.endAge }
        : {}),
      ...(template.kind === 'pension' ? { inflationLinked: false } : {}),
    }

    onChange([...previous, flow])
    setEditDraft(draftFromFlow(flow, editAmountField.format, flow.name, legalRetirementAge))
    setEditingId(flow.id)

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(`cashflow-start-${flow.id}`)
        target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        target?.focus({ preventScroll: true })
      })
    }

    toast(
      (instance) => (
        <ActionToast
          testId="cashflow-template-toast"
          message={t('templates.added', { name: template.name })}
          actions={[
            {
              label: t('templates.undo'),
              tone: 'primary',
              testId: 'cashflow-template-undo',
              onClick: () => {
                toast.dismiss(instance.id)
                setEditingId(null)
                onChange(previous)
              },
            },
          ]}
        />
      ),
      { duration: TOAST_DURATION }
    )
  }

  const handleRemove = (id: string) => {
    onChange(safeFlows.filter((flow) => flow.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const frequencyLabel = (frequency: CashFlowFrequency) => t(`frequency.${frequency}`)

  const windowLabel = (flow: CashFlow) => {
    // A pension's unset start means the plan's statutory age — resolve it so
    // every row reads the same way.
    if (flow.kind === 'pension' && flow.startAge === undefined) {
      return flow.endAge === undefined
        ? t('window.from', { age: legalRetirementAge })
        : t('window.range', { from: legalRetirementAge, to: flow.endAge })
    }
    if (flow.frequency === 'once') {
      const age = flow.startAge ?? currentAge
      return flow.startDate
        ? t('window.atDate', { date: formatMonth(flow.startDate), age })
        : t('window.at', { age })
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
    const start = Math.min(
      endAge,
      Math.max(
        currentAge,
        flow.startAge ?? (flow.kind === 'pension' ? legalRetirementAge : currentAge)
      )
    )
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
        {(['expense', 'income', 'pension'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={state.kind === kind}
            data-testid={id ? undefined : `cashflow-kind-${kind}`}
            onClick={() =>
              setState({
                ...state,
                kind,
                ...(kind === 'pension'
                  ? {
                      frequency: state.frequency === 'once' ? 'monthly' : state.frequency,
                      inflationLinked: false,
                      startAge:
                        state.startAge.trim() === '' ? String(legalRetirementAge) : state.startAge,
                    }
                  : state.kind === 'pension'
                    ? { inflationLinked: true, pensionTaxMode: 'share' }
                    : {}),
              })
            }
            className={cn(
              'rounded-sm inline-flex items-center gap-1.5 border-2 border-border px-3 py-1.5 text-[0.62rem] font-extrabold   transition-colors',
              state.kind === kind
                ? kind === 'pension'
                  ? 'bg-accent text-muted-foreground shadow-sm'
                  : kind === 'income'
                    ? 'bg-ok text-ink shadow-sm'
                    : 'bg-viz-orange text-ink shadow-sm'
                : 'bg-white text-muted-foreground hover:bg-accent/10'
            )}
          >
            {kind === 'pension' ? (
              <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
            ) : kind === 'income' ? (
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
            className="mb-2 text-[0.68rem] font-semibold  "
          >
            {t('fields.name')}
          </Label>
          <Input
            id={`cashflow-name-${id ?? 'new'}`}
            type="text"
            value={state.name}
            placeholder={t('fields.namePlaceholder')}
            onChange={(event) => setState({ ...state, name: event.target.value })}
            className="rounded-sm h-11 border-2 border-border px-3 text-[0.68rem] font-semibold  "
          />
        </div>

        <div className="flex flex-col">
          <Label
            htmlFor={`cashflow-amount-${id ?? 'new'}`}
            className="mb-2 text-[0.68rem] font-semibold  "
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
            className="rounded-sm h-11 border-2 border-border px-3 text-[0.68rem] font-semibold  "
          />
        </div>

        <div className="flex flex-col">
          <Label
            htmlFor={`cashflow-frequency-${id ?? 'new'}`}
            className="mb-2 text-[0.68rem] font-semibold  "
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
              className="rounded-sm h-11 border-2 border-border"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CASHFLOW_FREQUENCIES.filter(
                (frequency) => state.kind !== 'pension' || frequency !== 'once'
              ).map((frequency) => (
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
            className="mb-2 text-[0.68rem] font-semibold  "
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
            placeholder={String(state.kind === 'pension' ? legalRetirementAge : currentAge)}
            onChange={(event) => setState({ ...state, startAge: event.target.value })}
            className="rounded-sm h-11 border-2 border-border px-3 text-[0.68rem] font-semibold"
          />
        </div>

        {state.frequency === 'once' && state.kind !== 'pension' && (
          <div className="flex flex-col">
            <Label
              htmlFor={`cashflow-date-${id ?? 'new'}`}
              className="mb-2 text-[0.68rem] font-semibold  "
            >
              {t('fields.startDate')}
            </Label>
            <Input
              id={`cashflow-date-${id ?? 'new'}`}
              type="month"
              value={state.startDate}
              onChange={(event) => {
                const value = event.target.value
                // The age follows the year immediately, so the two fields never
                // disagree while the form is open.
                const year = Number(value.slice(0, 4))
                const derived = Number.isFinite(year) && value.length >= 4
                  ? String(Math.min(endAge, Math.max(currentAge, currentAge + year - baseYear)))
                  : state.startAge
                setState({ ...state, startDate: value, startAge: derived })
              }}
              className="rounded-sm h-11 border-2 border-border px-3 text-[0.68rem] font-semibold"
            />
            <span className="mt-1 text-[0.58rem] font-medium text-muted-foreground">
              {t('fields.startDateHint')}
            </span>
          </div>
        )}

        {state.frequency !== 'once' && (
          <div className="flex flex-col">
            <Label
              htmlFor={`cashflow-end-${id ?? 'new'}`}
              className="mb-2 text-[0.68rem] font-semibold  "
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
              className="rounded-sm h-11 border-2 border-border px-3 text-[0.68rem] font-semibold"
            />
          </div>
        )}
      </div>

      <div className="rounded-sm space-y-3 border-2 border-dashed border-ink/40 px-3 py-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          aria-expanded={advancedOpen}
          className="text-[0.62rem] font-extrabold   text-accent"
        >
          {advancedOpen ? t('advanced.hide') : t('advanced.show')}
        </button>
        {advancedOpen && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex items-start gap-2 text-[0.62rem] font-semibold leading-snug text-ink">
              <input
                type="checkbox"
                checked={state.inflationLinked}
                onChange={(event) => setState({ ...state, inflationLinked: event.target.checked })}
                className="rounded-sm mt-0.5 h-4 w-4 border-2 border-border accent-accent"
              />
              <span>
                {t('fields.inflationLinked')}
                <span className="mt-0.5 block font-medium normal-case text-muted-foreground">
                  {state.inflationLinked
                    ? t('fields.inflationLinkedOn')
                    : state.kind === 'pension'
                      ? t('fields.pensionIndexedOff')
                      : t('fields.inflationLinkedOff')}
                </span>
              </span>
            </label>
            <div className="flex flex-col">
              <Label
                htmlFor={`cashflow-growth-${id ?? 'new'}`}
                className="mb-2 text-[0.62rem] font-semibold  "
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
                className="rounded-sm h-10 border-2 border-border px-3 text-[0.68rem] font-semibold"
              />
              <span className="mt-1 text-[0.58rem] font-medium text-muted-foreground">
                {t('fields.growthRateHint')}
              </span>
            </div>
            {state.kind === 'pension' && (
              <div className="flex flex-col sm:col-span-2">
                <Label
                  htmlFor={`cashflow-pension-tax-${id ?? 'new'}`}
                  className="mb-2 text-[0.62rem] font-semibold  "
                >
                  {t('fields.pensionTaxMode')}
                </Label>
                <Select
                  value={state.pensionTaxMode}
                  onValueChange={(value) =>
                    isPensionTaxMode(value) && setState({ ...state, pensionTaxMode: value })
                  }
                >
                  <SelectTrigger
                    id={`cashflow-pension-tax-${id ?? 'new'}`}
                    className="rounded-sm h-11 border-2 border-border text-[0.62rem] "
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PENSION_TAX_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {t(`fields.pensionTaxModeOptions.${mode}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="mt-1 text-[0.58rem] font-medium text-muted-foreground">
                  {t('fields.pensionTaxModeHint', {
                    year: yearForAge(
                      parseAge(state.startAge) ?? legalRetirementAge,
                      currentAge,
                      taxContext
                    ),
                  })}
                </span>
              </div>
            )}
            {state.kind === 'income' && (
              <div className="flex flex-col sm:col-span-2">
                <Label
                  htmlFor={`cashflow-tax-${id ?? 'new'}`}
                  className="mb-2 text-[0.62rem] font-semibold  "
                >
                  {t('fields.taxTreatment')}
                </Label>
                <Select
                  value={state.taxTreatment}
                  onValueChange={(value) =>
                    isIncomeTaxTreatment(value) && setState({ ...state, taxTreatment: value })
                  }
                >
                  <SelectTrigger
                    id={`cashflow-tax-${id ?? 'new'}`}
                    className="rounded-sm h-11 border-2 border-border text-[0.62rem] "
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INCOME_TAX_TREATMENTS.map((treatment) => (
                      <SelectItem key={treatment} value={treatment}>
                        {t(`fields.taxTreatmentOptions.${treatment}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="mt-1 text-[0.58rem] font-medium text-muted-foreground">
                  {t('fields.taxTreatmentHint')}
                </span>
              </div>
            )}
            <div className="flex flex-col sm:col-span-2">
              <Label
                htmlFor={`cashflow-note-${id ?? 'new'}`}
                className="mb-2 text-[0.62rem] font-semibold  "
              >
                {t('fields.note')}
              </Label>
              <Input
                id={`cashflow-note-${id ?? 'new'}`}
                type="text"
                maxLength={240}
                value={state.note}
                placeholder={t('fields.notePlaceholder')}
                onChange={(event) => setState({ ...state, note: event.target.value })}
                className="rounded-sm h-10 border-2 border-border px-3 text-[0.68rem] font-medium normal-case "
              />
            </div>
            {state.kind === 'pension' && state.pensionTaxMode === 'share' && (
              <div className="flex flex-col">
                <Label
                  htmlFor={`cashflow-taxable-${id ?? 'new'}`}
                  className="mb-2 text-[0.62rem] font-semibold  "
                >
                  {t('fields.taxablePortion')}
                </Label>
                <Input
                  id={`cashflow-taxable-${id ?? 'new'}`}
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min={0}
                  max={100}
                  value={state.taxablePortion}
                  placeholder={String(Math.round((tax.pensionTaxablePortion ?? 0) * 100))}
                  onChange={(event) => setState({ ...state, taxablePortion: event.target.value })}
                  className="rounded-sm h-10 border-2 border-border px-3 text-[0.68rem] font-semibold"
                />
                <span className="mt-1 text-[0.58rem] font-medium text-muted-foreground">
                  {t('fields.taxablePortionHint', {
                    portion: format.number(tax.pensionTaxablePortion ?? 0, {
                      style: 'percent',
                      maximumFractionDigits: 0,
                    }),
                  })}
                </span>
              </div>
            )}
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
        <div className="flex items-center gap-2 text-[0.62rem] font-semibold   text-muted-foreground">
          <span>{t('listTitle')}</span>
          <InfoTip content={t('intro')} label={t('listTitle')} side="bottom" />
        </div>
      )}

      {safeFlows.length > 0 && (
        <>
          {/* Timeline: the only place a plan's windows are visible at a glance. */}
          <div
            className="rounded-sm space-y-2 border border-border bg-white p-3 shadow-sm"
            data-testid="cashflow-timeline"
          >
            <div className="flex items-center justify-between text-[0.55rem] font-extrabold   text-muted-foreground">
              <span>{t('timeline.title')}</span>
              <span className="tabular-nums">
                {currentAge} – {endAge}
              </span>
            </div>
            <div className="space-y-1">
              {orderedFlows.map((flow) => {
                const geometry = barGeometry(flow)
                return (
                  <div key={flow.id} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate text-[0.55rem] font-bold   text-ink sm:w-32">
                      {displayName(flow)}
                    </span>
                    <span className="rounded-sm relative h-3 flex-1 border-2 border-ink/20 bg-muted/40">
                      <span
                        className={cn(
                          'absolute inset-y-0 border-y-2 border-border',
                          flow.kind === 'pension'
                            ? 'bg-accent'
                            : flow.kind === 'income'
                              ? 'bg-ok'
                              : 'bg-viz-orange',
                          flow.frequency === 'once' && 'border-x-2'
                        )}
                        style={geometry}
                        title={`${displayName(flow)} · ${windowLabel(flow)}`}
                      />
                    </span>
                  </div>
                )
              })}
            </div>
            {/* Retirement marker, so a window reads against the plan's phases. */}
            <div className="relative ml-[6.5rem] h-3 sm:ml-[8.5rem]">
              <span
                className="absolute top-0 -translate-x-1/2 text-[0.5rem] font-extrabold   text-accent"
                style={{
                  left: `${((Math.min(endAge, Math.max(currentAge, retirementAge)) - currentAge) / horizon) * 100}%`,
                }}
              >
                {t('timeline.retirement', { age: retirementAge })}
              </span>
            </div>
          </div>

          <div className="rounded-sm overflow-x-auto border border-border bg-white shadow-sm">
            <table className="w-full min-w-[17rem]">
              <thead className="border-b border-border bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[0.6rem] font-bold   text-muted-foreground">
                    {t('table.item')}
                  </th>
                  <th className="hidden px-3 py-2 text-left text-[0.6rem] font-bold   text-muted-foreground sm:table-cell">
                    {t('table.period')}
                  </th>
                  <th className="px-3 py-2 text-right text-[0.6rem] font-bold   text-muted-foreground">
                    {t('table.amount')}
                  </th>
                  <th className="w-20 px-2 py-2 text-center text-[0.6rem] font-bold   text-muted-foreground">
                    {t('table.actions')}
                  </th>
                </tr>
              </thead>
              {groupedFlows.map((group) => (
                <tbody
                  key={group.key}
                  className="divide-y divide-border border-t border-border"
                >
                  <tr className="bg-muted/40" data-testid={`cashflow-group-${group.key}`}>
                    <td
                      colSpan={4}
                      className="px-3 py-1.5 text-[0.58rem] font-extrabold   text-muted-foreground"
                    >
                      {t(`table.groups.${group.key}`, { count: group.flows.length })}
                    </td>
                  </tr>
                  {group.flows.map((flow) =>
                    editingId === flow.id ? (
                      <tr key={flow.id} className="bg-accent/5">
                        <td colSpan={4} className="px-3 py-3">
                          {renderDraftForm(editDraft, setEditDraft, editAmountField, flow.id)}
                        </td>
                      </tr>
                    ) : (
                      <tr key={flow.id}>
                        <td className="px-3 py-2.5 text-left">
                          <span className="flex items-center gap-1.5 text-[0.72rem] font-bold  ">
                            {flow.kind === 'pension' ? (
                              <Landmark
                                className="h-3.5 w-3.5 text-accent"
                                aria-label={t('kind.pension')}
                              />
                            ) : flow.kind === 'income' ? (
                              <ArrowUpRight
                                className="h-3.5 w-3.5 text-ok"
                                aria-label={t('kind.income')}
                              />
                            ) : (
                              <ArrowDownRight
                                className="h-3.5 w-3.5 text-viz-orange"
                                aria-label={t('kind.expense')}
                              />
                            )}
                            {displayName(flow)}
                          </span>
                          <span className="mt-0.5 block text-[0.58rem] font-semibold   text-muted-foreground">
                            {/* Narrow screens fold the period column into this line. */}
                            <span className="sm:hidden">{windowLabel(flow)} · </span>
                            {frequencyLabel(flow.frequency)}
                            {flow.inflationLinked === false ? ` · ${t('fields.nominalTag')}` : ''}
                            {flow.growthRate
                              ? ` · ${format.number(flow.growthRate, { style: 'percent', maximumFractionDigits: 1 })}`
                              : ''}
                            {(() => {
                              const summary = taxByFlow.get(flow.id)
                              return summary && flow.kind === 'income'
                                ? ` · ${t('fields.taxTag', {
                                    tax: formatCurrency(Math.round(summary.tax)),
                                    net: formatCurrency(Math.round(summary.net)),
                                  })}`
                                : ''
                            })()}
                          </span>
                          {flow.note && (
                            <span
                              className="mt-0.5 block text-[0.58rem] font-medium normal-case  text-muted-foreground"
                              data-testid={`cashflow-note-${flow.id}`}
                            >
                              {flow.note}
                            </span>
                          )}
                        </td>
                        <td className="hidden px-3 py-2.5 text-left text-[0.62rem] font-semibold   text-muted-foreground sm:table-cell">
                          {windowLabel(flow)}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2.5 text-right text-[0.72rem] font-bold tabular-nums',
                            flow.kind === 'expense' ? 'text-ink' : 'text-ok'
                          )}
                        >
                          {`${flow.kind === 'expense' ? '−' : '+'}${formatCurrency(flow.amount)}`}
                        </td>
                        <td className="w-20 px-2 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-ink hover:bg-accent hover:text-white"
                              aria-label={`${t('actions.edit')}: ${displayName(flow)}`}
                              onClick={() => {
                                setEditDraft(
                                  draftFromFlow(
                                    flow,
                                    editAmountField.format,
                                    displayName(flow),
                                    legalRetirementAge
                                  )
                                )
                                setEditingId(flow.id)
                              }}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-ink hover:bg-danger hover:text-white"
                              aria-label={`${t('actions.remove')}: ${displayName(flow)}`}
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
              ))}
            </table>
          </div>
        </>
      )}

      {availableTemplates.length > 0 && (
        <div className="space-y-2">
          <p className="text-[0.62rem] font-semibold   text-muted-foreground">
            {t('templates.label')}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {availableTemplates.map((template) => (
              <button
                key={template.key}
                type="button"
                onClick={() => handleAddTemplate(template)}
                className="rounded-sm border-2 border-dashed border-border bg-white/50 px-3 py-2 text-left text-[0.66rem] font-semibold   text-ink transition-colors hover:-translate-x-[1px] hover:-translate-y-[1px] hover:bg-amber/15 hover:shadow-sm"
              >
                <span className="flex items-center gap-1.5">
                  {template.kind === 'pension' ? (
                    <Landmark className="h-3 w-3 text-accent" aria-hidden="true" />
                  ) : template.kind === 'income' ? (
                    <ArrowUpRight className="h-3 w-3 text-ok" aria-hidden="true" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-viz-orange" aria-hidden="true" />
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
          'rounded-sm border border-border px-4 py-4 shadow-sm',
          safeFlows.length === 0
            ? 'bg-gradient-to-br from-accent/5 to-amber/5'
            : 'bg-white'
        )}
      >
        {safeFlows.length === 0 && (
          <div className="mb-4 flex items-start gap-3 border-b border-dashed border-border pb-3">
            <span className="rounded-sm border border-border bg-amber p-1.5 shadow-sm">
              <Plus className="h-4 w-4 text-ink" strokeWidth={3} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[0.7rem] font-extrabold   text-ink">
                {t('empty.title')}
              </p>
              <p className="text-[0.6rem] font-semibold   text-muted-foreground">
                {t('empty.hint')}
              </p>
            </div>
          </div>
        )}
        {renderDraftForm(draft, setDraft, amountField)}
        {safeFlows.length > 0 && (
          <dl className="mt-4 space-y-1.5 border-t border-dashed border-border pt-3 text-[0.62rem] font-semibold   text-muted-foreground">
            {totals.pension > 0 && (
              <div className="flex justify-between">
                <dt>{t('summary.pension')}</dt>
                <dd className="tabular-nums text-accent">+{formatCurrency(totals.pension)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>{t('summary.income')}</dt>
              <dd className="tabular-nums text-ok">+{formatCurrency(totals.income)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="flex items-center gap-1.5">
                {t('summary.expense')}
                <InfoTip content={t('summary.note')} label={t('summary.expense')} side="bottom" />
              </dt>
              <dd className="tabular-nums text-ink">−{formatCurrency(totals.expense)}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  )
}
