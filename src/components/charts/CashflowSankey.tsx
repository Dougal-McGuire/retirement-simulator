'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { ChevronDown, ChevronRight, PencilLine } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { FlowBreakdownItem, FlowCategory } from '@/lib/simulation/flowBreakdown'
import { cn } from '@/lib/utils'
import { ChartTooltipCard, withAlpha, type TooltipRow } from './chartTheme'
import {
  estimateTextWidth,
  layoutCashflowSankey,
  NODE_WIDTH,
  type LaidOutNode,
  type Measure,
} from './cashflowSankeyLayout'
import {
  nodeCategory,
  type CashflowSankeyLink,
  type CashflowSankeyModel,
  type CashflowSankeyNode,
  type SankeyGroup,
  type SankeyNodeId,
} from './cashflowSankeyModel'

/**
 * Node identity, from theme tokens only. Sources keep the hue their category
 * has elsewhere (pension green, portfolio accent, spending purple); red is
 * reserved for taxes.
 */
export const CATEGORY_COLOR: Record<SankeyNodeId, string> = {
  pension: 'var(--chart-pension)',
  income: 'var(--chart-pension)',
  otherIncome: 'var(--viz-3)',
  oneOffIncome: 'var(--viz-5)',
  savings: 'hsl(var(--chart-5))',
  withdrawal: 'var(--accent)',
  shortfall: 'var(--warn)',
  available: withAlpha('--ink-rgb', 0.45),
  incomeTax: 'var(--danger)',
  capitalGainsTax: 'var(--danger)',
  baselineSpending: 'var(--viz-purple)',
  spending: 'var(--viz-purple)',
  scheduledExpenses: withAlpha('--viz-pink-rgb', 1),
  reinvested: 'var(--accent)',
}

/** Items are lighter tints of their category, alternating so neighbours differ. */
const ITEM_TINTS = [82, 64, 74, 56] as const
const MORE_TINT = 42

const tint = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, var(--surface))`

/** The tint of a category's `index`-th item (largest first), in the diagram and the table. */
export const itemColor = (category: SankeyNodeId, index: number) =>
  tint(CATEGORY_COLOR[category], ITEM_TINTS[index % ITEM_TINTS.length])

export function nodeColor(node: CashflowSankeyNode, model: CashflowSankeyModel): string {
  const base = CATEGORY_COLOR[node.category]
  if (node.kind === 'category') return base
  if (node.kind === 'more') return tint(base, MORE_TINT)
  const group = model.groups.find((entry) => entry.nodeIds.includes(node.id))
  return itemColor(node.category, group ? group.nodeIds.indexOf(node.id) : 0)
}

const isTax = (id: string) => id === 'incomeTax' || id === 'capitalGainsTax'

/**
 * A link wears its source's category colour — except into a tax (always the
 * semantic red) and out of the neutral hub, where the destination is the news.
 */
export function linkColor(link: CashflowSankeyLink): string {
  if (isTax(link.target)) return CATEGORY_COLOR[nodeCategory(link.target)]
  if (link.source === 'available') return CATEGORY_COLOR[nodeCategory(link.target)]
  return CATEGORY_COLOR[nodeCategory(link.source)]
}

export const linkKey = (link: Pick<CashflowSankeyLink, 'source' | 'target'>) =>
  `${link.source}->${link.target}`

/**
 * What a hovered or focused id lights up: a link and its two ends, or a node
 * and every link touching it. An id the drawing does not have — a collapsed
 * category's item hovered in the table, or an expanded category's own id —
 * resolves to what stands for it.
 */
export function resolveActive(
  model: CashflowSankeyModel,
  id: string | null
): { nodes: Set<string>; links: Set<string> } | null {
  if (!id) return null
  const link = model.links.find((entry) => linkKey(entry) === id)
  if (link) return { nodes: new Set([link.source, link.target]), links: new Set([id]) }
  const present = (nodeId: string) => model.nodes.some((node) => node.id === nodeId)
  let ids: string[] = []
  if (present(id)) ids = [id]
  else {
    const group = model.groups.find((entry) => entry.category === id)
    if (group) ids = group.nodeIds
    else {
      const category = nodeCategory(id)
      const more = model.nodes.find(
        (node) =>
          node.kind === 'more' &&
          node.category === category &&
          node.folded?.some((item) => `${category}:${item.key}` === id)
      )
      if (more) ids = [more.id]
      else if (present(category)) ids = [category]
    }
  }
  if (ids.length === 0) return null
  const nodes = new Set(ids)
  const links = new Set<string>()
  for (const entry of model.links) {
    if (nodes.has(entry.source) || nodes.has(entry.target)) links.add(linkKey(entry))
  }
  return { nodes, links }
}

/** Below this width the three columns and their labels cannot share a row. */
const WIDE_MIN = 620
const LABEL_FONT = 12

export interface SankeyPeriod {
  fromAge: number
  toAge: number
  sum: boolean
}

export type NodeAction = 'expand' | 'all' | 'edit' | 'none'

/** Names, amounts and what a click does — supplied by the card, which knows the plan. */
export interface SankeyPresenter {
  name: (node: CashflowSankeyNode) => string
  categoryName: (category: SankeyNodeId) => string
  money: (value: number) => string
  labelMoney: (value: number) => string
  percent: (share: number) => string
  /** A flow's display name (the plan's own text, or its localised seed name). */
  itemName: (item: FlowBreakdownItem) => string
  /** "Ab Alter 63 · Monatlich" for an item's flow. */
  period: (item: FlowBreakdownItem) => string
  /**
   * What a click (or Enter) does, the tooltip's hint for it, and — for an
   * edit — where it leads ("edit in “Market & taxes”"), for the accessible name.
   */
  action: (node: CashflowSankeyNode) => { kind: NodeAction; hint?: string; label?: string }
}

interface CashflowSankeyProps {
  /** The drawing: categories, or their items where expanded. */
  model: CashflowSankeyModel
  /** The same row, every category collapsed — what the sentence reads. */
  overview: CashflowSankeyModel
  period: SankeyPeriod
  presenter: SankeyPresenter
  /** Hovered or focused node / link id, shared with the table. */
  active: string | null
  onActive: (id: string | null) => void
  onActivate: (node: CashflowSankeyNode, invoker: Element | null) => void
  onCollapse: (category: FlowCategory, invoker: Element | null) => void
  /** The section's controls (year, unit, expand all), led into one row. */
  controls?: ReactNode
  /** Lines under the drawing: switched-off flows, then what the amounts are. */
  footer?: ReactNode
  note?: ReactNode
}

interface Tip {
  id: string
  x: number
  y: number
}

type Translate = ReturnType<typeof useTranslations>

/** Canvas text metrics in the chart's own font; the estimate until fonts load. */
function useTextMeasure(frame: HTMLElement | null): Measure {
  const [fontsReady, setFontsReady] = useState(0)
  useEffect(() => {
    let alive = true
    document.fonts?.ready.then(() => alive && setFontsReady((count) => count + 1))
    return () => {
      alive = false
    }
  }, [])
  return useMemo(() => {
    void fontsReady
    if (typeof document === 'undefined' || !frame) return estimateTextWidth
    const context = document.createElement('canvas').getContext('2d')
    if (!context) return estimateTextWidth
    const family = getComputedStyle(frame).fontFamily || 'sans-serif'
    const cache = new Map<string, number>()
    return (text, weight, size) => {
      const key = `${weight}|${size}|${text}`
      const known = cache.get(key)
      if (known !== undefined) return known
      context.font = `${weight === 'bold' ? 600 : 400} ${size}px ${family}`
      const width = Math.ceil(context.measureText(text).width)
      cache.set(key, width)
      return width
    }
  }, [frame, fontsReady])
}

export function CashflowSankey({
  model,
  overview,
  period,
  presenter,
  active,
  onActive,
  onActivate,
  onCollapse,
  controls,
  footer,
  note,
}: CashflowSankeyProps) {
  const t = useTranslations('cashflowSankey')
  const format = useFormatter()
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 })
  const [tip, setTip] = useState<Tip | null>(null)
  const measure = useTextMeasure(frame)

  useEffect(() => {
    if (!frame) return
    // A hidden frame (compare mode hides the sections) measures 0×0; keep the
    // last real size so the layout does not flip to "stacked" and back, which
    // would move the page under a restored scroll position.
    const read = () => {
      const width = Math.floor(frame.clientWidth)
      const height = Math.floor(frame.clientHeight)
      if (width === 0 && height === 0) return
      setSize({ width, height })
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [frame])

  const share = (value: number) => (overview.totalIn > 0 ? value / overview.totalIn : 0)
  const { money } = presenter

  const summary = (() => {
    if (overview.totalIn <= 0) return t('summaryEmpty')
    const phrase = (id: string, value: number) => t(`phrases.${id}`, { amount: money(value) })
    const sources = overview.nodes.filter((node) => node.column === 0 && node.id !== 'shortfall')
    const terminals = overview.nodes.filter(
      (node) => !overview.links.some((link) => link.source === node.id)
    )
    const uses = terminals
      .filter((node) => !isTax(node.id))
      .map((node) => phrase(node.id, node.value - (node.unfunded ?? 0)))
    if (overview.taxes > 0) uses.push(phrase('taxes', overview.taxes))
    const text = t('summary', {
      period: period.sum
        ? t('summaryPeriodSum', { from: period.fromAge, to: period.toAge })
        : t('summaryPeriodAge', { age: period.fromAge }),
      sources: format.list(
        sources.map((node) => phrase(node.id, node.value)),
        { type: 'conjunction' }
      ),
      count: sources.length,
      uses: format.list(uses, { type: 'conjunction' }),
    })
    const gap = overview.nodes.find((node) => node.id === 'shortfall')
    return gap ? `${text} ${t('summaryUnfunded', { amount: money(gap.value) })}` : text
  })()

  const wide = width >= WIDE_MIN
  const shownTip = tip && tip.id === active ? tip : null

  return (
    <>
      {controls && <div className="ws-cashflow-controls">{controls}</div>}
      <figure className="ws-sankey" data-testid="cashflow-sankey">
        {/* The sentence is the caption: the section header already names the
            chart, and the control row says which year and which euros. */}
        <figcaption className="ws-sankey-summary" data-testid="cashflow-sankey-summary">
          {summary}
        </figcaption>
        <div
          ref={setFrame}
          role="group"
          aria-label={t('diagramLabel')}
          className="ws-sankey-frame"
          data-layout={wide ? 'sankey' : 'stacked'}
          onMouseLeave={() => {
            setTip(null)
            onActive(null)
          }}
        >
          {width > 0 &&
            (wide ? (
              <SankeyDiagram
                width={width}
                model={model}
                presenter={presenter}
                measure={measure}
                active={active}
                onHover={(id, x, y) => {
                  setTip(id && x !== undefined && y !== undefined ? { id, x, y } : null)
                  onActive(id)
                }}
                onActivate={onActivate}
                onCollapse={onCollapse}
                t={t}
              />
            ) : (
              <StackedFlows
                model={model}
                presenter={presenter}
                share={share}
                active={active}
                onActive={onActive}
                onActivate={onActivate}
                onCollapse={onCollapse}
                t={t}
              />
            ))}
          {wide && shownTip && (
            <div
              className="pointer-events-none absolute z-10"
              style={{
                left: shownTip.x,
                top: shownTip.y,
                // Flip towards the middle so the card never leaves the frame.
                transform: `translate(${shownTip.x > width / 2 ? 'calc(-100% - 14px)' : '14px'}, ${
                  shownTip.y > height * 0.7 ? '-100%' : shownTip.y < height * 0.3 ? '0%' : '-50%'
                })`,
              }}
            >
              <SankeyTooltip
                activeKey={shownTip.id}
                model={model}
                presenter={presenter}
                share={share}
                t={t}
              />
            </div>
          )}
        </div>
        {footer}
        {note && (
          <p className="ws-sankey-note" data-testid="cashflow-sankey-note">
            {note}
          </p>
        )}
      </figure>
    </>
  )
}

function Swatch({ color, dashed = false }: { color: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block h-3 w-3 shrink-0 rounded-[2px]', dashed && 'opacity-70')}
      style={{ backgroundColor: color }}
    />
  )
}

/** Accessible name of a node: what it is, its amount, and what Enter does. */
function nodeLabel(
  node: CashflowSankeyNode,
  presenter: SankeyPresenter,
  t: Translate
): { label: string; action: NodeAction } {
  const { kind, label } = presenter.action(node)
  const base = `${presenter.name(node)}, ${presenter.money(node.rounded)}`
  if (kind === 'expand') return { label: `${base} – ${t('actions.expand')}`, action: kind }
  if (kind === 'all') return { label: `${base} – ${t('actions.showAll')}`, action: kind }
  if (kind === 'edit') return { label: `${base} – ${label ?? t('actions.edit')}`, action: kind }
  return { label: base, action: kind }
}

interface DiagramProps {
  width: number
  model: CashflowSankeyModel
  presenter: SankeyPresenter
  measure: Measure
  active: string | null
  onHover: (id: string | null, x?: number, y?: number) => void
  onActivate: (node: CashflowSankeyNode, invoker: Element | null) => void
  onCollapse: (category: FlowCategory, invoker: Element | null) => void
  t: Translate
}

const groupFocusId = (category: FlowCategory) => `group:${category}`

/**
 * The wide layout: an SVG Sankey laid out by `layoutCashflowSankey`. One tab
 * stop; arrow keys move between nodes (and the captions of expanded
 * categories), Enter or Space does what a click does.
 */
function SankeyDiagram({
  width,
  model,
  presenter,
  measure,
  active,
  onHover,
  onActivate,
  onCollapse,
  t,
}: DiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const layout = useMemo(
    () =>
      layoutCashflowSankey(
        model,
        width,
        {
          name: presenter.name,
          amount: (node) => presenter.labelMoney(node.rounded),
          caption: (group) => ({
            name: presenter.categoryName(group.category),
            amount: presenter.labelMoney(Math.round(group.value)),
          }),
          marker: (node) => presenter.action(node).kind === 'expand',
        },
        measure
      ),
    [model, width, presenter, measure]
  )
  const highlight = useMemo(() => resolveActive(model, active), [model, active])
  // Lit: the active nodes and whatever the active links touch.
  const lit = useMemo(() => {
    if (!highlight) return null
    const nodes = new Set(highlight.nodes)
    for (const link of model.links) {
      if (!highlight.links.has(linkKey(link))) continue
      nodes.add(link.source)
      nodes.add(link.target)
    }
    return nodes
  }, [highlight, model.links])

  // Roving focus: one stop in the tab order, arrows between nodes.
  const order = useMemo(() => {
    const entries: { id: string; column: number; y: number }[] = []
    for (const laid of layout.nodes) {
      entries.push({ id: laid.node.id, column: laid.node.column, y: laid.y })
    }
    for (const group of layout.groups) {
      entries.push({
        id: groupFocusId(group.group.category),
        column: group.group.column,
        y: group.top,
      })
    }
    return entries.sort((a, b) => a.column - b.column || a.y - b.y)
  }, [layout])
  const [focusId, setFocusId] = useState<string | null>(null)
  const current = order.some((entry) => entry.id === focusId) ? focusId : (order[0]?.id ?? null)
  const pendingFocus = useRef<string | null>(null)

  useEffect(() => {
    const wanted = pendingFocus.current
    if (!wanted) return
    pendingFocus.current = null
    const target = svgRef.current?.querySelector<SVGElement>(
      `[data-focus-id="${CSS.escape(wanted)}"]`
    )
    target?.focus({ preventScroll: true })
  })

  const focusEntry = (id: string) => {
    setFocusId(id)
    pendingFocus.current = id
  }

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const index = order.findIndex((entry) => entry.id === current)
    if (index < 0) return
    const here = order[index]
    const nearestIn = (column: number) =>
      order
        .filter((entry) => entry.column === column)
        .sort((a, b) => Math.abs(a.y - here.y) - Math.abs(b.y - here.y))[0]
    let next: { id: string } | undefined
    switch (event.key) {
      case 'ArrowDown':
        next = order[Math.min(order.length - 1, index + 1)]
        break
      case 'ArrowUp':
        next = order[Math.max(0, index - 1)]
        break
      case 'ArrowRight':
        next = nearestIn(here.column + 1) ?? nearestIn(here.column + 2)
        break
      case 'ArrowLeft':
        next = nearestIn(here.column - 1) ?? nearestIn(here.column - 2)
        break
      case 'Home':
        next = order[0]
        break
      case 'End':
        next = order[order.length - 1]
        break
      default:
        return
    }
    event.preventDefault()
    if (next) focusEntry(next.id)
  }

  const activate = (node: CashflowSankeyNode, element: Element | null) => {
    const { kind } = presenter.action(node)
    if (kind === 'none') return
    if (kind === 'expand') pendingFocus.current = groupFocusId(node.category as FlowCategory)
    if (kind === 'all') pendingFocus.current = groupFocusId(node.category as FlowCategory)
    onActivate(node, element)
  }
  const collapse = (category: FlowCategory, element: Element | null) => {
    pendingFocus.current = category
    setFocusId(category)
    onCollapse(category, element)
  }
  const keyActivate = (event: KeyboardEvent<SVGGElement>, run: () => void) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    run()
  }

  const hoverNode = (laid: LaidOutNode) =>
    onHover(
      laid.node.id,
      laid.x + (laid.node.column === 2 ? 0 : laid.width),
      laid.y + laid.height / 2
    )

  return (
    <svg
      ref={svgRef}
      width={layout.width}
      height={layout.height}
      className="ws-sankey-svg"
      onKeyDown={onKeyDown}
      data-height={layout.height}
    >
      <g aria-hidden="true">
        {layout.links.map(({ link, path, width: strokeWidth, midX, midY }) => {
          const key = linkKey(link)
          const emphasis = highlight === null ? 'rest' : highlight.links.has(key) ? 'on' : 'off'
          return (
            <path
              key={key}
              data-link={key}
              d={path}
              fill="none"
              stroke={linkColor(link)}
              strokeWidth={strokeWidth}
              strokeOpacity={emphasis === 'on' ? 0.62 : emphasis === 'off' ? 0.12 : 0.34}
              strokeDasharray={link.source === 'shortfall' ? '6 4' : undefined}
              onMouseEnter={() => onHover(key, midX, midY)}
              onMouseLeave={() => onHover(null)}
              style={{ transition: 'stroke-opacity 120ms ease' }}
            />
          )
        })}
      </g>
      {/* Brackets beside each expanded category's items. */}
      <g aria-hidden="true">
        {layout.groups.map((group) => (
          <line
            key={group.group.category}
            x1={group.bracketX}
            x2={group.bracketX}
            y1={group.itemsTop}
            y2={group.bottom}
            stroke={CATEGORY_COLOR[group.group.category]}
            strokeOpacity={0.55}
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
      </g>
      {layout.groups.map((group) => {
        const category = group.group.category
        const id = groupFocusId(category)
        const dimmed = lit !== null && !group.group.nodeIds.some((nodeId) => lit.has(nodeId))
        const left = group.anchor === 'end'
        const chevronX = left ? group.x + 4 : group.x - 14
        return (
          <g
            key={id}
            className="ws-sankey-caption"
            data-group={category}
            data-focus-id={id}
            role="button"
            tabIndex={current === id ? 0 : -1}
            aria-expanded="true"
            aria-label={t('actions.collapseGroup', { name: group.full })}
            opacity={dimmed ? 0.5 : 1}
            onClick={(event: MouseEvent<SVGGElement>) => collapse(category, event.currentTarget)}
            onKeyDown={(event) => keyActivate(event, () => collapse(category, event.currentTarget))}
            onFocus={() => setFocusId(id)}
          >
            <rect
              className="ws-sankey-hit"
              x={left ? group.x - measureCaption(group.text, measure) - 4 : group.x - 18}
              y={group.top}
              width={measureCaption(group.text, measure) + 22}
              height={20}
              rx={3}
            />
            <path
              d={`M${chevronX},${group.y - 7} l4,4 l4,-4`}
              fill="none"
              stroke="var(--ui-muted)"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text
              x={group.x}
              y={group.y}
              textAnchor={group.anchor}
              fontSize={LABEL_FONT}
              fontWeight={600}
              fill="hsl(var(--foreground))"
            >
              {group.text}
            </text>
          </g>
        )
      })}
      {layout.nodes.map((laid) => {
        const { node, label } = laid
        const { label: aria, action } = nodeLabel(node, presenter, t)
        const dimmed = lit !== null && !lit.has(node.id)
        const halo =
          label.side === 'above'
            ? { stroke: 'var(--surface)', strokeWidth: 4, paintOrder: 'stroke' as const }
            : {}
        const item = node.kind !== 'category'
        const hit = {
          x: Math.min(label.left, laid.x) - 4,
          y: Math.min(label.top, laid.y) - 2,
          right: Math.max(label.right, laid.x + NODE_WIDTH) + 4,
          bottom: Math.max(label.bottom, laid.y + laid.height) + 2,
        }
        return (
          <g
            key={node.id}
            className="ws-sankey-node"
            data-node={node.id}
            data-kind={node.kind}
            data-action={action}
            data-focus-id={node.id}
            data-truncated={label.truncated || undefined}
            role={action === 'none' ? 'img' : 'button'}
            aria-label={aria}
            aria-expanded={action === 'expand' ? false : undefined}
            tabIndex={current === node.id ? 0 : -1}
            opacity={dimmed ? 0.45 : 1}
            onMouseEnter={() => hoverNode(laid)}
            onMouseLeave={() => onHover(null)}
            onFocus={(event) => {
              setFocusId(node.id)
              // Keyboard focus shows the tooltip; focus moved after a click
              // (a collapsed group handing it back) does not.
              if (event.currentTarget.matches(':focus-visible')) hoverNode(laid)
            }}
            onBlur={() => onHover(null)}
            onClick={(event: MouseEvent<SVGGElement>) => activate(node, event.currentTarget)}
            onKeyDown={(event) => keyActivate(event, () => activate(node, event.currentTarget))}
          >
            <rect
              className="ws-sankey-hit"
              x={hit.x}
              y={hit.y}
              width={hit.right - hit.x}
              height={hit.bottom - hit.y}
              rx={3}
            />
            <rect
              x={laid.x}
              y={laid.y}
              width={laid.width}
              height={laid.height}
              rx={2}
              style={{ fill: nodeColor(node, model) }}
            />
            <text
              x={label.x}
              y={label.nameY}
              textAnchor={label.anchor}
              fontSize={LABEL_FONT}
              fontWeight={item ? 500 : 600}
              fill="hsl(var(--foreground))"
              strokeLinejoin="round"
              {...halo}
            >
              {label.marker && label.side === 'left' && (
                <tspan className="ws-sankey-glyph" fill="var(--ui-accent)">
                  {'+\u2009'}
                </tspan>
              )}
              {label.name}
              {label.marker && label.side !== 'left' && (
                <tspan className="ws-sankey-glyph" fill="var(--ui-accent)">
                  {'\u2009+'}
                </tspan>
              )}
            </text>
            <text
              x={label.x}
              y={label.amountY}
              textAnchor={label.anchor}
              fontSize={item ? 11 : LABEL_FONT}
              fill="hsl(var(--muted-foreground))"
              className="tabular-nums"
              strokeLinejoin="round"
              {...halo}
            >
              {label.amount}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

const measureCaption = (text: string, measure: Measure) => measure(text, 'bold', LABEL_FONT)

interface StackedProps {
  model: CashflowSankeyModel
  presenter: SankeyPresenter
  share: (value: number) => number
  active: string | null
  onActive: (id: string | null) => void
  onActivate: (node: CashflowSankeyNode, invoker: Element | null) => void
  onCollapse: (category: FlowCategory, invoker: Element | null) => void
  t: Translate
}

/**
 * The phone layout: the same nodes as two proportional bars — what comes in,
 * what goes out — each with its own labelled rows. Three columns of labels do
 * not fit in 360 px; two stacked bars do, without sideways scrolling. The
 * drill-down works the same: a category row opens into its items.
 */
function StackedFlows({
  model,
  presenter,
  share,
  active,
  onActive,
  onActivate,
  onCollapse,
  t,
}: StackedProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<string | null>(null)
  useEffect(() => {
    const wanted = pendingFocus.current
    if (!wanted) return
    pendingFocus.current = null
    listRef.current
      ?.querySelector<HTMLElement>(`[data-focus-id="${CSS.escape(wanted)}"]`)
      ?.focus({ preventScroll: true })
  })

  const terminals = model.nodes.filter(
    (node) => !model.links.some((link) => link.source === node.id)
  )
  const total = model.nodes
    .filter((node) => node.column === 0)
    .reduce((sum, node) => sum + node.value, 0)
  const highlight = resolveActive(model, active)
  const groups = [
    { key: 'in', title: t('moneyIn'), nodes: model.nodes.filter((node) => node.column === 0) },
    { key: 'out', title: t('moneyOut'), nodes: terminals },
  ]

  const row = (node: CashflowSankeyNode) => {
    const { kind } = presenter.action(node)
    const item = node.kind !== 'category'
    const on = highlight?.nodes.has(node.id) ?? false
    const content = (
      <>
        <span className="translate-y-[1px]">
          <Swatch color={nodeColor(node, model)} dashed={node.id === 'shortfall'} />
        </span>
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {presenter.name(node)}
          {kind === 'edit' && (
            <PencilLine size={12} aria-hidden="true" className="ml-1.5 inline opacity-60" />
          )}
          {node.item && (
            <span className="block text-xs text-muted-foreground">
              {presenter.period(node.item)}
              {node.item.estimated ? ` · ${t('estimated')}` : ''}
            </span>
          )}
          {node.unfunded !== undefined && (
            <span className="block text-xs text-muted-foreground">
              {t('unfundedPart')}: {presenter.money(node.unfunded)}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right tabular-nums">{presenter.money(node.rounded)}</span>
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {presenter.percent(share(node.value))}
        </span>
      </>
    )
    return (
      <li
        key={node.id}
        className={cn('ws-stacked-row', item && 'ws-stacked-item')}
        data-node={node.id}
        data-active={on || undefined}
        onMouseEnter={() => onActive(node.id)}
        onMouseLeave={() => onActive(null)}
      >
        {kind === 'none' ? (
          <div className="ws-stacked-line">{content}</div>
        ) : (
          <button
            type="button"
            className="ws-stacked-line ws-stacked-button"
            data-focus-id={node.id}
            aria-expanded={kind === 'expand' ? false : undefined}
            onClick={(event) => {
              if (kind === 'expand' || kind === 'all') {
                pendingFocus.current = groupFocusId(node.category as FlowCategory)
              }
              onActivate(node, event.currentTarget)
            }}
            onFocus={() => onActive(node.id)}
            onBlur={() => onActive(null)}
          >
            {kind === 'expand' && (
              <ChevronRight size={14} aria-hidden="true" className="ws-stacked-chevron" />
            )}
            {content}
            <span className="sr-only">
              {' – '}
              {kind === 'expand'
                ? t('actions.expand')
                : kind === 'all'
                  ? t('actions.showAll')
                  : (presenter.action(node).label ?? t('actions.edit'))}
            </span>
          </button>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-5" ref={listRef}>
      {groups.map((group) => {
        const rendered = new Set<SankeyGroup>()
        return (
          <div key={group.key} data-testid={`cashflow-sankey-${group.key}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm font-semibold">
              <span>{group.title}</span>
              <span className="tabular-nums">{presenter.money(total)}</span>
            </div>
            <div
              className="mt-2 flex h-3 w-full gap-[2px] overflow-hidden rounded-sm"
              aria-hidden="true"
            >
              {group.nodes.map((node) => (
                <span
                  key={node.id}
                  className="h-full min-w-[3px]"
                  style={{
                    flexGrow: node.value,
                    flexBasis: 0,
                    backgroundColor: nodeColor(node, model),
                    opacity: node.id === 'shortfall' ? 0.7 : 1,
                  }}
                />
              ))}
            </div>
            <ul className="ws-stacked-list">
              {group.nodes.map((node) => {
                const owner = model.groups.find((entry) => entry.nodeIds.includes(node.id))
                if (!owner) return row(node)
                if (rendered.has(owner)) return null
                rendered.add(owner)
                const name = presenter.categoryName(owner.category)
                return (
                  <li
                    key={`group-${owner.category}`}
                    className="ws-stacked-group"
                    data-group={owner.category}
                  >
                    <button
                      type="button"
                      className="ws-stacked-line ws-stacked-button ws-stacked-caption"
                      data-focus-id={groupFocusId(owner.category)}
                      aria-expanded="true"
                      onClick={(event) => {
                        pendingFocus.current = owner.category
                        onCollapse(owner.category, event.currentTarget)
                      }}
                    >
                      <ChevronDown size={14} aria-hidden="true" className="ws-stacked-chevron" />
                      <span className="translate-y-[1px]">
                        <Swatch color={CATEGORY_COLOR[owner.category]} />
                      </span>
                      <span className="min-w-0 flex-1">{name}</span>
                      <span className="shrink-0 text-right tabular-nums">
                        {presenter.money(Math.round(owner.value))}
                      </span>
                      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {presenter.percent(share(owner.value))}
                      </span>
                    </button>
                    <ul className="ws-stacked-list">
                      {owner.nodeIds
                        .map((id) => model.nodes.find((entry) => entry.id === id))
                        .filter((entry): entry is CashflowSankeyNode => entry !== undefined)
                        .map(row)}
                    </ul>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

interface TooltipProps {
  activeKey: string
  model: CashflowSankeyModel
  presenter: SankeyPresenter
  share: (value: number) => number
  t: Translate
}

function SankeyTooltip({ activeKey, model, presenter, share, t }: TooltipProps) {
  const { money, percent } = presenter
  const link = model.links.find((entry) => linkKey(entry) === activeKey)
  if (link) {
    const name = (id: string) => {
      const node = model.nodes.find((entry) => entry.id === id)
      return node ? presenter.name(node) : presenter.categoryName(nodeCategory(id))
    }
    return (
      <ChartTooltipCard
        title={`${name(link.source)} → ${name(link.target)}`}
        rows={[
          {
            key: 'amount',
            label: t('amount'),
            value: money(link.value),
            color: linkColor(link),
            kind: 'band',
            emphasis: true,
          },
          { key: 'share', label: t('share'), value: percent(share(link.value)) },
        ]}
      />
    )
  }
  const node = model.nodes.find((entry) => entry.id === activeKey)
  if (!node) return null
  const { hint } = presenter.action(node)
  const rows: TooltipRow[] = [
    {
      key: 'amount',
      label: t('amount'),
      value: money(node.rounded),
      color: nodeColor(node, model),
      kind: 'band',
      emphasis: true,
    },
  ]
  const notes: string[] = []
  if (node.item) {
    const category = presenter.categoryName(node.category)
    rows.push({
      key: 'categoryShare',
      label: t('categoryShare', { category }),
      value: percent(node.item.share),
    })
    rows.push({ key: 'period', label: t('period'), value: presenter.period(node.item) })
    if (node.tax !== undefined && node.tax >= 0.5) {
      rows.push({
        key: 'tax',
        label: t('nodes.incomeTax'),
        value: node.item.taxEstimated
          ? `${money(node.item.roundedTax)} · ${t('estimated')}`
          : money(node.item.roundedTax),
      })
    }
    if (node.item.estimated) notes.push(t('estimatedNote'))
    else if (node.item.taxEstimated) notes.push(t('taxEstimatedNote'))
  } else if (node.folded) {
    for (const item of node.folded.slice(0, 5)) {
      rows.push({
        key: item.key,
        label: presenter.itemName(item),
        value: money(item.rounded),
      })
    }
    if (node.folded.length > 5) {
      rows.push({ key: 'rest', label: '…', value: '' })
    }
  } else {
    rows.push({ key: 'share', label: t('share'), value: percent(share(node.value)) })
  }
  if (node.unfunded !== undefined) {
    rows.push({ key: 'unfunded', label: t('unfundedPart'), value: money(node.unfunded) })
  }
  if (hint) notes.push(hint)
  return (
    <ChartTooltipCard
      title={presenter.name(node)}
      rows={rows}
      footer={notes.length > 0 ? notes.map((line) => <p key={line}>{line}</p>) : undefined}
    />
  )
}
