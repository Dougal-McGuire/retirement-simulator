import type { AnnualCashFlow } from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { breakdownLedger, buildFlowTracks } from '@/lib/simulation/flowBreakdown'
import { buildDemoPlanParams } from '@/lib/plans/demoPlan'
import {
  estimateTextWidth,
  layoutCashflowSankey,
  NODE_WIDTH,
  truncateText,
  type LayoutText,
  type SankeyLayout,
} from '../cashflowSankeyLayout'
import {
  buildCashflowSankey,
  SANKEY_MIN_AMOUNT,
  type CashflowSankeyModel,
  type Expansion,
} from '../cashflowSankeyModel'

const NAMES: Record<string, string> = {
  pension: 'Renten (brutto)',
  otherIncome: 'Weitere Einnahmen (brutto)',
  oneOffIncome: 'Einmalige Einnahmen (brutto)',
  savings: 'Sparbeitrag',
  withdrawal: 'Depotentnahme (brutto)',
  shortfall: 'Nicht gedeckt',
  available: 'Verfügbar nach Steuern',
  incomeTax: 'Einkommensteuer',
  capitalGainsTax: 'Kapitalertragsteuer',
  baselineSpending: 'Laufende Ausgaben',
  scheduledExpenses: 'Geplante Sonderausgaben',
  reinvested: 'Einzahlung ins Depot',
}

const text: LayoutText = {
  name: (node) =>
    node.item?.flow?.name ?? (node.kind === 'more' ? 'Weitere (3)' : NAMES[node.category]),
  amount: (node) => `${node.rounded.toLocaleString('de-DE')} €`,
  caption: (group) => ({
    name: NAMES[group.category],
    amount: `${Math.round(group.value).toLocaleString('de-DE')} €`,
  }),
  marker: (node) => node.kind === 'category' && node.category === 'baselineSpending',
}

const overlaps = (a: { top: number; bottom: number }, b: { top: number; bottom: number }) =>
  a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5

/** Everything a reader has to be able to read: no collisions, nothing clipped. */
function expectReadable(layout: SankeyLayout) {
  const { width, nodes, groups } = layout
  const x0 = Math.min(...nodes.filter((n) => n.node.column === 0).map((n) => n.x))
  const x2 = Math.max(...nodes.filter((n) => n.node.column === 2).map((n) => n.x))
  for (const side of ['left', 'right', 'above'] as const) {
    const boxes = [
      ...nodes.filter((n) => n.label.side === side).map((n) => n.label),
      ...groups
        .filter((g) =>
          side === 'left' ? g.anchor === 'end' : side === 'right' && g.anchor === 'start'
        )
        .map((g) => ({ top: g.top, bottom: g.top + 18 })),
    ]
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)))
  }
  for (const { label } of nodes) {
    expect(label.left).toBeGreaterThanOrEqual(0)
    expect(label.right).toBeLessThanOrEqual(width)
    expect(label.top).toBeGreaterThanOrEqual(0)
    expect(label.bottom).toBeLessThanOrEqual(layout.height)
    // Middle labels stay between the outer columns' bars.
    if (label.side === 'above' && Number.isFinite(x0) && Number.isFinite(x2)) {
      expect(label.left).toBeGreaterThanOrEqual(x0 + NODE_WIDTH)
      expect(label.right).toBeLessThanOrEqual(x2)
    }
  }
  // Bars in a column never overlap each other.
  for (const column of [0, 1, 2]) {
    const bars = nodes.filter((n) => n.node.column === column)
    bars.forEach((a, i) =>
      bars
        .slice(i + 1)
        .forEach((b) =>
          expect(
            overlaps({ top: a.y, bottom: a.y + a.height }, { top: b.y, bottom: b.y + b.height })
          ).toBe(false)
        )
    )
  }
}

describe('truncateText', () => {
  it('keeps what fits and ends the rest in an ellipsis', () => {
    expect(truncateText('Urlaub', 200, estimateTextWidth, 'normal', 12)).toEqual({
      text: 'Urlaub',
      truncated: false,
    })
    const long = truncateText(
      'Private Krankenversicherung inkl. Pflegeversicherung',
      120,
      estimateTextWidth,
      'normal',
      12
    )
    expect(long.truncated).toBe(true)
    expect(long.text.endsWith('…')).toBe(true)
    expect(estimateTextWidth(long.text, 'normal', 12)).toBeLessThanOrEqual(120)
  })
})

describe('layoutCashflowSankey', () => {
  const demo = runMonteCarloSimulation({ ...buildDemoPlanParams(), simulationRuns: 120 })
  const tracks = buildFlowTracks(demo.params)
  const modelAt = (age: number, expanded: Expansion = {}): CashflowSankeyModel => {
    const series = demo.cashFlowMeans!
    const row = series[demo.ages.indexOf(age)]
    const breakdown = breakdownLedger(tracks, {
      series,
      ages: demo.ages,
      priceLevel: demo.inflationIndexP50,
      real: false,
      fromAge: age,
      toAge: age,
      row,
    })
    return buildCashflowSankey(row, SANKEY_MIN_AMOUNT, { breakdown, expanded })
  }
  const everything: Expansion = {
    pension: 'all',
    otherIncome: 'all',
    oneOffIncome: 'all',
    baselineSpending: 'all',
    scheduledExpenses: 'all',
  }

  it.each([620, 700, 760, 1040])('keeps every label readable at %ipx', (width) => {
    for (const age of [55, 62, 64, 68, 71, 85]) {
      for (const expanded of [{}, everything]) {
        expectReadable(layoutCashflowSankey(modelAt(age, expanded), width, text))
      }
    }
  })

  it('keeps the middle label clear of the right column on a narrow page', () => {
    // The old Recharts layout ran "Verfügbar nach Steuern" into "Geplante
    // Sonderausgaben" at a 700–770px column. Middle labels now sit above
    // their bars, clamped between the outer columns.
    for (const width of [620, 700, 740, 770]) {
      const layout = layoutCashflowSankey(modelAt(64), width, text)
      const hub = layout.nodes.find((n) => n.node.id === 'available')!
      const right = layout.nodes.filter((n) => n.node.column === 2)
      expect(hub.label.side).toBe('above')
      for (const sink of right) expect(hub.label.right).toBeLessThan(sink.x)
    }
  })

  it('grows with the number of visible nodes instead of squeezing them', () => {
    const collapsed = layoutCashflowSankey(modelAt(64), 900, text)
    const open = layoutCashflowSankey(modelAt(64, everything), 900, text)
    expect(open.height).toBeGreaterThan(collapsed.height)
    expect(collapsed.height).toBeGreaterThanOrEqual(176)
    // Captions head each expanded group.
    expect(open.groups.map((group) => group.group.category)).toEqual(
      expect.arrayContaining(['baselineSpending', 'scheduledExpenses'])
    )
  })

  it('truncates long names and keeps the full text', () => {
    const model = modelAt(64, { baselineSpending: 'top' })
    const long: LayoutText = {
      ...text,
      name: (node) =>
        node.kind === 'item'
          ? `${node.item?.flow?.name} – Private Krankenversicherung inkl. Pflegeversicherung`
          : text.name(node),
    }
    const layout = layoutCashflowSankey(model, 700, long)
    const item = layout.nodes.find((n) => n.node.kind === 'item')!
    expect(item.label.truncated).toBe(true)
    expect(item.label.full).toContain('Pflegeversicherung')
    expect(item.label.name.endsWith('…')).toBe(true)
  })

  it('attaches every link inside the bars it joins', () => {
    const layout = layoutCashflowSankey(modelAt(71, everything), 900, text)
    const bar = new Map(layout.nodes.map((n) => [n.node.id, n]))
    for (const { link, path } of layout.links) {
      const [, sx, sy] = /^M([\d.]+),([\d.]+)/.exec(path)!.map(Number)
      const [, tx, ty] = /([\d.]+),([\d.]+)$/.exec(path)!.map(Number)
      const source = bar.get(link.source)!
      const target = bar.get(link.target)!
      expect(sx).toBeCloseTo(source.x + NODE_WIDTH, 6)
      expect(tx).toBeCloseTo(target.x, 6)
      expect(sy).toBeGreaterThanOrEqual(source.y - 0.01)
      expect(sy).toBeLessThanOrEqual(source.y + source.height + 0.01)
      expect(ty).toBeGreaterThanOrEqual(target.y - 0.01)
      expect(ty).toBeLessThanOrEqual(target.y + target.height + 0.01)
    }
  })

  it('draws a year with nothing in it without failing', () => {
    const empty = { openingAssets: 0, investmentReturn: 0 } as AnnualCashFlow
    const layout = layoutCashflowSankey(buildCashflowSankey(empty), 700, text)
    expect(layout.nodes).toEqual([])
    expect(layout.height).toBeGreaterThanOrEqual(176)
  })
})
