import type {
  CashflowSankeyLink,
  CashflowSankeyModel,
  CashflowSankeyNode,
  SankeyColumn,
  SankeyGroup,
} from './cashflowSankeyModel'

/**
 * Where every node, label and link of the cash-flow Sankey goes.
 *
 * A small purpose-built layout rather than a general Sankey solver, because the
 * graph always has the same shape (sources → taxes/hub → uses) and what makes
 * it readable is label room, not link relaxation:
 *
 * - every node owns a vertical *slot* at least as tall as its label block, so
 *   labels in a column can never overlap — the height grows with the number of
 *   visible nodes instead of squeezing them;
 * - source labels sit left of their bars, use labels right of theirs, and the
 *   middle column's labels (taxes, "available after tax") sit *above* their
 *   bars, clamped to the space between the outer columns — so a long middle
 *   label can no longer run into the right-hand nodes on a narrow page;
 * - names that do not fit are truncated with an ellipsis (the tooltip and the
 *   accessible name keep the full text);
 * - an expanded category gets a one-line caption above its items.
 *
 * Pure and deterministic, so the no-overlap rules are unit-tested.
 */

export const NODE_WIDTH = 12
export const LABEL_GAP = 8
const PAD_Y = 8
/** Between categories in a column. */
const GROUP_GAP = 14
/** Between the items of one expanded category. */
const ITEM_GAP = 5
/** Two lines: name (12px, bold) and amount. */
export const CATEGORY_LABEL_HEIGHT = 32
/** Two lines: name (12px) and amount (11px). */
export const ITEM_LABEL_HEIGHT = 30
export const CAPTION_HEIGHT = 22
/** Beside a caption: the collapse chevron. */
const CHEVRON_ROOM = 14
/** Pixels the tallest column's bars get before labels ask for more. */
const BAR_BUDGET = 200
const MIN_HEIGHT = 176
const MAX_HEIGHT = 1400
const MIN_BAR = 2

export type LabelWeight = 'bold' | 'normal'
export type Measure = (text: string, weight: LabelWeight, size: number) => number

/** Rough width for the chart's 12px label font, for tests and before fonts load. */
export const estimateTextWidth: Measure = (text, weight, size) =>
  Math.ceil(text.length * size * (weight === 'bold' ? 0.62 : 0.56))

export interface LayoutText {
  /** Display name of a node (category label or flow name). */
  name: (node: CashflowSankeyNode) => string
  /** Its amount as shown. */
  amount: (node: CashflowSankeyNode) => string
  /** An expanded category's caption: its name and total (dropped first when tight). */
  caption: (group: SankeyGroup) => { name: string; amount: string }
  /** Nodes that carry an "expand" marker beside their name. */
  marker?: (node: CashflowSankeyNode) => boolean
}

/** Room the expand marker ("+") takes beside a name. */
export const MARKER_WIDTH = 13

export interface LaidOutLabel {
  side: 'left' | 'right' | 'above'
  x: number
  /** Baselines of the two lines. */
  nameY: number
  amountY: number
  anchor: 'start' | 'end' | 'middle'
  name: string
  full: string
  amount: string
  truncated: boolean
  /** Draw the expand marker: before the name on the left, after it elsewhere. */
  marker: boolean
  /** Horizontal extent, for overlap checks. */
  left: number
  right: number
  top: number
  bottom: number
}

export interface LaidOutNode {
  node: CashflowSankeyNode
  x: number
  y: number
  width: number
  height: number
  label: LaidOutLabel
}

export interface LaidOutLink {
  link: CashflowSankeyLink
  path: string
  width: number
  /** Middle of the curve, where a tooltip points. */
  midX: number
  midY: number
}

export interface LaidOutGroup {
  group: SankeyGroup
  /** Caption baseline and anchor, on the labels' side of the column. */
  x: number
  y: number
  anchor: 'start' | 'end'
  text: string
  full: string
  truncated: boolean
  /** Vertical extent of the caption and its items (for the bracket). */
  top: number
  itemsTop: number
  bottom: number
  /** x of the bracket line beside the items. */
  bracketX: number
}

export interface SankeyLayout {
  width: number
  height: number
  nodes: LaidOutNode[]
  links: LaidOutLink[]
  groups: LaidOutGroup[]
}

/** Shortens `text` to fit `max` pixels, ending in an ellipsis. */
export function truncateText(
  text: string,
  max: number,
  measure: Measure,
  weight: LabelWeight,
  size: number
): { text: string; truncated: boolean } {
  if (measure(text, weight, size) <= max) return { text, truncated: false }
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (measure(`${text.slice(0, mid).trimEnd()}…`, weight, size) <= max) low = mid
    else high = mid - 1
  }
  return { text: `${text.slice(0, Math.max(1, low)).trimEnd()}…`, truncated: true }
}

const isItem = (node: CashflowSankeyNode) => node.kind !== 'category'
const labelHeight = (node: CashflowSankeyNode) =>
  isItem(node) ? ITEM_LABEL_HEIGHT : CATEGORY_LABEL_HEIGHT
const nameSize = () => 12
const amountSize = (node: CashflowSankeyNode) => (isItem(node) ? 11 : 12)
const nameWeight = (node: CashflowSankeyNode): LabelWeight => (isItem(node) ? 'normal' : 'bold')

/** One entry in a column's stack: a node, or the caption before a group. */
type Entry =
  | { type: 'node'; node: CashflowSankeyNode; group: SankeyGroup | null }
  | { type: 'caption'; group: SankeyGroup }

export function layoutCashflowSankey(
  model: CashflowSankeyModel,
  width: number,
  text: LayoutText,
  measure: Measure = estimateTextWidth
): SankeyLayout {
  const groupOf = new Map<string, SankeyGroup>()
  for (const group of model.groups) for (const id of group.nodeIds) groupOf.set(id, group)
  const markerWidth = (node: CashflowSankeyNode) => (text.marker?.(node) ? MARKER_WIDTH : 0)
  const columns: CashflowSankeyNode[][] = [0, 1, 2].map((column) =>
    model.nodes.filter((node) => node.column === column)
  )

  // ---- Horizontal: label room left and right, the middle between. --------
  const cap = Math.round(Math.min(300, Math.max(110, width * 0.32)))
  const labelRoom = (nodes: CashflowSankeyNode[], column: SankeyColumn) => {
    const widths = nodes.map((node) =>
      Math.max(
        measure(text.name(node), nameWeight(node), nameSize()) + markerWidth(node),
        measure(text.amount(node), 'normal', amountSize(node))
      )
    )
    for (const group of model.groups) {
      if (group.column !== column) continue
      const { name, amount } = text.caption(group)
      widths.push(measure(`${name} · ${amount}`, 'bold', 12) + CHEVRON_ROOM)
    }
    return Math.min(cap, Math.max(72, ...widths) + LABEL_GAP + 4)
  }
  const left = labelRoom(columns[0], 0)
  const right = labelRoom(columns[2], 2)
  const x0 = left
  const x2 = Math.max(x0 + 2 * NODE_WIDTH, width - right - NODE_WIDTH)
  const x1 = Math.round((x0 + x2) / 2)
  const xOf = [x0, x1, x2]

  // ---- Vertical: stack each column in slots, then scale bars. ------------
  const stacks: Entry[][] = columns.map((nodes) => {
    const entries: Entry[] = []
    let current: SankeyGroup | null = null
    for (const node of nodes) {
      const group = groupOf.get(node.id) ?? null
      if (group && group !== current) entries.push({ type: 'caption', group })
      current = group
      entries.push({ type: 'node', node, group })
    }
    return entries
  })

  const gapBefore = (entries: Entry[], index: number) => {
    if (index === 0) return 0
    const previous = entries[index - 1]
    const entry = entries[index]
    if (previous.type === 'caption') return 0
    if (
      entry.type === 'node' &&
      entry.group &&
      previous.type === 'node' &&
      previous.group === entry.group
    )
      return ITEM_GAP
    return GROUP_GAP
  }
  /** Height of everything in a column that is not a bar. */
  const fixedHeight = (entries: Entry[], column: number) =>
    entries.reduce(
      (sum, entry, index) =>
        sum +
        gapBefore(entries, index) +
        (entry.type === 'caption' ? CAPTION_HEIGHT : column === 1 ? CATEGORY_LABEL_HEIGHT : 0),
      0
    )
  const minSlots = (entries: Entry[], column: number) =>
    entries.reduce(
      (sum, entry) => sum + (entry.type === 'node' && column !== 1 ? labelHeight(entry.node) : 0),
      0
    )
  const valueOf = (column: number) => columns[column].reduce((sum, node) => sum + node.value, 0)

  const heightFor = (k: number) =>
    stacks.map((entries, column) =>
      entries.reduce((sum, entry, index) => {
        const gap = gapBefore(entries, index)
        if (entry.type === 'caption') return sum + gap + CAPTION_HEIGHT
        const bar = Math.max(MIN_BAR, entry.node.value * k)
        const slot =
          column === 1 ? CATEGORY_LABEL_HEIGHT + bar : Math.max(bar, labelHeight(entry.node))
        return sum + gap + slot
      }, 0)
    )

  const fixed = stacks.map((entries, column) => fixedHeight(entries, column))
  // Labels decide the room a column needs; bars then fill it. Every column
  // gets the same scale, so the tallest column (after its own labels and gaps)
  // is what sets it.
  const labelNeed = Math.max(
    ...stacks.map((entries, column) => fixed[column] + minSlots(entries, column))
  )
  const target = Math.max(BAR_BUDGET + Math.max(...fixed), labelNeed)
  let k = Math.min(
    ...[0, 1, 2].map((column) => {
      const value = valueOf(column)
      return value > 0 ? Math.max(0, target - fixed[column]) / value : Number.POSITIVE_INFINITY
    })
  )
  if (!Number.isFinite(k)) k = 0
  // Never taller than MAX_HEIGHT: shrink the bars (labels keep their slots).
  for (let i = 0; i < 8 && Math.max(...heightFor(k)) > MAX_HEIGHT - 2 * PAD_Y; i++) k *= 0.8
  const columnHeights = heightFor(k)
  const inner = Math.max(MIN_HEIGHT - 2 * PAD_Y, ...columnHeights)
  const height = Math.round(inner + 2 * PAD_Y)

  const nodes: LaidOutNode[] = []
  const groups: LaidOutGroup[] = []
  const nodeById = new Map<string, LaidOutNode>()

  const captionTop = new Map<SankeyGroup, number>()
  stacks.forEach((entries, column) => {
    let y = PAD_Y + (inner - columnHeights[column]) / 2
    const x = xOf[column]
    entries.forEach((entry, index) => {
      y += gapBefore(entries, index)
      if (entry.type === 'caption') {
        captionTop.set(entry.group, y)
        y += CAPTION_HEIGHT
        return
      }
      const { node } = entry
      const bar = Math.max(MIN_BAR, node.value * k)
      let top: number
      let label: LaidOutLabel
      const full = text.name(node)
      const amount = text.amount(node)
      if (column === 1) {
        // Above the bar, centred, never reaching the outer columns.
        top = y + CATEGORY_LABEL_HEIGHT
        const centre = x + NODE_WIDTH / 2
        const half = Math.max(24, Math.min(centre - (x0 + NODE_WIDTH + 6), x2 - 6 - centre))
        const fitted = truncateText(full, 2 * half - markerWidth(node), measure, 'bold', 12)
        const w = Math.max(
          measure(fitted.text, 'bold', 12) + markerWidth(node),
          measure(amount, 'normal', 12)
        )
        label = {
          side: 'above',
          x: centre,
          nameY: top - 19,
          amountY: top - 5,
          anchor: 'middle',
          name: fitted.text,
          full,
          amount,
          truncated: fitted.truncated,
          marker: markerWidth(node) > 0,
          left: centre - w / 2,
          right: centre + w / 2,
          top: y,
          bottom: top,
        }
        y = top + bar
      } else {
        const slot = Math.max(bar, labelHeight(node))
        top = y + (slot - bar) / 2
        const centre = top + bar / 2
        const side = column === 0 ? 'left' : 'right'
        const room = side === 'left' ? x - LABEL_GAP - 2 : width - (x + NODE_WIDTH + LABEL_GAP) - 2
        const fitted = truncateText(
          full,
          room - markerWidth(node),
          measure,
          nameWeight(node),
          nameSize()
        )
        const w = Math.max(
          measure(fitted.text, nameWeight(node), nameSize()) + markerWidth(node),
          measure(amount, 'normal', amountSize(node))
        )
        const textX = side === 'left' ? x - LABEL_GAP : x + NODE_WIDTH + LABEL_GAP
        const half = labelHeight(node) / 2
        label = {
          side,
          x: textX,
          nameY: centre - 2,
          amountY: isItem(node) ? centre + 11 : centre + 13,
          anchor: side === 'left' ? 'end' : 'start',
          name: fitted.text,
          full,
          amount,
          truncated: fitted.truncated,
          marker: markerWidth(node) > 0,
          left: side === 'left' ? textX - w : textX,
          right: side === 'left' ? textX : textX + w,
          top: centre - half,
          bottom: centre + half,
        }
        y += slot
      }
      const laid: LaidOutNode = { node, x, y: top, width: NODE_WIDTH, height: bar, label }
      nodes.push(laid)
      nodeById.set(node.id, laid)
    })
  })

  for (const group of model.groups) {
    const members = group.nodeIds
      .map((id) => nodeById.get(id))
      .filter((node): node is LaidOutNode => node !== undefined)
    const top = captionTop.get(group)
    if (members.length === 0 || top === undefined) continue
    const x = xOf[group.column]
    const side = group.column === 0 ? 'left' : 'right'
    const room = side === 'left' ? x - LABEL_GAP - 2 : width - (x + NODE_WIDTH + LABEL_GAP) - 2
    const { name, amount } = text.caption(group)
    const full = `${name} · ${amount}`
    // The total goes first when room is short (the table and tooltip have
    // it); then the name is shortened. The chevron keeps its room.
    const fits = (value: string) => measure(value, 'bold', 12) <= room - CHEVRON_ROOM
    const fitted = fits(full)
      ? { text: full, truncated: false }
      : fits(name)
        ? { text: name, truncated: true }
        : truncateText(name, room - CHEVRON_ROOM, measure, 'bold', 12)
    groups.push({
      group,
      x: side === 'left' ? x - LABEL_GAP - CHEVRON_ROOM : x + NODE_WIDTH + LABEL_GAP + CHEVRON_ROOM,
      y: top + 15,
      anchor: side === 'left' ? 'end' : 'start',
      text: fitted.text,
      full,
      truncated: fitted.truncated,
      top,
      itemsTop: members[0].y,
      bottom: members[members.length - 1].y + members[members.length - 1].height,
      bracketX: side === 'left' ? x - 4 : x + NODE_WIDTH + 3,
    })
  }

  // ---- Links: stacked in each bar in the order of the other end. ---------
  const outgoing = new Map<string, CashflowSankeyLink[]>()
  const incoming = new Map<string, CashflowSankeyLink[]>()
  for (const link of model.links) {
    outgoing.set(link.source, [...(outgoing.get(link.source) ?? []), link])
    incoming.set(link.target, [...(incoming.get(link.target) ?? []), link])
  }
  const offsets = new Map<CashflowSankeyLink, { sy: number; ty: number }>()
  const place = (
    byNode: Map<string, CashflowSankeyLink[]>,
    end: 'source' | 'target',
    other: 'source' | 'target'
  ) => {
    for (const [id, list] of byNode) {
      const at = nodeById.get(id)
      if (!at) continue
      const total = list.reduce((sum, link) => sum + link.value, 0)
      // Links fill the bar; a bar stretched to its minimum spreads them evenly.
      const scale = total > 0 ? Math.max(at.height, total * k) / (total * k || 1) : 1
      let cursor = at.y
      const sorted = [...list].sort(
        (a, b) => (nodeById.get(a[other])?.y ?? 0) - (nodeById.get(b[other])?.y ?? 0)
      )
      for (const link of sorted) {
        const band = link.value * k * scale
        const mid = cursor + band / 2
        cursor += band
        const entry = offsets.get(link) ?? { sy: 0, ty: 0 }
        if (end === 'source') entry.sy = mid
        else entry.ty = mid
        offsets.set(link, entry)
      }
    }
  }
  place(outgoing, 'source', 'target')
  place(incoming, 'target', 'source')

  const links: LaidOutLink[] = []
  for (const link of model.links) {
    const source = nodeById.get(link.source)
    const target = nodeById.get(link.target)
    const offset = offsets.get(link)
    if (!source || !target || !offset) continue
    const sx = source.x + NODE_WIDTH
    const tx = target.x
    const mx = (sx + tx) / 2
    links.push({
      link,
      path: `M${sx},${offset.sy} C${mx},${offset.sy} ${mx},${offset.ty} ${tx},${offset.ty}`,
      width: Math.max(1.5, link.value * k),
      midX: mx,
      midY: (offset.sy + offset.ty) / 2,
    })
  }

  return { width, height, nodes, links, groups }
}
