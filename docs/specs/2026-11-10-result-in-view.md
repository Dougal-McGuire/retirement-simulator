# The result in view: canvas, control column and dock

- **Status:** implemented · **Date:** 2026-11-10 · **Route:** `/[locale]/simulation`
- **Why:** the UX audit (`docs/reviews/2026-11-09-ux-audit.md`) measured that the result left the screen for most edits: inputs lived in three places (Annahmen cards with an edit panel, quick levers under Stellschrauben, the Entnahme section), and reaching any of them scrolled the result away. The owner's brief: make it more intuitive and elegant, *and keep the result in view at all times*.
- **Concept:** audit "Concept A" (result canvas beside one control column), with R1–R9. This document says what was built, where it deviates and what is left.
- **Supersedes:** the parts of `2026-09-28-one-page-workspace.md` about the rail, the Annahmen section, the edit panel and the quick levers. Sections, lazy mounting, render isolation, compare as a page mode and the hash-as-state rule carry over.
- **Unchanged:** data model, engine, seeds, draft semantics (`updateParams` → working copy; `savePlanDraft`, `revertPlanDraft`, `saveDraftAsNewPlan`; Cmd/Ctrl+S), plan storage and sync, URLs. `PLAN_SCHEMA_VERSION` is not touched: nothing new is persisted.

## 1. The page

```
bar (48)     plan ▾ · ● 2 Änderungen · Verwerfen · Speichern ▾      Nominal │ Heutige € · PDF · Menü
┌──────────────────────────────────────────────┬───────────────────────┐
│ canvas (scrolls with the page)               │ control column        │
│   head: rate line · facts line · fan chart   │   ▾ Zeit              │
│         change row · anchors                 │   ▸ Vermögen & Sparen │
│   Geldfluss                                  │   ▾ Einnahmen & Ausg. │
│   Entnahme (outcome)                         │   ▸ Entnahme (rule)   │
│   Wirkung                                    │   ▸ Markt & Steuern   │
└──────────────────────────────────────────────┴───────────────────────┘
dock (96)    the head's collapsed form, pinned under the bar once the head's chart has left
```

The result has two forms and one of them is always on screen: the **head** (full chart) at the top of the canvas, and the **dock** (figures and a mini chart) pinned under the bar. Every input exists once, in the **control column**, which never covers either.

### Breakpoints

| Width      | Canvas                          | Column                                                        | Dock                                                  |
| ---------- | ------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| ≥ 1680     | beside the column, ≤ 1240 wide  | permanent pane, 560 px, sticky under the bar, own scroll      | appears when < ½ of the head's chart is in view       |
| 1440–1679  | beside the column               | permanent pane, 520 px                                        | as above                                              |
| 1180–1439  | beside the column               | permanent pane, 480 px                                        | as above                                              |
| 1000–1179  | full width, less a 48 px rail   | drawer over the right side, `min(440px, 100vw − 64px)`, open  | always pinned; the drawer starts below it             |
| 761–999    | full width, less a 48 px rail   | the same drawer, folded to its rail ("« Annahmen") at first   | always pinned                                         |
| ≤ 760      | mode "Ansehen"                  | mode "Stellen", in the canvas's place                         | always pinned in both modes, 88 px in two rows        |

- The column's presentation is `usePanelMode()` (`docked` / `drawer` / `sheet`, `data-mode` on `[data-testid="edit-panel"]`). Whether it is unfolded lives in `useWorkspaceUiStore().columnOpen`; `null` means "not looked at yet", and CSS decides by width — the server HTML never says "open" (it would flash the column over a phone's canvas).
- The drawer has no scrim and makes nothing inert. **Escape** folds it and returns focus to what led into the column; from 1180 px only the focus returns.
- On phones the bar is 44 px with plan menu, € switch (short labels below 420 px) and Menü; Save and Discard sit in a row above the mode bar; the PDF export is the Menü's first item.
- The column body has `overscroll-behavior: contain`: reaching its end does not scroll the canvas.

## 2. Control column

`src/components/workspace/edit/EditPanel.tsx` — an `<aside>` named "Annahmen" with five groups (`COLUMN_GROUPS` in `src/components/plans/planSections.ts`):

| Group id  | Title (de / en)                           | Body (`id`)              | Holds                                                                       |
| --------- | ----------------------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| `person`  | Zeit / Time                               | `plan-editor-personal`   | ages, Ruhestart, horizon                                                    |
| `savings` | Vermögen & Sparen / Assets & savings      | `plan-editor-income`     | assets, annual savings, growth                                              |
| `flows`   | Einnahmen & Ausgaben / Income & spending  | `plan-editor-expenses`   | every flow; "+ Posten" at the top opens the form there                      |
| `rule`    | Entnahme / Withdrawal                     | `plan-editor-withdrawal` | the withdrawal rule and its sliders (the "cause" half of Entnahme)          |
| `market`  | Markt & Steuern / Market & taxes          | `plan-editor-market`     | market model, return, inflation, glide path, runs, taxes                    |

- A group header is a 56 px button (`aria-expanded`, `aria-controls`), sticky while its group scrolls: chevron, title, a dot while the group holds unsaved changes, and the group's key figure (what the Annahmen cards showed), e.g. `55 · 62 · 90`, `5.242 €/Mon. · 1 aus`.
- Several groups can be open. "Zeit" and "Einnahmen & Ausgaben" are open by default; a closed group does not mount its body.
- The group opened last is "linked": it is written into the hash (`#result:rule`), so a reload opens it again. Closing it takes it out.
- Adding a flow: the form folds away, the new row is scrolled into view in the column (never the window), flashed, and its switch takes focus.
- Footer: "Geführte Einrichtung" and "Auf Standard zurücksetzen". Nothing in the column saves or discards — the bar does.
- Every control is at least 44 px to the finger (the help ⓘ and row actions through enlarged hit areas).

`openEditor({ panel, fieldId })` (and `{ section: 'withdrawal' }` → group `rule`) keeps its signature: it opens the group, unfolds the drawer / switches the phone to "Stellen", scrolls the column to the field and flashes it.

## 3. Result head

`src/components/workspace/sections/ResultHead.tsx` (`#result`).

1. **Rate line:** the success rate (the one 32 px numeral), its delta against the saved plan, one sentence ("Dein Geld reicht in 95 von 100 Verläufen bis 90."), run status and Recalculate.
2. **Facts line:** lasts to · at the end (with its own delta) · first withdrawal (leads to Entnahme) · bad run (muted).
3. **Fan chart** (`FanChartCard`): median, band of 8 in 10 and of 6 in 10, markers for Ruhestart and pension start, the unit of the € switch; scale, zoom and the table of the same numbers behind one "⋯".
4. **Change row:** "Geändert:" and one chip per change.
5. **Anchors:** Geldfluss · Entnahme · Wirkung (they replace the rail).

Below 1180 px the chart leads (the dock above it carries the figures).

### Ghost

While the plan has unsaved changes the saved plan stays on the chart: a dashed median and a thin outline of its outer band (`--viz-ghost`), a "war 60" marker when Ruhestart moved, legend "jetzt" / "gespeichert", and a "gespeichert" row in the tooltip and the table.

- **Where it comes from** (`useSavedPlanResults`): every result the store receives is remembered in memory under `simulationFingerprint(params)` (six entries). The run on screen before the first edit *is* the saved plan's, so the ghost is there with the first edit at no cost. If it is missing (reload with a draft), it is computed through the worker client with the saved plan's params — same seed and run count — on the shared background queue, and only while the plan's own run is idle. Nothing is persisted.
- **The value axis holds still** (`useHeldPeak`): while dirty the scale covers the draft and the ghost and only ever grows, so an edit moves the fan, not the axis. It re-fits on save or discard.
- Deltas use the same result; a rate delta under 0.5 points reads "±0" in the neutral tone (`QUIET_DELTA_POINTS`), an end-assets delta under 500 € likewise.

### Change chips

`src/lib/simulation/draftChanges.ts` → `buildDraftChanges(saved, draft)`: one entry per plan field and per flow (switched, added, removed, terms changed), each with the patch that takes exactly that change back. Chips read "Ruhestart 60 → 62", "Erbschaft aus", "Lebensmittel 1.200 € → 1.400 €/Mon.".

- ✕ on a chip calls `updateParams(change.revert(draft))` — an ordinary edit. "Verwerfen" in the bar still drops everything (with its undo toast).
- The head shows three chips beside the column, two under the drawer, one on a phone, then "+n" (which unfolds the rest). The dock carries the same list behind "n Änderungen ▾"; the bar says "● n Änderungen".
- The row is one 44 px line whether clean or dirty; chips shorten instead of wrapping.

## 4. Dock

`src/components/workspace/ResultDock.tsx`: success rate + delta · end assets + delta · "bis 90+" · mini chart (median, outer band, ghost median, Ruhestart tick; a tap goes back to the head) · "n Änderungen ▾" · run status.

- From 1180 px one `IntersectionObserver` on the head's chart pins it once less than half of the chart is in view under the bar (no scroll handler). Below 1180 px, and in compare mode, it is always pinned.
- Every slot keeps its width (delta slots, the change slot), so nothing moves when the plan turns dirty.
- It sheds by its **own** width (a container query, since beside the column it is narrower than the viewport): under 900 px the change label abbreviates ("3 Änd."), under 840 px "bis …" and the quiet Recalculate go (Recalculate returns, in the mini chart's place, when results are out of date).
- The figures in view carry the canonical test ids (§8).

## 5. Canvas sections

| Section       | Content                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `#cashflow`   | Geldfluss, unchanged (Sankey and Aufstellung; ✎ labels and diagram items lead to the row in the column)             |
| `#withdrawal` | Entnahme, the **outcome**: four readouts, the spending corridor, the four-rule comparison; names the rule in force  |
| `#levers`     | Wirkung: measured levers, uncertain items, recommendations                                                          |

Removed: the Annahmen card grid, the rail and the brand in it, the quick-lever sliders and "more sliders", the head's compare entry and the life-stage strip.

**Background measurements** (levers, uncertain items, the ghost's fallback run) share one queue (`src/lib/simulation/backgroundQueue.ts`) and gate on idleness: the list is near the viewport, nothing is running, no control of the column is held, and the shown results are the draft's and have stood for 800 ms.

## 6. Bar

48 px, one row from 761 px: plan menu · draft state ("● n Änderungen" / "✓ Plan gespeichert") · Verwerfen · **Speichern ▾** (the button saves; the caret offers "Speichern" and "Als Variante speichern …") · space · **Nominal │ Heutige €** (its one place, at every width) · **PDF** (`GenerateReportButton`, progress inside the button at constant width) · Menü (language, account, appearance). The KPIs left the bar.

## 7. Hashes

`#<target>[:<group>]` — `parseWorkspaceHash` / `formatWorkspaceHash` in `src/components/workspace/workspaceNav.ts`. The page writes English ids and reads German aliases too.

| Hash                        | Aliases                          | Does                                                                                         |
| --------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| `#result`                   | `#ergebnis`                      | top of the canvas (the head)                                                                 |
| `#assumptions`              | `#annahmen`                      | unfolds the column and focuses its title                                                     |
| `#assumptions:<group>`      | `#annahmen:zeit|regel|markt`     | opens that group, shows it, focuses its header                                               |
| `#cashflow`                 | `#geldfluss`                     | Geldfluss, under the pinned chrome                                                           |
| `#withdrawal`               | `#entnahme`                      | the Entnahme outcome, and opens the group `rule` beside it (without moving focus)            |
| `#withdrawal:rule`          | `#entnahme:regel`                | as above, and the rule's header takes the focus (on a phone: "Stellen")                      |
| `#levers`                   | `#wirkung`, `#stellschrauben`    | Wirkung                                                                                      |
| `#<section>:<group>`        |                                  | any section with any group: `person`, `savings`, `flows`, `rule`, `market`                   |
| `#compare`                  | `#vergleich`                     | plan comparison as a page mode; the column gives way, the dock stays pinned                  |

- The withdrawal rule's group is named **`rule`** (alias `regel`); `zeit` → `person`, `markt` → `market`.
- A landing holds its section in view for up to five seconds while lazy sections mount, until the reader scrolls.
- Scroll-spy replaces the hash (never pushes); `#compare` pushes one entry, and "Vergleich beenden" steps back.
- Anything else (`#main-content`, …) is not ours and changes nothing.

## 8. Test ids

**Result figures.** `success-pill`, `success-delta`, `end-assets`, `end-assets-delta`, `run-status`, `run-button` belong to the result surface in view: the head while the dock is not pinned, the dock while it is. The other surface carries the same ids with `head-` / `dock-` in front.

| Area    | Ids                                                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bar     | `result-bar` (`data-dirty`), `plan-menu-trigger`, `bar-dirty`, `bar-saved`, `command-discard`, `command-save`, `command-save-more`, `command-save-menu`, `command-save-plain`, `command-save-as-new`, `display-toggle`, `bar-report` (holds `generate-report`), `dashboard-tools` |
| Head    | `verdict`, `kpi-strip`, `fan-chart`, `fan-legend`, `fan-legend-saved`, `fan-unit`, `fan-options-trigger`, `fan-options`, `fan-table-toggle`, `fan-table`, `fan-ghost`, `fan-ghost-median`, `change-row`, `change-chip` (`data-change`), `change-revert`, `change-more`, `section-index`, `section-link-cashflow|withdrawal|levers` |
| Dock    | `result-dock` (`data-pinned`), `dock-chart`, `mini-fan`, `change-menu-trigger`, `change-menu`                                                                                                  |
| Column  | `edit-panel` (`data-mode`, `data-open`), `edit-panel-title`, `edit-panel-toggle`, `edit-<group>` (header, `aria-expanded`), `edit-<group>-changed`, `assumption-card-<group>` (the header's key figure), `setup-link`, `plan-editor-reset`, `cashflow-add-open`, `cashflow-count`, `cashflow-composer`, `withdrawal-strategy-picker`, `withdrawal-rule-effect` |
| Canvas  | `withdrawal-planner` (the outcome), `withdrawal-rule-link`, `lever-list`, `uncertain-flows`, `recommendations`                                                                                 |
| Phone   | `mode-bar`, `mode-view`, `mode-edit`                                                                                                                                                           |

**Gone:** `section-link-result`, `section-link-assumptions`, `edit-panel-done` / `-next` / `-previous` / `-scrim`, `edit-panel[data-panel]`, `quick-levers`, `more-sliders-toggle`, `advanced-params`, `levers-note`, `overview-compare`, `overview-duplicate`, `life-stage-*`, `menu-display-toggle`.

**Changed meaning:** `edit-<panel>` was the edit button of an Annahmen card and is now the group's header; `assumption-card-<panel>` was the card and is now the header's key figure; `edit-panel` was a dialog that came and went and is now always in the document.

`tests/helpers/workspace.ts` speaks this structure: `showColumn`, `showCanvas`, `openPanel(page, group)`, `closePanel`, `groupHeader`, `openSection`, `leverSlider`, `nudgeLever` (the Ruhestart slider in "Zeit"), `openSaveAsVariant`, `duplicateActivePlan`.

## 9. Tests

- `tests/result-in-view.spec.ts` — the promise itself. At 1366×890, 1024×768 and 390×844 a watcher in the page records, in the task that changes the figures, whether the head's chart or the dock is inside the viewport with nothing over its centre, for seven tasks: change Ruhestart, change an expense amount, add a pension with a start age, switch an uncertain item off, change the withdrawal rule, apply the top lever, switch nominal ↔ heutige €. Also: the ghost while dirty and gone when clean, ✕ restores the value and the rate, the held value axis, every hash of §7 (fresh loads and in place), no sideways scroll at 320, 390, 800, 1024, 1180, 1366, 1440, 1920 (clean and dirty), axe on head, dock, column and bar at 1366 and 390 in both colour schemes.
- `tests/change-chips.spec.ts` replaces `quick-access.spec.ts`. `tests/onepage.spec.ts`, `workspace.spec.ts` and the other specs were rewritten against the column; each file's header says what was deleted and why.
- `tests/perf-render.spec.ts`: when a run lands, `HeadNumbers` and `DockFigures` commit first; `HeadChart` and the sections follow in a deferred commit.
- Unit: `draftChanges.test.ts`, `workspaceNav.test.ts`, `planSections.test.ts`, `savedDelta.test.ts`, `fanGeometry.test.ts`, and `contrast.test.ts` (the ghost and the draft median against the chart surface and both bands, 3:1 in both schemes).

## 10. Deviations from the concept

1. **Compare mode** is as before: `CompareView` takes the canvas, the column is hidden and the dock stays pinned. The concept's idea of showing the difference table in the column's place was not built.
2. **Group bodies moved as they were.** The fields are the existing ones (number inputs, sliders); no steppers, no redesign of single controls.
3. **Chips are per field and per flow**, from a new diff (`draftChanges.ts`), not the comparison's aggregated rows (`planDiff.buildAssumptionRows`): a sum cannot be taken back. The "Als Variante speichern" dialog still lists the aggregated rows.
4. **The head's compare entry and the life-stage strip are gone.** Compare and Duplicate are in the plan menu; the chart's markers say when retirement and the pension start.
5. **Phones:** the PDF export is in the Menü (the bar has no room); the bar is 44 px; the dock shows run status only when results are out of date.
6. **The flow timeline** is folded into a disclosure under the list in the column.
7. **The Menü dialog** is now "Einstellungen" (the report left it).
8. **The drawer** is 440 px wide and Escape folds it. At 1000–1179 px it starts open and lies over the right part of the canvas (as specified); the dock above it shows the result.
9. **Toasts** sit at the bottom of the canvas, left of the column.

## 11. Follow-ups (not started)

From the concept, deliberately left out of this step:

- a draggable Ruhestart marker on the chart;
- editing an amount in place in a flow row;
- a plan lane under the chart;
- a "Vermögen │ Ausgaben" switch on the chart;
- a year link from the chart to Geldfluss;
- an edit history (Cmd/Ctrl+Z beyond the discard toast);
- the setup wizard as a guided mode of the column;
- the full copy pass with fixed words (e.g. the chart tooltip still says "90. Perzentil" where the legend says "8 von 10 Verläufen").

Found on the way:

- Compare: the difference table in the column's place (deviation 1).
- 1000–1179 px: the open drawer covers the right part of the canvas; reflowing the canvas beside it would show the whole chart.
- `panelForField` in `planSections.ts` has had no caller outside its test since before this change.
- About 180 translation keys were already unused before this change and were left alone, as was the `ws-levers-rec-uplift` rule.
