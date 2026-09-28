# Geldfluss drill-down: the Sankey as the way into the flows

Status: implemented · 2026-09-28 · extends §5.3 of `2026-09-28-one-page-workspace.md`

## Why

The Geldfluss section drew one booked ledger row as a Sankey, then repeated the
same row twice more: a hidden link table ("Als Tabelle zeigen") and a
three-column ledger. None of the three could say *which* pension, *which*
expense — the engine books categories, not flows. The drill-down makes the
diagram the entry point into the plan's own items, and the diagram and its
table one thing.

## Model: `src/lib/simulation/flowBreakdown.ts`

Pure, no engine change. `buildFlowTracks(results.params)` expands every
switched-on flow once per result with `buildCashFlowSeries([flow], …)` (gross
and the flow's own tax per year, today's euros, linked or fixed).
`breakdownLedger(tracks, selection)` splits every flow category of the drawn
row into items.

| Category (Sankey node) | Members |
| --- | --- |
| `pension` | pension flows paying that year |
| `otherIncome` | recurring income flows |
| `oneOffIncome` | one-off incomes credited that year (booked age + 1, with their tax) |
| `baselineSpending` | lifetime, indexed expenses (`isBaselineExpenseFlow`) |
| `scheduledExpenses` | every other expense (windows, one-offs, fixed euros, extra growth) |
| `income` / `spending` | fallbacks for rows booked without the breakdown: all income / all expense flows |

Allocation rules:

1. **The booked total wins.** Each member is a weight; item = total × weight /
   Σ weights. Items add up to the category exactly (the last one takes the
   float remainder), so the expanded diagram balances like the overview.
   Whole euros for labels use the largest-remainder method: rounded items add
   up to the rounded category.
2. **Weights** are the flow's expected amount that year. Inflation-linked flows
   are re-priced with the median price level (`inflationIndexP50`), fixed ones
   are not; in today's euros the roles swap (linked stay, fixed shrink). Without
   `inflationIndexP50` the plan's average inflation compounds.
3. **Taxes.** A pension's tax is booked per pension (taxable share × rate), so
   its split is exact. Ordinary income is taxed jointly and split by gross — the
   engine's own rule, also exact. Untaxed income (`none`, the default) carries
   none. Where rules mix within a category (ordinary + one-fifth rule), the
   split is proportional: `taxEstimated`. No item pays more tax than it earns
   (`allocateCapped`).
4. **The baseline budget is pooled.** Under `fixedReal` it is the sum of its
   items (exact). Every other withdrawal rule scales the pool as a whole, so
   the items are proportional shares: `estimated` ("anteilig").
5. **Retirement sum**: each year is split on its own booked row, items are
   summed, then rescaled to the summed row (float noise only).
6. **Switched-off flows** (`isCashFlowEnabled`) are never members; they are
   returned in `disabled` for the "n Posten ausgeschaltet" line.
7. A category no flow explains (older results) gets one `unassigned` item and
   is not offered for expansion.

Invariants are unit-tested on the example and default plans, every year,
nominal and real, and on deterministic plans with exact expected values
(`src/lib/simulation/__tests__/flowBreakdown.test.ts`).

## Diagram: `cashflowSankeyModel.ts`, `cashflowSankeyLayout.ts`, `CashflowSankey.tsx`

- `buildCashflowSankey(row, min, { breakdown, expanded })` replaces an expanded
  category node **in place** by its item nodes (`<category>:<flow id>`), links
  and all: income items keep their tax link, spending items their share of the
  unfunded gap. At most six nodes per category: the five largest and
  "Weitere (n)" (`<category>:more`), which opens the category in full
  (`expanded[category] = 'all'`).
- Recharts' Sankey is replaced by a small purpose-built layout. Every node owns
  a slot at least as tall as its label, so labels in a column cannot overlap;
  the height grows with the visible nodes. Middle-column labels sit above their
  bars, clamped between the outer columns (fixes "Verfügbar nach Steuern"
  running into "Geplante Sonderausgaben" at a 700–770 px column). Label room is
  measured with canvas text metrics; names that do not fit end in "…" (full
  name in the tooltip and accessible name); a caption drops its total before it
  shortens its name. Unit-tested for no overlap at 620–1040 px.
- Colours stay per category; items are alternating lighter tints
  (`color-mix` with the surface), "Weitere" the lightest. A bracket and a
  caption ("Laufende Ausgaben · 74.971 € ⌄") head an expanded group; the caption
  collapses it.
- Phone (< 620 px): the stacked in/out bars and rows open the same way; the
  category row becomes a caption button, items are indented rows.

## Interaction

| Target | Click / Enter / Space |
| --- | --- |
| Category with flows (marked "+") | expand into items |
| Group caption | collapse |
| "Weitere (n)" | show every item of the category |
| Item | `openEditor({ panel: 'flows', fieldId: 'cashflow-switch-<flow id>' })` — the flow's row in the list: focused, scrolled to a third of the panel, flashed (`data-field-wrapper`) |
| Sparbeitrag, Depotentnahme, Einkommensteuer, Kapitalertragsteuer | the same targets as the old ledger ✎ links |
| "Alle Posten" / "Übersicht" (control row) | open every flow category (for every year) / close all |

- Expanded state lives in `CashflowCard` and is shared by diagram and table;
  it survives year and unit changes.
- Hover or focus on a node or link lights it and its neighbours; the matching
  table rows get `data-active`. Hovering a table row lights its node (an item
  folded into "Weitere" lights "Weitere"; an expanded category's row lights its
  items).
- Tooltip for an item: amount, share of its category, period ("Ab Alter 63 ·
  Monatlich", one-offs "Mit 62 · gutgeschrieben mit 63"), income tax
  ("anteilig" when estimated), the "anteilig" explanation, and the click hint.

## Table ("Aufstellung")

One table replaces the link table and the three-column ledger. Grouped like the
drawing: **Woher** (sources, "Zuflüsse gesamt" when more than one), **Steuern**
(the two taxes, then "Verfügbar nach Steuern" — the hub), **Wohin** (uses; "Davon
nicht gedeckt" under a partly unfunded category), **Netto** (the ledger's
balance lines: Einnahmen netto and Depotentnahme netto with "brutto − Steuern",
Ausgabenbedarf ✎, Finanzierte Ausgaben when something is unfunded, Nicht
gedeckter Betrag). Columns: Posten · Betrag · Anteil an allen Zuflüssen. A
category row is a disclosure button (`aria-expanded`) plus a ✎ to the flows
panel; open, it lists **every** item (not only the diagram's six) with period,
share of the category, tax and "anteilig". Leaf rows keep the ledger's
"<label> – in „<Panel>“ bearbeiten" buttons. The tax-total callout, shortfall
and working-year notes, the asset reconciliation, "Alle Jahre anzeigen" and the
assumptions disclosure are unchanged.

## Accessibility

- The table is the full equivalent (`caption`, `th scope=col|row|rowgroup`,
  disclosure buttons with `aria-expanded`).
- The drawing is a `role="group"` with a short label naming the keys; one tab
  stop (roving `tabindex`), arrows between nodes (Up/Down in visual order,
  Left/Right to the nearest node of the next column), Home/End. Actionable
  nodes are `role="button"` (categories with `aria-expanded`), the rest
  `role="img"`, all with "<name>, <amount> – <action>". After expand, focus
  moves to the caption; after collapse, back to the category. Links are
  `aria-hidden`.
- axe (WCAG 2.2 AA + best practice) on `#cashflow`, everything expanded, a node
  focused: 0 violations at 1366 and 390, light and dark.

## Decisions

- **Replace in place, not a fourth column**: five label columns do not fit a
  700 px docked-panel column; items take their category's slot and the caption
  keeps the grouping.
- **Split, don't simulate**: per-flow amounts come from weights applied to the
  booked category, never from a second model, so diagram and table can never
  disagree with the engine. Where the split is a share, the UI says so.
- **The table shows every item, the diagram at most six** per category: the
  drawing stays legible, the table stays complete.
- **Balance lines that only repeat a zero or a neighbour are omitted**; "Nicht
  gedeckter Betrag" always stays.
- **Deep link lands on the switch** (`cashflow-switch-<id>`), the row's first
  control, because the row itself has no id; the row flashes as a whole.
- The section's reserved height (lazy mount placeholder) is 1180 px.

## Test ids (§9.4)

New: `cashflow-table`, `cashflow-toggle-<category>`, `cashflow-expand-all`
(`data-state="open|closed"`), `cashflow-disabled-flows`; SVG nodes keep
`data-node` (items `<category>:<flow id>`, `<category>:more`), captions
`data-group`. Removed: `cashflow-sankey-table-toggle`, `cashflow-sankey-table`.
Kept: `cashflow-sankey`, `cashflow-sankey-summary`, `cashflow-sankey-note`,
`cashflow-sankey-in|out`, `cashflow-ledger`, `cashflow-year-select`,
`cashflow-unit`, `cashflow-sum-heading` (now in the table caption),
`cashflow-tax-total`.
