'use client'

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { ChevronRight, PencilLine, PowerOff } from 'lucide-react'
import type { AnnualCashFlow, CashFlow, SimulationParams, SimulationResults } from '@/types'
import { assumptionPanel } from '@/components/plans/planSections'
import type { EditTarget } from '@/components/workspace/WorkspaceProvider'
import { cashFlowDisplayName } from '@/lib/plans/cashFlowName'
import {
  breakdownLedger,
  buildFlowTracks,
  FLOW_CATEGORIES,
  isFlowCategory,
  type FlowBreakdown,
  type FlowBreakdownItem,
  type FlowCategory,
} from '@/lib/simulation/flowBreakdown'
import { isOnceIncomeFlow } from '@/lib/simulation/cashFlows'
import { useDisplayReal } from '@/lib/stores/displayStore'
import { cn } from '@/lib/utils'
import { compactCurrencyOptions } from '@/lib/utils/numberFormat'
import {
  CATEGORY_COLOR,
  CashflowSankey,
  itemColor,
  resolveActive,
  type SankeyPresenter,
} from './CashflowSankey'
import {
  buildCashflowSankey,
  itemNodeId,
  resolveLedgerSelection,
  RETIREMENT_SUM,
  SANKEY_MIN_AMOUNT,
  type CashflowSankeyModel,
  type CashflowSankeyNode,
  type Expansion,
  type LedgerSelection,
  type SankeyNodeId,
} from './cashflowSankeyModel'

interface CashflowCardProps {
  params: SimulationParams
  results: SimulationResults | null
  /**
   * Opens the edit panel (or the Entnahme section) where a number is set.
   * When given, diagram nodes and table labels become shortcuts into the
   * plan; the clicked element is passed along so focus can return to it.
   */
  onEdit?: (target: EditTarget, invoker?: HTMLElement | null) => void
}

/**
 * Where a deep link to one flow lands in the flows panel: its row's first
 * control (the on/off switch). `focusField` focuses it, scrolls the row into
 * the panel and flashes the row (`data-field-wrapper`); `panelForField` maps
 * the `cashflow-` prefix to the flows panel. See
 * docs/specs/2026-09-28-cashflow-drilldown.md.
 */
export const flowFieldId = (flowId: string) => `cashflow-switch-${flowId}`

/** Where a category's number is set, for categories that are not plan flows. */
const CATEGORY_EDIT: Partial<Record<SankeyNodeId, EditTarget>> = {
  savings: { panel: 'savings', fieldId: 'editor-annualSavings' },
  withdrawal: { section: 'withdrawal' },
  incomeTax: { panel: 'market', fieldId: 'editor-pensionTaxablePortion' },
  capitalGainsTax: { panel: 'market', fieldId: 'editor-capitalGainsTax' },
}

const FLOWS_PANEL: EditTarget = { panel: 'flows' }

/**
 * Geldfluss: the Sankey and the one table under it ("Aufstellung"). Both draw
 * the same booked ledger row; both open categories into the plan's own flows
 * (`flowBreakdown`), with one shared expanded state and one shared highlight.
 * Reads booked amounts from the engine; never reconstructs them from a budget.
 */
export function CashflowCard({ results, onEdit }: CashflowCardProps) {
  const t = useTranslations('cashflowResults')
  const ts = useTranslations('cashflowSankey')
  const tFlows = useTranslations('setup.cashFlows')
  const tGroups = useTranslations('planEditor.groups')
  const tWorkspace = useTranslations('workspace.sections')
  const format = useFormatter()
  const locale = useLocale()
  const displayReal = useDisplayReal()
  const sectionRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<LedgerSelection | null>(null)
  // Remembered across ages and units: a reader who opened "Laufende Ausgaben"
  // keeps it open while stepping through the years.
  const [expanded, setExpanded] = useState<Expansion>({})
  const [active, setActive] = useState<string | null>(null)

  const series = displayReal ? results?.cashFlowMeansReal : results?.cashFlowMeans
  const ages = useMemo(() => results?.ages ?? [], [results?.ages])
  const retirementAge = Math.max(
    results?.params.currentAge ?? 0,
    results?.params.retirementAge ?? 0
  )
  const selected = useMemo(
    () => resolveLedgerSelection(series, ages, retirementAge, selection),
    [series, ages, retirementAge, selection]
  )
  const row = selected?.row
  const hasRetirement = ages.some((age) => age >= retirementAge)

  const tracks = useMemo(() => (results ? buildFlowTracks(results.params) : null), [results])
  const breakdown = useMemo<FlowBreakdown | undefined>(() => {
    if (!tracks || !selected || !series || !results) return undefined
    return breakdownLedger(tracks, {
      series,
      ages,
      priceLevel: results.inflationIndexP50,
      fallbackInflation: results.params.averageInflation,
      real: displayReal,
      fromAge: selected.fromAge,
      toAge: selected.toAge,
      row: selected.row,
    })
  }, [tracks, selected, series, ages, results, displayReal])
  const overview = useMemo(() => (row ? buildCashflowSankey(row) : null), [row])
  const model = useMemo(
    () =>
      row && breakdown
        ? buildCashflowSankey(row, SANKEY_MIN_AMOUNT, { breakdown, expanded })
        : overview,
    [row, breakdown, expanded, overview]
  )

  const money = useCallback(
    (value: number) =>
      format.number(value, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }),
    [format]
  )
  const editLabel = useCallback(
    (target: EditTarget) =>
      ts('ledger.edit', {
        section:
          'panel' in target
            ? tGroups(`${assumptionPanel(target.panel).messageKey}.title`)
            : tWorkspace(`${target.section}.title`),
      }),
    [ts, tGroups, tWorkspace]
  )

  const expandable = useMemo(() => model?.expandable ?? [], [model])
  const presenter = useMemo<SankeyPresenter>(() => {
    const flowName = (flow: CashFlow) =>
      cashFlowDisplayName(flow, (key) => tFlows(`defaults.${key}`))
    const itemName = (item: FlowBreakdownItem) =>
      item.flow ? flowName(item.flow) : ts('unassigned')
    const params = results?.params
    const formatMonth = (value: string) => {
      const [year, month] = value.split('-').map(Number)
      return format.dateTime(new Date(year, month - 1, 1), { month: 'short', year: 'numeric' })
    }
    const window = (flow: CashFlow) => {
      const legal = params?.legalRetirementAge ?? 67
      const currentAge = params?.currentAge ?? 0
      if (flow.kind === 'pension' && flow.startAge === undefined) {
        return flow.endAge === undefined
          ? tFlows('window.from', { age: legal })
          : tFlows('window.range', { from: legal, to: flow.endAge })
      }
      if (flow.frequency === 'once') {
        const age = flow.startAge ?? currentAge
        const at = flow.startDate
          ? tFlows('window.atDate', { date: formatMonth(flow.startDate), age })
          : tFlows('window.at', { age })
        // One-off income is credited a year after its booked age.
        return isOnceIncomeFlow(flow) ? `${at} · ${ts('creditedAt', { age: age + 1 })}` : at
      }
      if (flow.startAge === undefined && flow.endAge === undefined) {
        return tFlows('window.lifetime')
      }
      if (flow.startAge !== undefined && flow.endAge !== undefined) {
        return tFlows('window.range', { from: flow.startAge, to: flow.endAge })
      }
      if (flow.startAge !== undefined) return tFlows('window.from', { age: flow.startAge })
      return tFlows('window.until', { age: flow.endAge ?? params?.endAge ?? 0 })
    }
    return {
      name: (node) => {
        if (node.kind === 'item' && node.item) return itemName(node.item)
        if (node.kind === 'more') return ts('more', { count: node.folded?.length ?? 0 })
        return ts(`nodes.${node.category}`)
      },
      categoryName: (category) => ts(`nodes.${category}`),
      itemName,
      money,
      labelMoney: (value) =>
        value >= 10_000_000
          ? new Intl.NumberFormat(locale, compactCurrencyOptions(value, locale)).format(value)
          : money(value),
      percent: (share) =>
        format.number(share, {
          style: 'percent',
          maximumFractionDigits: share > 0 && share < 0.1 ? 1 : 0,
        }),
      period: (item) =>
        item.flow ? `${window(item.flow)} · ${tFlows(`frequency.${item.flow.frequency}`)}` : '',
      action: (node) => {
        if (node.kind === 'item') {
          return node.item?.flow && onEdit
            ? { kind: 'edit', hint: ts('hints.editFlow') }
            : { kind: 'none' }
        }
        if (node.kind === 'more') {
          return isFlowCategory(node.category) && expanded[node.category] !== 'all'
            ? { kind: 'all', hint: ts('hints.showAll') }
            : { kind: 'none' }
        }
        if (isFlowCategory(node.category) && expandable.includes(node.category)) {
          return { kind: 'expand', hint: ts('hints.expand') }
        }
        const target = CATEGORY_EDIT[node.category]
        return target && onEdit
          ? {
              kind: 'edit',
              hint: `${ts('hints.click')}: ${editLabel(target)}`,
              label: editLabel(target),
            }
          : { kind: 'none' }
      },
    }
  }, [results, tFlows, ts, format, money, locale, onEdit, expanded, expandable, editLabel])

  // A highlight belongs to what was under the pointer; a redrawn diagram
  // (opened, closed, another year) has moved it, so it starts unlit.
  const expand = (category: FlowCategory, mode: 'top' | 'all' = 'top') => {
    setActive(null)
    setExpanded((previous) => ({ ...previous, [category]: mode }))
  }
  const collapse = (category: FlowCategory) => {
    setActive(null)
    setExpanded((previous) => {
      const next = { ...previous }
      delete next[category]
      return next
    })
  }
  const allOpen = expandable.length > 0 && expandable.every((category) => expanded[category])
  // "All items" holds for every year, including categories this one lacks.
  const toggleAll = () => {
    setActive(null)
    setExpanded((previous) =>
      allOpen
        ? {}
        : Object.fromEntries(
            FLOW_CATEGORIES.map((category) => [category, previous[category] ?? 'top'])
          )
    )
  }

  const activate = (node: CashflowSankeyNode, invoker: Element | null) => {
    const { kind } = presenter.action(node)
    const category = node.category
    if (kind === 'expand' && isFlowCategory(category)) expand(category)
    else if (kind === 'all' && isFlowCategory(category)) expand(category, 'all')
    else if (kind === 'edit' && onEdit) {
      const target = node.item?.flow
        ? { panel: 'flows' as const, fieldId: flowFieldId(node.item.flow.id) }
        : CATEGORY_EDIT[category]
      // SVG nodes are focusable too; the panel returns focus to them.
      if (target) onEdit(target, invoker as HTMLElement | null)
    }
  }

  const selectAge = (age: number) => {
    setSelection(age)
    const section = sectionRef.current
    if (!section || section.getBoundingClientRect().top >= 0) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  const line = (label: string, amount: number, emphasis = false) => (
    <div key={label} className="ws-ledger-line" data-emphasis={emphasis || undefined}>
      <dt>{label}</dt>
      <dd>{money(amount)}</dd>
    </div>
  )
  const columns = [
    'incomeGross',
    'incomeTax',
    'expenses',
    'portfolioWithdrawal',
    'capitalGainsTax',
    'shortfall',
    'portfolioContribution',
    'closingAssets',
  ] as const satisfies readonly (keyof AnnualCashFlow)[]

  // One control row for the whole section (the section header above names
  // it): the year, which euros, and — when there are flows to open — "all items".
  const controls = selected && (
    <>
      <label className="ws-cashflow-year">
        {t('age')}
        <select
          className="ds-select"
          value={selected.sum ? RETIREMENT_SUM : String(ages[selected.index])}
          onChange={(event) => {
            setActive(null)
            setSelection(
              event.target.value === RETIREMENT_SUM ? RETIREMENT_SUM : Number(event.target.value)
            )
          }}
          data-testid="cashflow-year-select"
        >
          {hasRetirement && <option value={RETIREMENT_SUM}>{ts('wholeRetirement')}</option>}
          {ages.map((age) => (
            <option key={age} value={age}>
              {age}
            </option>
          ))}
        </select>
      </label>
      {/* A single year is "annual amounts"; the retirement sum is not. */}
      <span className="ws-cashflow-unit" data-testid="cashflow-unit">
        {selected.sum
          ? ts(displayReal ? 'unitReal' : 'unitNominal')
          : t(displayReal ? 'real' : 'nominal')}
      </span>
      {expandable.length > 0 && (
        <button
          type="button"
          className="workspace-text-button ws-cashflow-expand-all"
          onClick={toggleAll}
          data-testid="cashflow-expand-all"
          data-state={allOpen ? 'open' : 'closed'}
        >
          <ChevronRight
            size={16}
            aria-hidden="true"
            className={cn(
              'transition-transform motion-reduce:transition-none',
              allOpen && 'rotate-90'
            )}
          />
          {ts(allOpen ? 'collapseAll' : 'expandAll')}
        </button>
      )}
    </>
  )

  const disabled = breakdown?.disabled ?? []
  const disabledLine =
    disabled.length > 0 ? (
      <p className="ws-sankey-disabled" data-testid="cashflow-disabled-flows">
        <PowerOff size={13} aria-hidden="true" />
        <a
          href="#assumptions:flows"
          onClick={(event) => {
            if (!onEdit) return
            event.preventDefault()
            onEdit(FLOWS_PANEL, event.currentTarget)
          }}
        >
          {ts('disabledFlows', { count: disabled.length })}
        </a>
      </p>
    ) : null

  return (
    <div ref={sectionRef} className="ws-cashflow" data-testid="cashflow-ledger">
      {!row || !selected || !model || !overview ? (
        <>
          {controls && <div className="ws-cashflow-controls">{controls}</div>}
          <p className="ws-cashflow-method" role="status">
            {t('missing')}
          </p>
        </>
      ) : (
        <>
          <CashflowSankey
            model={model}
            overview={overview}
            period={{ fromAge: selected.fromAge, toAge: selected.toAge, sum: selected.sum }}
            presenter={presenter}
            active={active}
            onActive={setActive}
            onActivate={activate}
            onCollapse={(category) => collapse(category)}
            controls={controls}
            footer={disabledLine}
            note={t('method')}
          />
          <CashflowTable
            row={row}
            overview={overview}
            model={model}
            breakdown={breakdown}
            expanded={expanded}
            onToggle={(category) => (expanded[category] ? collapse(category) : expand(category))}
            active={active}
            onActive={setActive}
            presenter={presenter}
            caption={
              selected.sum ? (
                <span data-testid="cashflow-sum-heading">
                  {ts('ledger.sumHeading', { from: selected.fromAge, to: selected.toAge })}
                </span>
              ) : (
                ts('periodAge', { age: selected.fromAge })
              )
            }
            edit={onEdit ? (target, invoker) => onEdit(target, invoker) : undefined}
            editLabel={editLabel}
          />
          <div className="ws-cashflow-notes">
            <p className="ws-callout" data-testid="cashflow-tax-total">
              {selected.sum
                ? ts('ledger.totalTaxSum', {
                    from: selected.fromAge,
                    to: selected.toAge,
                    amount: money(row.incomeTax + row.capitalGainsTax),
                  })
                : t('totalTax', { amount: money(row.incomeTax + row.capitalGainsTax) })}
            </p>
            {row.shortfall > 0.01 && <p className="ws-note-danger">{t('shortfallNote')}</p>}
            {selected.phase === 'working' && <p className="ws-footnote">{t('workingYears')}</p>}
          </div>
          <details className="ws-disclosure">
            <summary>{t('assetReconciliation')}</summary>
            <dl className="ws-disclosure-body" style={{ maxWidth: '36rem' }}>
              {line(t('openingAssets'), row.openingAssets)}
              {line(t('investmentReturn'), row.investmentReturn)}
              {line(t('portfolioContribution'), row.portfolioContribution)}
              {line(t('portfolioWithdrawal'), -row.portfolioWithdrawal)}
              {line(t('closingAssets'), row.closingAssets, true)}
            </dl>
          </details>
          <details className="ws-disclosure">
            <summary>{t('allYears')}</summary>
            <div className="ws-disclosure-body">
              <p className="ws-footnote">{ts('ledger.rowHint')}</p>
              <div
                className="ws-cashflow-table"
                style={{ marginTop: 12 }}
                tabIndex={0}
                role="region"
                aria-label={t('allYears')}
              >
                <table>
                  <caption>{t('tableNote')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('age')}</th>
                      <th scope="col">{t('savings')}</th>
                      {columns.map((key) => (
                        <th key={key} scope="col">
                          {t(key)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {series!.map((entry, i) => {
                      const isSelected = !selected.sum && selected.index === i
                      return (
                        <tr
                          key={ages[i]}
                          onClick={() => selectAge(ages[i])}
                          data-selected={isSelected || undefined}
                        >
                          <th scope="row">
                            {/* The row is clickable for the mouse; this is the keyboard way in. */}
                            <button
                              type="button"
                              className={cn(
                                'min-h-9 min-w-11 rounded-sm px-1.5 text-left font-semibold underline-offset-2 hover:underline',
                                isSelected && 'underline'
                              )}
                              aria-pressed={isSelected}
                              aria-label={ts('ledger.selectRow', { age: ages[i] })}
                            >
                              {ages[i]}
                            </button>
                          </th>
                          <td>{money(entry.savings)}</td>
                          {columns.map((key) => (
                            <td key={key}>{money(entry[key])}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
          <details className="ws-disclosure">
            <summary>{t('assumptionsTitle')}</summary>
            <div className="ws-disclosure-body ws-footnote" style={{ maxWidth: '72ch' }}>
              <p>{t('assumptions')}</p>
              <p style={{ marginTop: 8 }}>{t('oneOffTiming')}</p>
            </div>
          </details>
        </>
      )}
    </div>
  )
}

interface TableProps {
  row: AnnualCashFlow
  overview: CashflowSankeyModel
  model: CashflowSankeyModel
  breakdown: FlowBreakdown | undefined
  expanded: Expansion
  onToggle: (category: FlowCategory) => void
  active: string | null
  onActive: (id: string | null) => void
  presenter: SankeyPresenter
  caption: ReactNode
  edit?: (target: EditTarget, invoker: HTMLElement | null) => void
  editLabel: (target: EditTarget) => string
}

/**
 * "Aufstellung": the diagram as a table, grouped the way it is drawn — where
 * the money comes from, the taxes and what is left, where it goes — then the
 * net figures the old three-column ledger showed. Categories open into their
 * flows (every one of them, not just the diagram's largest six) with the same
 * expanded state as the diagram, and hovering a row lights up its node.
 */
function CashflowTable({
  row,
  overview,
  model,
  breakdown,
  expanded,
  onToggle,
  active,
  onActive,
  presenter,
  caption,
  edit,
  editLabel,
}: TableProps) {
  const t = useTranslations('cashflowSankey')
  const tr = useTranslations('cashflowResults')
  // Names may hyphenate on phones; the document itself is always `lang="en"`.
  const locale = useLocale()
  const { money, percent } = presenter
  const share = (value: number) => (overview.totalIn > 0 ? value / overview.totalIn : 0)
  const lit = resolveActive(model, active)
  const isActive = (id: string) => {
    if (!lit) return false
    if (active === id) return true
    const standsFor = resolveActive(model, id)
    return standsFor ? [...standsFor.nodes].some((node) => lit.nodes.has(node)) : false
  }
  const hover = (id: string) => ({
    'data-active': isActive(id) || undefined,
    onMouseEnter: () => onActive(id),
    onMouseLeave: () => onActive(null),
    onFocus: () => onActive(id),
    onBlur: () => onActive(null),
  })

  // Amount and share of all inflows. Where the table is too narrow for a
  // third column (phones), the share column folds away and the same figure
  // shows in small type under the amount instead (see cashflow.css).
  const figureCells = (amount: number, shareValue?: number) => (
    <>
      <td>
        {money(amount)}
        {shareValue !== undefined && (
          <span className="ws-flowtable-share-inline">{percent(shareValue)}</span>
        )}
      </td>
      <td>{shareValue === undefined ? '' : percent(shareValue)}</td>
    </>
  )

  const nodeOf = (id: SankeyNodeId) => overview.nodes.find((node) => node.id === id)
  const incomeTotal = row.incomeGross
  const shown = (value: number) => value >= SANKEY_MIN_AMOUNT
  const sources = overview.nodes.filter((node) => node.column === 0)
  const taxes = overview.nodes.filter(
    (node) => node.id === 'incomeTax' || node.id === 'capitalGainsTax'
  )
  const hub = nodeOf('available')
  const uses = overview.nodes.filter((node) => node.column === 2)

  const editButton = (label: string, target: EditTarget) =>
    edit ? (
      <button
        type="button"
        className="ws-ledger-edit"
        onClick={(event) => edit(target, event.currentTarget)}
        data-edit-target={'panel' in target ? target.panel : target.section}
      >
        {label}
        <PencilLine size={12} aria-hidden="true" />
        <span className="sr-only">
          {' – '}
          {editLabel(target)}
        </span>
      </button>
    ) : (
      label
    )

  const categoryRow = (node: CashflowSankeyNode) => {
    const category = node.category
    const items = isFlowCategory(category) ? breakdown?.categories[category]?.items : undefined
    const openable =
      isFlowCategory(category) && model.expandable.includes(category) && items !== undefined
    const open = openable && Boolean(expanded[category as FlowCategory])
    const name = presenter.categoryName(category)
    const target = CATEGORY_EDIT[category]
    const funded = node.unfunded !== undefined ? node.value - node.unfunded : null
    const rows: ReactNode[] = [
      <tr key={node.id} data-row={node.id} data-kind="category" {...hover(node.id)}>
        <th scope="row">
          <span className="ws-flowtable-name">
            {openable ? (
              <>
                <button
                  type="button"
                  className="ws-flowtable-toggle"
                  aria-expanded={open}
                  onClick={() => onToggle(category as FlowCategory)}
                  data-testid={`cashflow-toggle-${category}`}
                >
                  <ChevronRight size={14} aria-hidden="true" className="ws-flowtable-chevron" />
                  <Swatch color={CATEGORY_COLOR[category]} />
                  {name}
                  <span className="ws-flowtable-count">
                    {items!.filter((item) => item.flow).length}
                  </span>
                </button>
                {edit && (
                  <button
                    type="button"
                    className="ws-flowtable-pencil"
                    onClick={(event) => edit(FLOWS_PANEL, event.currentTarget)}
                    aria-label={`${name} – ${editLabel(FLOWS_PANEL)}`}
                    data-edit-target="flows"
                  >
                    <PencilLine size={12} aria-hidden="true" />
                  </button>
                )}
              </>
            ) : (
              <span className="ws-flowtable-plain">
                <Swatch color={CATEGORY_COLOR[category]} dashed={category === 'shortfall'} />
                {target ? editButton(name, target) : name}
              </span>
            )}
          </span>
          {funded !== null && (
            <span className="ws-flowtable-meta">
              {t('unfundedPart')}: {money(node.unfunded!)}
            </span>
          )}
        </th>
        {figureCells(node.value, share(node.value))}
      </tr>,
    ]
    if (open && items) {
      items.forEach((item, index) => rows.push(itemRow(node, item, index)))
    }
    return rows
  }

  const itemRow = (parent: CashflowSankeyNode, item: FlowBreakdownItem, index: number) => {
    const category = parent.category as FlowCategory
    const id = itemNodeId(category, item.key)
    const name = presenter.itemName(item)
    const meta: string[] = []
    if (item.flow) meta.push(presenter.period(item))
    meta.push(
      t('shareOf', { share: percent(item.share), category: presenter.categoryName(category) })
    )
    if (item.roundedTax > 0) {
      meta.push(
        t(item.taxEstimated ? 'taxPartEstimated' : 'taxPart', { amount: money(item.roundedTax) })
      )
    }
    if (item.estimated) meta.push(t('estimated'))
    const color = itemColor(category, index)
    return (
      <tr key={id} data-row={id} data-kind="item" {...hover(id)}>
        <th scope="row">
          <span className="ws-flowtable-item">
            <Swatch color={color} />
            <span className="min-w-0">
              {item.flow && edit ? (
                <button
                  type="button"
                  className="ws-flowtable-link"
                  onClick={(event) =>
                    edit(
                      { panel: 'flows', fieldId: flowFieldId(item.flow!.id) },
                      event.currentTarget
                    )
                  }
                  data-flow-id={item.flow.id}
                >
                  {name}
                  <PencilLine size={12} aria-hidden="true" />
                  <span className="sr-only">
                    {' – '}
                    {t('actions.edit')}
                  </span>
                </button>
              ) : (
                <span>{name}</span>
              )}
              <span className="ws-flowtable-meta">{meta.join(' · ')}</span>
            </span>
          </span>
        </th>
        {figureCells(item.rounded, share(item.amount))}
      </tr>
    )
  }

  const totalRow = (id: string, label: ReactNode, amount: number, shareValue?: number) => (
    <tr key={id} data-row={id} data-kind="total" {...hover(id)}>
      <th scope="row">{label}</th>
      {figureCells(amount, shareValue)}
    </tr>
  )
  const netRow = (
    key: string,
    label: ReactNode,
    amount: number,
    detail?: string,
    emphasis = false
  ) => (
    <tr key={key} data-row={key} data-kind="net" data-emphasis={emphasis || undefined}>
      <th scope="row">
        {label}
        {detail && <span className="ws-flowtable-meta">{detail}</span>}
      </th>
      {figureCells(amount)}
    </tr>
  )

  return (
    <div className="ws-flowtable-wrap" lang={locale}>
      <table className="ws-flowtable" data-testid="cashflow-table">
        <caption>
          {t('table.caption')} · {caption}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t('table.item')}</th>
            <th scope="col">{t('amount')}</th>
            <th scope="col">{t('share')}</th>
          </tr>
        </thead>
        <tbody data-group="in">
          <tr className="ws-flowtable-head">
            <th scope="rowgroup" colSpan={3}>
              {t('moneyIn')}
            </th>
          </tr>
          {sources.flatMap(categoryRow)}
          {sources.length > 1 && totalRow('totalIn', t('table.totalIn'), overview.totalIn, 1)}
        </tbody>
        {(taxes.length > 0 || hub) && (
          <tbody data-group="taxes">
            <tr className="ws-flowtable-head">
              <th scope="rowgroup" colSpan={3}>
                {t('table.taxes')}
              </th>
            </tr>
            {taxes.flatMap(categoryRow)}
            {hub &&
              totalRow(
                'available',
                presenter.categoryName('available'),
                hub.value,
                share(hub.value)
              )}
          </tbody>
        )}
        <tbody data-group="out">
          <tr className="ws-flowtable-head">
            <th scope="rowgroup" colSpan={3}>
              {t('moneyOut')}
            </th>
          </tr>
          {uses.flatMap(categoryRow)}
        </tbody>
        <tbody data-group="net">
          <tr className="ws-flowtable-head">
            <th scope="rowgroup" colSpan={3}>
              {t('table.net')}
            </th>
          </tr>
          {/* The old ledger's balance lines; a line that would only repeat a
              zero (no income this year) or its neighbour (nothing unfunded)
              is left out. "Not covered" always stays: it is the answer. */}
          {shown(incomeTotal) &&
            netRow(
              'incomeNet',
              tr('incomeNet'),
              incomeTotal - row.incomeTax,
              t('table.netDetail', {
                gross: money(incomeTotal),
                grossLabel: tr('incomeGross'),
                tax: money(row.incomeTax),
              })
            )}
          {shown(row.portfolioWithdrawal) &&
            netRow(
              'withdrawalNet',
              tr('withdrawalNet'),
              row.portfolioWithdrawal - row.capitalGainsTax,
              t('table.netDetail', {
                gross: money(row.portfolioWithdrawal),
                grossLabel: tr('portfolioWithdrawal'),
                tax: money(row.capitalGainsTax),
              })
            )}
          {netRow('expenses', editButton(tr('expenses'), FLOWS_PANEL), row.expenses)}
          {shown(row.shortfall) && netRow('funded', tr('funded'), row.expenses - row.shortfall)}
          {netRow('shortfall', tr('shortfall'), row.shortfall, undefined, true)}
        </tbody>
      </table>
    </div>
  )
}

function Swatch({ color, dashed = false }: { color: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('ws-flowtable-swatch', dashed && 'opacity-70')}
      style={{ backgroundColor: color }}
    />
  )
}
