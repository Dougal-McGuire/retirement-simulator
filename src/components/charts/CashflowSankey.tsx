'use client'

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Sankey } from 'recharts'
import { ChevronDown } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { AnnualCashFlow } from '@/types'
import { cn } from '@/lib/utils'
import { compactCurrencyOptions } from '@/lib/utils/numberFormat'
import { ChartTooltipCard, withAlpha } from './chartTheme'
import {
  buildCashflowSankey,
  type CashflowSankeyLink,
  type CashflowSankeyNode,
  type SankeyNodeId,
} from './cashflowSankeyModel'

/**
 * Node identity, from theme tokens only. Sources keep the hue their category
 * has elsewhere (pension green, portfolio accent, spending purple); red is
 * reserved for taxes.
 */
const NODE_COLOR: Record<SankeyNodeId, string> = {
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

const isTax = (id: SankeyNodeId) => id === 'incomeTax' || id === 'capitalGainsTax'

/**
 * A link wears its source's colour — except into a tax (always the semantic
 * red) and out of the neutral hub, where the destination is the news.
 */
function linkColor(link: CashflowSankeyLink): string {
  if (isTax(link.target)) return NODE_COLOR[link.target]
  if (link.source === 'available') return NODE_COLOR[link.target]
  return NODE_COLOR[link.source]
}

const linkKey = (link: Pick<CashflowSankeyLink, 'source' | 'target'>) =>
  `${link.source}->${link.target}`

/** Below this width the three columns and their labels cannot share a row. */
const WIDE_MIN = 620
const NODE_WIDTH = 12
/** At least one two-line label tall, so neighbouring labels never collide. */
const NODE_PADDING = 36
const LABEL_FONT = 12

export interface SankeyPeriod {
  fromAge: number
  toAge: number
  sum: boolean
}

interface CashflowSankeyProps {
  row: AnnualCashFlow
  period: SankeyPeriod
  displayReal: boolean
}

interface ActiveItem {
  key: string
  x?: number
  y?: number
}

interface SankeyNodeDatum {
  name: string
  id: SankeyNodeId
}

export function CashflowSankey({ row, period, displayReal }: CashflowSankeyProps) {
  const t = useTranslations('cashflowSankey')
  const format = useFormatter()
  const locale = useLocale()
  const model = useMemo(() => buildCashflowSankey(row), [row])
  const frameRef = useRef<HTMLDivElement>(null)
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 })
  // Remembered with the row it belongs to: a new year is a new picture, and a
  // tooltip left over from the old one would lie.
  const [hover, setHover] = useState<{ row: AnnualCashFlow; item: ActiveItem } | null>(null)
  const active = hover?.row === row ? hover.item : null
  const setActive = (item: ActiveItem | null) => setHover(item ? { row, item } : null)
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () =>
      setSize({ width: Math.floor(frame.clientWidth), height: Math.floor(frame.clientHeight) })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const money = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    })
  /**
   * Labels stay in whole euros so they match the ledger to the euro; only
   * eight-figure lifetime sums are shortened, where the digits would crowd.
   */
  const labelMoney = (value: number) =>
    value >= 10_000_000
      ? new Intl.NumberFormat(locale, compactCurrencyOptions(value, locale)).format(value)
      : money(value)
  const percent = (share: number) =>
    format.number(share, {
      style: 'percent',
      maximumFractionDigits: share > 0 && share < 0.1 ? 1 : 0,
    })
  const label = (id: SankeyNodeId) => t(`nodes.${id}`)
  const share = (value: number) => (model.totalIn > 0 ? value / model.totalIn : 0)

  const periodText = period.sum
    ? t('periodSum', { from: period.fromAge, to: period.toAge })
    : t('periodAge', { age: period.fromAge })
  const unitText = t(displayReal ? 'unitReal' : 'unitNominal')

  const sources = model.nodes.filter((node) => node.column === 0 && node.id !== 'shortfall')
  const terminals = model.nodes.filter(
    (node) => !model.links.some((link) => link.source === node.id)
  )
  const summary = (() => {
    if (model.totalIn <= 0) return t('summaryEmpty')
    const phrase = (id: string, value: number) => t(`phrases.${id}`, { amount: money(value) })
    const uses = terminals
      .filter((node) => !isTax(node.id))
      .map((node) => phrase(node.id, node.value - (node.unfunded ?? 0)))
    if (model.taxes > 0) uses.push(phrase('taxes', model.taxes))
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
    const gap = model.nodes.find((node) => node.id === 'shortfall')
    return gap ? `${text} ${t('summaryUnfunded', { amount: money(gap.value) })}` : text
  })()

  const wide = width >= WIDE_MIN

  return (
    <figure className="mt-5 rounded-lg border border-border p-4" data-testid="cashflow-sankey">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="font-semibold">{t('title')}</h3>
        <button
          type="button"
          className="workspace-text-button text-sm"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((value) => !value)}
          data-testid="cashflow-sankey-table-toggle"
        >
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn(
              'transition-transform motion-reduce:transition-none',
              showTable && 'rotate-180'
            )}
          />
          {t(showTable ? 'hideTable' : 'showTable')}
        </button>
      </div>
      <figcaption
        className="mt-1 text-xs leading-relaxed text-muted-foreground"
        data-testid="cashflow-sankey-caption"
      >
        {t('caption', { period: periodText, unit: unitText })}
      </figcaption>
      <p className="mt-3 max-w-4xl text-sm leading-relaxed" data-testid="cashflow-sankey-summary">
        {summary}
      </p>
      <div
        ref={frameRef}
        role="img"
        aria-label={summary}
        className="relative mt-4 w-full"
        data-layout={wide ? 'sankey' : 'stacked'}
        onMouseLeave={() => setActive(null)}
      >
        {width > 0 &&
          (wide ? (
            <SankeyDiagram
              width={width}
              model={model}
              label={label}
              labelMoney={labelMoney}
              active={active}
              onActivate={setActive}
            />
          ) : (
            <StackedFlows
              inNodes={model.nodes.filter((node) => node.column === 0)}
              outNodes={terminals}
              total={model.totalIn}
              label={label}
              money={money}
              percent={percent}
              share={share}
              t={t}
            />
          ))}
        {wide && active?.x !== undefined && active.y !== undefined && (
          <div
            className="pointer-events-none absolute z-10"
            style={{
              left: active.x,
              top: active.y,
              // Flip towards the middle so the card never leaves the frame.
              transform: `translate(${active.x > width / 2 ? 'calc(-100% - 14px)' : '14px'}, ${
                active.y > height * 0.7 ? '-100%' : active.y < height * 0.3 ? '0%' : '-50%'
              })`,
            }}
          >
            <SankeyTooltip
              activeKey={active.key}
              nodes={model.nodes}
              links={model.links}
              label={label}
              money={money}
              percent={percent}
              share={share}
              t={t}
            />
          </div>
        )}
      </div>
      {/* Disclosure region: always in the DOM so the toggle's aria-controls
          resolves; the table itself is only built while it is shown. */}
      <div className="mt-4 overflow-x-auto" id={tableId} hidden={!showTable}>
        {showTable && (
          <table className="min-w-full text-sm tabular-nums" data-testid="cashflow-sankey-table">
            <caption className="mb-2 text-left text-xs text-muted-foreground">
              {t('tableCaption', { period: periodText, unit: unitText })}
            </caption>
            <thead>
              <tr className="text-left">
                <th scope="col" className="p-2">
                  {t('from')}
                </th>
                <th scope="col" className="p-2">
                  {t('to')}
                </th>
                <th scope="col" className="p-2 text-right">
                  {t('amount')}
                </th>
                <th scope="col" className="p-2 text-right">
                  {t('share')}
                </th>
              </tr>
            </thead>
            <tbody>
              {model.links.map((link) => (
                <tr
                  key={linkKey(link)}
                  className={cn(
                    'border-t border-border',
                    active?.key === linkKey(link) && 'bg-muted'
                  )}
                  onMouseEnter={() => setActive({ key: linkKey(link) })}
                  onMouseLeave={() => setActive(null)}
                >
                  <th scope="row" className="p-2 text-left font-medium">
                    <span className="inline-flex items-center gap-2">
                      <Swatch color={linkColor(link)} />
                      {label(link.source)}
                    </span>
                  </th>
                  <td className="p-2">{label(link.target)}</td>
                  <td className="whitespace-nowrap p-2 text-right">{money(link.value)}</td>
                  <td className="whitespace-nowrap p-2 text-right">{percent(share(link.value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </figure>
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

type Translate = ReturnType<typeof useTranslations>

interface DiagramProps {
  width: number
  model: ReturnType<typeof buildCashflowSankey>
  label: (id: SankeyNodeId) => string
  labelMoney: (value: number) => string
  active: ActiveItem | null
  onActivate: (item: ActiveItem | null) => void
}

/** Rough text width for the chart's label font; enough to reserve margins. */
const textWidth = (text: string, bold = false) =>
  Math.ceil(text.length * LABEL_FONT * (bold ? 0.64 : 0.58))

function SankeyDiagram({ width, model, label, labelMoney, active, onActivate }: DiagramProps) {
  const columns = [0, 1, 2].map((column) => model.nodes.filter((n) => n.column === column))
  const tallest = Math.max(...columns.map((nodes) => nodes.length), 1)
  // Enough room per node for its two-line label; a one-flow working year
  // should not be drawn as a wall.
  const height = Math.round(Math.min(480, Math.max(190, 72 + tallest * 74)))

  const labelSpace = (nodes: CashflowSankeyNode[]) =>
    Math.max(
      72,
      ...nodes.map((node) =>
        Math.max(textWidth(label(node.id), true), textWidth(labelMoney(node.value)))
      )
    ) + 20
  // Sinks sit on the right unless nothing passes through the hub (a year that
  // is all unfunded gap), when they are the second of two columns.
  const hasHub = columns[1].some((node) => node.id === 'available')
  const rightNodes = hasHub ? columns[2] : [...columns[1], ...columns[2]]
  const margin = {
    top: 18,
    bottom: 18,
    left: Math.min(Math.round(width * 0.3), labelSpace(columns[0])),
    right: Math.min(Math.round(width * 0.3), labelSpace(rightNodes)),
  }

  const data = useMemo(() => {
    const index = new Map(model.nodes.map((node, i) => [node.id, i]))
    return {
      nodes: model.nodes.map<SankeyNodeDatum>((node) => ({ id: node.id, name: label(node.id) })),
      links: model.links.map((link) => ({
        source: index.get(link.source)!,
        target: index.get(link.target)!,
        value: link.value,
      })),
    }
  }, [model, label])

  const activeLinkKeys = useMemo(() => {
    if (!active) return null
    if (active.key.includes('->')) return new Set([active.key])
    return new Set(
      model.links
        .filter((link) => link.source === active.key || link.target === active.key)
        .map(linkKey)
    )
  }, [active, model.links])

  const valueOf = new Map(model.nodes.map((node) => [node.id, node.value]))

  const renderNode = (props: {
    x: number
    y: number
    width: number
    height: number
    payload: unknown
  }): ReactNode => {
    const { x, y, width: nodeWidth } = props
    // Recharts hands back our node datum, extended with its layout fields.
    const payload = props.payload as SankeyNodeDatum
    const id = payload.id
    const nodeHeight = Math.max(3, props.height)
    const top = props.height < 3 ? y - (3 - props.height) / 2 : y
    const centerY = top + nodeHeight / 2
    const side: 'left' | 'right' | 'middle' =
      x <= margin.left + 1 ? 'left' : x + nodeWidth >= width - margin.right - 1 ? 'right' : 'middle'
    const textX = side === 'left' ? x - 8 : x + nodeWidth + 8
    const anchor = side === 'left' ? 'end' : 'start'
    const dimmed = activeLinkKeys !== null && active?.key !== id && !isConnected(id)
    const halo =
      side === 'middle'
        ? { stroke: 'var(--surface)', strokeWidth: 4, paintOrder: 'stroke' as const }
        : {}
    return (
      <g
        data-node={id}
        opacity={dimmed ? 0.45 : 1}
        onMouseEnter={() => onActivate({ key: id, x: x + nodeWidth, y: centerY })}
        onMouseLeave={() => onActivate(null)}
      >
        <rect x={x} y={top} width={nodeWidth} height={nodeHeight} rx={2} fill={NODE_COLOR[id]} />
        {/* Wider hit area than the 12px bar. */}
        <rect
          x={x - 6}
          y={top - 4}
          width={nodeWidth + 12}
          height={nodeHeight + 8}
          fill="transparent"
        />
        <text
          x={textX}
          y={centerY - 2}
          textAnchor={anchor}
          fontSize={LABEL_FONT}
          fontWeight={600}
          fill="hsl(var(--foreground))"
          strokeLinejoin="round"
          {...halo}
        >
          {payload.name}
        </text>
        <text
          x={textX}
          y={centerY + 13}
          textAnchor={anchor}
          fontSize={LABEL_FONT}
          fill="hsl(var(--muted-foreground))"
          className="tabular-nums"
          strokeLinejoin="round"
          {...halo}
        >
          {labelMoney(valueOf.get(id) ?? 0)}
        </text>
      </g>
    )
  }

  function isConnected(id: SankeyNodeId) {
    if (!activeLinkKeys) return true
    for (const key of activeLinkKeys) {
      const [source, target] = key.split('->')
      if (source === id || target === id) return true
    }
    return false
  }

  const renderLink = (props: {
    sourceX: number
    targetX: number
    sourceY: number
    targetY: number
    sourceControlX: number
    targetControlX: number
    linkWidth: number
    index: number
  }) => {
    const link = model.links[props.index]
    const key = linkKey(link)
    const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX } = props
    const emphasis = activeLinkKeys === null ? 'rest' : activeLinkKeys.has(key) ? 'on' : 'off'
    const gap = link.source === 'shortfall'
    return (
      <path
        data-link={key}
        d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none"
        stroke={linkColor(link)}
        strokeWidth={Math.max(1.5, props.linkWidth)}
        strokeOpacity={emphasis === 'on' ? 0.62 : emphasis === 'off' ? 0.12 : 0.34}
        strokeDasharray={gap ? '6 4' : undefined}
        onMouseEnter={() =>
          onActivate({ key, x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 })
        }
        onMouseLeave={() => onActivate(null)}
        style={{ transition: 'stroke-opacity 120ms ease' }}
      />
    )
  }

  return (
    <Sankey
      width={width}
      height={height}
      data={data}
      margin={margin}
      nodeWidth={NODE_WIDTH}
      nodePadding={NODE_PADDING}
      linkCurvature={0.5}
      iterations={48}
      sort={false}
      align="left"
      node={renderNode}
      link={renderLink}
    />
  )
}

interface StackedProps {
  inNodes: CashflowSankeyNode[]
  outNodes: CashflowSankeyNode[]
  total: number
  label: (id: SankeyNodeId) => string
  money: (value: number) => string
  percent: (share: number) => string
  share: (value: number) => number
  t: Translate
}

/**
 * The phone layout: the same nodes as two proportional bars — what comes in,
 * what goes out — each with its own labelled rows. Three columns of labels do
 * not fit in 360 px; two stacked bars do, without sideways scrolling.
 */
function StackedFlows({ inNodes, outNodes, total, label, money, percent, share, t }: StackedProps) {
  const groups = [
    { key: 'in', title: t('moneyIn'), nodes: inNodes },
    { key: 'out', title: t('moneyOut'), nodes: outNodes },
  ]
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.key} data-testid={`cashflow-sankey-${group.key}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm font-semibold">
            <span>{group.title}</span>
            <span className="tabular-nums">{money(total)}</span>
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
                  backgroundColor: NODE_COLOR[node.id],
                  opacity: node.id === 'shortfall' ? 0.7 : 1,
                }}
              />
            ))}
          </div>
          <ul className="mt-2 divide-y divide-border">
            {group.nodes.map((node) => (
              <li key={node.id} className="flex items-baseline gap-2 py-1.5 text-sm">
                <span className="translate-y-[1px]">
                  <Swatch color={NODE_COLOR[node.id]} dashed={node.id === 'shortfall'} />
                </span>
                <span className="min-w-0 flex-1">
                  {label(node.id)}
                  {node.unfunded !== undefined && (
                    <span className="block text-xs text-muted-foreground">
                      {t('unfundedPart')}: {money(node.unfunded)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right tabular-nums">{money(node.value)}</span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {percent(share(node.value))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

interface TooltipProps {
  activeKey: string
  nodes: CashflowSankeyNode[]
  links: CashflowSankeyLink[]
  label: (id: SankeyNodeId) => string
  money: (value: number) => string
  percent: (share: number) => string
  share: (value: number) => number
  t: Translate
}

function SankeyTooltip({ activeKey, nodes, links, label, money, percent, share, t }: TooltipProps) {
  const link = links.find((entry) => linkKey(entry) === activeKey)
  if (link) {
    return (
      <ChartTooltipCard
        title={`${label(link.source)} → ${label(link.target)}`}
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
  const node = nodes.find((entry) => entry.id === activeKey)
  if (!node) return null
  return (
    <ChartTooltipCard
      title={label(node.id)}
      rows={[
        {
          key: 'amount',
          label: t('amount'),
          value: money(node.value),
          color: NODE_COLOR[node.id],
          kind: 'band',
          emphasis: true,
        },
        { key: 'share', label: t('share'), value: percent(share(node.value)) },
        ...(node.unfunded !== undefined
          ? [{ key: 'unfunded', label: t('unfundedPart'), value: money(node.unfunded) }]
          : []),
      ]}
    />
  )
}
