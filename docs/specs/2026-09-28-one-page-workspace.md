# One-page workspace: implementation spec

- **Status:** direction approved by the owner; this spec is binding for implementers
- **Date:** 2026-09-28 · **Base:** `claude/gauntlet-loop-skill-install-rs9trx` @ `67bd8a0`
- **Scope:** `/[locale]/simulation` only. The engine, store model (`simulationStore` working copy), persistence, PDF pipeline, landing page and setup wizard (`/setup`) do not change. No new npm dependencies.
- **Language:** the German UI uses informal "du". Every new string ships in `en.json` and `de.json`.

Today the workspace has four sidebar tabs (Überblick, Mein Plan, Zahlungsströme, Varianten), a plan-menu popover and a Menu dialog. The core problem is that cause and effect are separated: while you edit in "Mein Plan", the success rate is nowhere on screen. This spec replaces the tabs with one scrolling page. A sticky result bar sits on top, the page is indexed by five sections, the assumptions open in an edit panel that leaves the results visible, and plan comparison becomes a mode of the same page.

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Section ids / URL hash | Neutral English ids in both locales: `#result`, `#assumptions`, `#cashflow`, `#withdrawal`, `#levers`, plus `#compare`. An open panel is added after a colon: `#<section>:<panel>`, e.g. `#cashflow:market`. German aliases are accepted on input only (`#ergebnis`, `#annahmen`, `#geldfluss`, `#entnahme`, `#stellschrauben`, `#vergleich`). Unknown hashes (`#main-content`, `#navigation`) are ignored. |
| Panel ids | `person`, `savings`, `flows`, `market` (card and panel titles: Person & Zeitachse · Vermögen & Sparen · Einnahmen & Ausgaben · Markt & Steuern). |
| Section index | One `<nav>` instance that CSS restyles per breakpoint: **left rail** at ≥1024, **sticky chip row** under the result bar at 761–1023, **fixed bottom bar** at ≤760. The bottom bar replaces today's mobile tab bar. It has the same position and muscle memory, but its items are now anchors. |
| € display switch | Rail footer at ≥1024 (`display-toggle`) and the Menu at <1024 (`menu-display-toggle`). Only one instance is visible at a time, the same rule as today. |
| "Geführte Einrichtung" | A quiet link in the header of the Annahmen section (`setup-link`). It is removed from the Menu. |
| Edit panel | Built on the Radix Dialog already in the repo, always `modal={false}`. It is **docked** (a third grid column that narrows the page) at ≥1280, an **overlay sheet** from the right below the result bar at 761–1279, and a **bottom sheet** with a live mini result on phones. |
| Phone result bar | One sticky element with a negative sticky `top`. Its first row (plan picker) scrolls away. The KPI row (success rate, median end assets, Menü) and the draft row (when dirty) stay pinned. |
| Compare | A page mode (`#compare`, pushed onto history). The sections stay mounted but `hidden`, so their state survives, and `CompareView` renders in their place. Exit with the "Vergleich beenden" button, browser Back, or any section-index item. |
| Dedupe | One save/discard (result bar), one "try changes" place (Stellschrauben), one withdrawal surface (Entnahme), one spending chart (the corridor), one plan manager (plan menu → "Pläne verwalten"). |
| Verdict tone | Factual only: the number and what it means. No adjectives ("solide") and no traffic-light dot, in line with the consolidation that removed unsupported qualitative verdicts. The only colour on KPIs is the delta against the saved plan. |
| Motion | CSS plus a small rAF tween for numbers. Everything is disabled under `prefers-reduced-motion`. |

---

## 1. Current inventory → new home

Every visible feature and control of today's workspace is listed. *Dropped* entries give the reason. File references are relative to `src/`.

### 1.1 Shell and header

| # | Today | New home |
|---|---|---|
| 1 | Brand `WorkspaceBrand` (sidebar top) | Rail top at ≥1024. Hidden below 1024 (it is already hidden on phones). |
| 2 | Tabs `tab-overview/plan/cashflow/scenarios` (vertical sidebar; fixed bottom bar at ≤760) | `SectionIndex` with five anchors (rail / chip row / bottom bar). |
| 3 | Per-view `h1` + description (`.workspace-page-heading`), focused on tab change | A visually hidden page `h1` ("{plan} – Ruhestandsplanung"). Each section has a visible `h2` and description. Clicking an index item focuses the section `h2`. |
| 4 | `EuroDisplay` in the sidebar (`display-toggle`); a copy in the Menu at ≤600 (`menu-display-toggle`) | Rail footer at ≥1024, Menu at <1024. |
| 5 | Error alert + Retry (`.workspace-error`) | Top of `main`, above Ergebnis. Unchanged. |
| 6 | Footer disclaimer (`workspace.footer`) | After the last section. Unchanged. |
| 7 | `R` shortcut (recalculate) | Unchanged, page level. |
| 8 | Cmd/Ctrl+S (only while `PlanEditor` was mounted) | Page level, always active, registered in `ResultBar`. Calls `preventDefault()`, saves if dirty, shows toast `plans.dirty.savedToast`. |
| 9 | "Aktueller Plan" label + `PlanMenu` trigger | Result bar, plan cluster. The visual label is dropped; the accessible name ("Aktueller Plan: …") is unchanged. On phones it is the first bar row, which scrolls away. |
| 10 | Plan menu: plan list with rate/unsaved markers, New, Duplicate, Rename, "Pläne verwalten …" | Unchanged, plus a new item **"Pläne vergleichen"** (`plan-menu-compare`). "Pläne verwalten …" now opens `PlanManagerDialog`. |
| 11 | Unsaved marker, Verwerfen (`command-discard`, undo toast), Speichern (`command-save`) | Result bar draft cluster. Same testids and semantics (logic moved verbatim from `WorkspaceHeader`). |
| 12 | "Plan gespeichert" text | Result bar at ≥1280 only (today it shows from ≥1101). |
| 13 | Run status live region (`run-status`) | Result bar KPI cluster (icon; the text is visually hidden but live). |
| 14 | "Neu berechnen" (`run-button`) | Result bar KPI cluster: a quiet icon button, which becomes primary with a label when `needsRun`. On phones it renders only when `needsRun`. |
| 15 | Menü (`dashboard-tools`) | Right end of the result bar. On phones it sits in the pinned KPI row, so it is always reachable. |

### 1.2 Menu dialog (`simulation-compact/DashboardTools.tsx`)

| # | Today | New home |
|---|---|---|
| 16 | Generate Report | Menu, first control (receives focus). |
| 17 | Setup link "Einrichtungsassistent" (`setup-link`) | **Moved** to the Annahmen section header as "Geführte Einrichtung" (same testid). |
| 18–20 | `LocaleSwitcher`, `AuthMenu`, `AppearanceSwitch` | Menu. |
| 21 | € display copy | Menu, visible at <1024 only. |
| 22 | `PlanSwitcher` (switch, new, rename, duplicate, **delete**, save/revert) | **Only** in `PlanManagerDialog`, opened from plan menu → "Pläne verwalten …". Delete is available only here. |

### 1.3 Überblick (`workspace/Overview.tsx`)

| # | Today | New home |
|---|---|---|
| 23 | What-if strip (`<details>`, `whatif-strip`), draft marker `whatif-draft`, note `whatif-note` | Stellschrauben › "Schnell ausprobieren", always expanded. **Dropped:** the draft marker (the result bar shows draft state on every screen) and the disclosure itself. The note is kept as `levers-note`. |
| 24 | Four quick sliders with ↺ reset (`CompactCommandBar quickOnly`, `command-quick-row`) | Stellschrauben (`quick-levers`). Same aria labels. Reset labels are localized (today they are hard-coded English). |
| 25 | "Erweitert" → `AdvancedParamsPanel` (volatility, inflation, pension/mo, plan-to age, runs, glide checkbox, "Ganzen Plan bearbeiten") | "Weitere Regler" disclosure (`advanced-params`). **Dropped here:** the "Läufe" slider. It is a precision setting, not a what-if, and remains in the Markt & Steuern panel (`editor-simulationRuns`). "Ganzen Plan bearbeiten" becomes "Alle Marktannahmen bearbeiten", which opens panel `market`. |
| 26 | KPI strip (`kpi-strip`): Zielerreichung (`success-pill`), Reicht bis, Monatliche Depotentnahme, Vermögen am Ende + hints; outcome note | Ergebnis: verdict (`verdict`: rate, sentence, run context) plus a facts row (`kpi-strip`: the other three facts with their P10 hints). The **`success-pill` testid moves to the result bar value**. |
| 27 | Life stages (Heute, Ruhestart, Erste Rente [button], Horizont) | Ergebnis, directly below the fan chart. Every stop is a deep link to its field (§3.3). |
| 28 | Compare entry (`overview-compare`, `overview-duplicate` + `PlanNameDialog`) | End of Ergebnis. Enters compare mode. |
| 29 | Fan chart panel (`FanChartCard`: focus/full scale, zoom, reset, inspection, milestone table, legend) | Ergebnis. Internals unchanged. |
| 30 | "Planannahmen" rows (3 × edit) + "Zahlungsströme ansehen" link | Replaced by the four Annahmen cards. **Dropped:** the link, because Geldfluss is on the same page and in the index. |

### 1.4 Mein Plan (`plans/PlanEditor.tsx`, `planSections.ts`, `PlanSectionNav.tsx`)

| # | Today | New home |
|---|---|---|
| 31 | Editor header "Plan-Annahmen" + InfoTip | **Dropped.** The Annahmen section header replaces it. |
| 32 | Editor "Verwerfen" (`plan-editor-revert`) | **Dropped.** It duplicates the result bar's Verwerfen, which also offers undo. |
| 33 | "Auf Standard zurücksetzen" (`plan-editor-reset`, `plan-reset-dialog`, `plan-reset-confirm`, `plan-reset-toast`) | Annahmen section footer as a quiet destructive text button. Dialog and undo toast unchanged. |
| 34 | Section switcher (`plan-section-nav`, `plan-section-pill-*`) and persisted `displayStore.planSection` | Replaced by four cards plus the Entnahme section. **Dropped:** the persisted section. The URL hash restores an open panel on reload instead. |
| 35 | Previous/next footer (`plan-section-previous/next`) | Edit panel footer (`edit-panel-previous/next`), walking the four panels. |
| 36 | Group **Person & Zeitachse**: stats + stale note, currentAge, legalRetirementAge, retirementAge slider, timeline callout, endAge | Panel `person`. |
| 37 | Group **Einkommen & Sparen**: stats, currentAssets, annualSavings, growth, one-off pointer | Panel `savings`, retitled **Vermögen & Sparen**. The pointer becomes a button that switches to panel `flows`. |
| 38 | Group **Zahlungsströme**: stats, `CashFlowList` (timeline, groups, templates, add/edit/delete, advanced tax options) | Panel `flows`, retitled **Einnahmen & Ausgaben**. This removes the name clash with the result section. |
| 39 | Group **Markt & Regeln**: stats, model switch + historical notice, investment presets, ROI/volatility sliders, glide-path block (toggle, start/end, sparkline, bond fields), inflation presets and sliders, runs, tax block (rates, allowance, household, exemption, pension-tax details, net readout, drag readout), withdrawal pointer | Panel `market`, retitled **Markt & Steuern**. The withdrawal pointer becomes a link that closes the panel and scrolls to `#withdrawal`. |
| 40 | Group **Entnahme** (`WithdrawalPlanner`) | The Entnahme section, edited inline. |

### 1.5 Zahlungsströme tab

| # | Today | New home |
|---|---|---|
| 41 | `CashflowCard`: year select (incl. whole retirement), method text, `CashflowSankey` (diagram, caption, summary, table toggle), sum heading, three ledger columns with ✎ edit links, tax total, shortfall and working-years notes, asset reconciliation, all-years table with row selection, assumptions details | Geldfluss section. Internals unchanged; the ✎ links are retargeted to panels and fields (§3.3). |
| 42 | "Ausgabenstrategie im Detail" (`SpendingSection` → `SpendingChart` with scale/zoom/brush, tooltip incl. "Ø Bruttoentnahme / Ø Anfangsdepot", strategy explanation, "Lesart", legend note; P10/P50/P90 table + strategy note) | Merged into Entnahme (§5.4). **Dropped:** `SpendingChart`, which duplicates the corridor's band and median. Its unique pieces move to the corridor: the withdrawal-rate tooltip row, the strategy explanation, "Lesart" and the legend note. Also dropped: the P10/P50/P90 table (the corridor's table is a superset, with floor and ceiling) and the table's strategy note (same content as the strategy explanation). |

### 1.6 Varianten tab

| # | Today | New home |
|---|---|---|
| 43 | Mode switch "Änderungen ausprobieren / Gespeicherte Pläne vergleichen" (`enter-compare`) | **Dropped.** Compare is a page mode (§4). |
| 44 | `BottomStrip recommendationsOnly`: measured chips "Rente mit X", "Ausgaben −10 %", "Gleitpfad …", link "Ganzen Plan bearbeiten" | Stellschrauben › "Was am meisten bewirkt": the chip action becomes **"Übernehmen"** on each lever row. **Dropped:** the glide-path chip (it is the same action as the glide-path recommendation) and the edit link (Annahmen is on the page). |
| 45 | `ScenarioList`: baseline statement, saturation note, three levers with measured delta, "Als neuen Plan speichern" + `ScenarioPlanDialog` + created toast | Stellschrauben › "Was am meisten bewirkt". Same measurement, plus "Übernehmen". |
| 46 | `RecommendationList`: advice, uplift, impact, glide-path action with undo | Stellschrauben › "Empfehlungen". Behavior unchanged. |
| 47 | `CompareView`: plan chips, "+ Plan hinzufügen", meta, "Vergleich beenden", KPI deltas, `CompareFanChart`, diff table, "Plan-Editor öffnen" | Compare mode body. "Plan-Editor öffnen" becomes "Annahmen bearbeiten", which exits compare and scrolls to `#assumptions`. |

### 1.7 Dead code (not rendered today; deleted)

- `CompactCommandBar`'s primary row: plan `<select>`, display toggle, pill, save, run, tools.
- `BottomStrip`'s pension-bridge bar. The life stages already say the same thing.

---

## 2. Layout and responsive behavior

### 2.1 DOM skeleton (Phase 1 builds exactly this)

```tsx
<WorkspaceProvider>
  <div className="ws-page" data-mode="plan|compare" data-panel-mode="docked|overlay|sheet"
       data-panel-open={open || undefined}>
    <aside className="ws-rail">                   {/* display: contents below 1024 */}
      <WorkspaceBrand />                          {/* hidden below 1024 */}
      <SectionIndex />                            {/* <nav id="navigation" data-testid="section-index"> */}
      <div className="ws-rail-footer"><EuroDisplay /></div>   {/* hidden below 1024 */}
    </aside>
    <ResultBar />                                 {/* <header data-testid="result-bar" data-sticky-chrome="true"> */}
    <main id="main-content" className="ws-main" data-run-status={status} aria-busy={loading}>
      <h1 className="sr-only">{t('workspace.pageTitle', { plan })}</h1>
      {error && <WorkspaceError />}
      <div className="ws-sections" hidden={mode === 'compare'}>
        <ResultSection /> <AssumptionsSection /> <CashflowSection />
        <WithdrawalSection /> <LeversSection />
        <footer className="ws-footer">{t('workspace.footer')}</footer>
      </div>
      {mode === 'compare' && <CompareView onExit={exitCompare} onOpenPlanEditor={…} />}
    </main>
    <EditPanel />                                 {/* docked: grid area "panel"; overlay/sheet: portal */}
  </div>
</WorkspaceProvider>
```

- The root class is **`ws-page`**, not `retirement-workspace`. The setup wizard keeps `retirement-workspace` and all of `workspace.css`. `page.tsx` imports `./workspace.css` (plan menu, buttons, euro switch, `compare-*`) and the new `./ws-page.css`, which is scoped under `.ws-page`.
- `interface.css`: change `html body:not(:has(.retirement-workspace))` to `html body:not(:has(.retirement-workspace, .ws-page))` so the page handles its own bottom safe area.
- Sticky offsets: `useStickyOffset()` measures the pinned chrome with a `ResizeObserver` and writes two variables on `.ws-page`:
  - `--ws-bar-bottom`: the pinned bottom edge of the result bar;
  - `--ws-sticky-top`: the pinned bottom of all sticky chrome (the bar, plus the chip row at 761–1023).

  Sections use `scroll-margin-top: calc(var(--ws-sticky-top) + 16px)`. The overlay panel uses `top: var(--ws-bar-bottom)`.

### 2.2 Breakpoints

| Width | Index | Result bar | Edit panel | € switch | Brand |
|---|---|---|---|---|---|
| **≥1280** | Left rail (`--ui-rail-width` 184px), sticky, full height | One row, full labels, "Plan gespeichert" when clean | **Docked** right column, `--ui-panel-width` 400px (440px at ≥1440). The page narrows; non-modal. | Rail footer | Rail top |
| **1024–1279** | Left rail 184px | One row; Verwerfen icon-only; no "gespeichert" text | **Overlay sheet** from the right, 440px, `top` = bar bottom. A scrim covers rail and main (not the bar); rail and main are `inert`. | Rail footer | Rail top |
| **761–1023** | Sticky chip row directly below the bar | One row; KPI labels short; median-end KPI hidden **while dirty**; Verwerfen icon-only | Overlay sheet, `min(440px, 100vw − 48px)`, `top` = bar bottom (covers the chip row) | Menu | Hidden |
| **≤760** (390/320) | Fixed bottom bar, 5 items, icon + short label | Three rows in one sticky element: plan row (scrolls away) / KPI row + Menü (pinned) / draft row (pinned, only when dirty) | **Bottom sheet**, height `calc(100dvh − env(safe-area-inset-top) − 12px)`, live mini result in its header, `aria-modal`; everything else is `inert` | Menu | Hidden |

Grid (`ws-page.css`):

```css
/* ≥1024 */
.ws-page { display: grid; min-height: 100dvh;
  grid-template-columns: var(--ui-rail-width) minmax(0, 1fr) auto;
  grid-template-areas: "rail bar bar" "rail main panel"; grid-template-rows: auto 1fr; }
/* 761–1023 */
.ws-page { grid-template-columns: minmax(0, 1fr); grid-template-areas: "bar" "index" "main"; }
/* ≤760: "bar" "main"; the index is position: fixed at the bottom */
```

`.ws-main` content is centered, with `max-width: 1040px` and padding 32px (≥1024), 24px (761–1023) or 16px (≤760). The phone bottom padding reserves the bottom bar: `calc(16px + 56px + env(safe-area-inset-bottom))`. Keep `--toast-bottom: calc(66px + env(safe-area-inset-bottom))` for `body:has(.ws-page)` at ≤760.

### 2.3 Result bar composition

A single component, `src/components/workspace/ResultBar.tsx`, replaces `WorkspaceHeader.tsx`. The discard/undo toast logic moves verbatim.

Clusters (DOM order):

1. `.ws-bar-plan`: `PlanMenu` trigger. Its menu popover opens right-aligned (`right: 0; left: auto`) at ≥761.
2. `.ws-bar-kpis` (`data-testid="result-bar-kpis"`), a `<dl>`:
   - **Success rate**: label "Erfolgsquote" (short "Erfolg"), value `95,2 %` (`data-testid="success-pill"`, `data-value="95.2"`), plus a delta chip (`success-delta`) when dirty.
   - **End assets**: label "Vermögen am Ende · Median" (short "Ende · Median"), value from `formatBarEuro`: `1,99 Mio €` / `€1.99M`, `265 T€` / `€265k` (`data-testid="end-assets"`, `data-value`).
   - `run-status` icon and `run-button`.
3. `.ws-bar-draft`: marker "Ungespeichert" (long: "Ungespeicherte Änderungen" at ≥1440), Verwerfen, Speichern. Rendered only when `isDirty`, except that "Plan gespeichert" shows in this slot when clean at ≥1280.
4. `.ws-bar-menu`: `DashboardTools` trigger (`dashboard-tools`).

**Delta against the saved plan:** `savedRate = planSuccessRates[activePlanId]`. Show `results.successRate − savedRate` when `isDirty && savedRate != null && results`. Format it with `planDashboard.scenarios.deltaPoints` (`+1,3 Pkt.` / `+1.3 pts`), tone `ds-delta--ok` if > 0, `--danger` if < 0, `--neutral` ("±0") if 0. While `status === 'running'`, keep the previous delta at reduced opacity. Put this in a hook, `useSavedSuccessDelta()`, which the bar and the sheet's mini result share.

`GenerateReportButton` receives `stale ? null : results`, as today.

| Width | Layout (left → right) |
|---|---|
| ≥1280 | `[Erfolgsquote 95,2 % (+1,3 Pkt.)] │ [Vermögen am Ende · Median 1,99 Mio €] [✓][⟳] ··· [● Ungespeichert  ↶ Verwerfen  Speichern] [Basisplan ▾] [Menü]` |
| 1024–1279 | Same; Verwerfen is icon-only (the label stays as `aria-label` and `title`) |
| 761–1023 | Same; short KPI labels; while dirty the end-assets KPI is `display: none` (it is still in the Ergebnis facts); plan trigger `min-width: 120px`, truncating |
| ≤760 | Grid areas `"plan plan" "kpis menu" "draft draft"`. `position: sticky; top: calc(env(safe-area-inset-top, 0px) − 52px)` and a fixed 52px plan row, so only the plan row scrolls away. KPI values 20px (18px at ≤360). When dirty, the delta joins the short label line ("Erfolg · +1,3 Pkt.") instead of sitting beside the value, so no extra width is needed. The draft row reads `[● Ungespeichert ······ ↶ Verwerfen][Speichern]`, with the existing ≤360/≤420 collapse rules (Verwerfen icon-only at ≤360). |

The KPI x-position must not move when the plan becomes dirty (the draft cluster grows into the spacer). A test asserts this.

"Elevation on scroll": put an `IntersectionObserver` on a 1px sentinel at the top of `.ws-main`. While it is out of view, set `data-scrolled` on the bar, which applies `box-shadow: var(--shadow-bar)`.

### 2.4 Section index

`src/components/workspace/SectionIndex.tsx`. **One instance**; CSS decides its presentation.

```html
<nav id="navigation" class="ws-index" aria-label="Abschnitte" data-testid="section-index">
  <ol>
    <li><a href="#result" data-testid="section-link-result" aria-current="location">
      <ChartNoAxesCombined aria-hidden /> <span class="ws-index-label">Ergebnis</span>
      <span class="ws-index-short">Ergebnis</span></a></li>
    … assumptions (ClipboardList) · cashflow (WalletCards) · withdrawal (HandCoins) · levers (SlidersHorizontal)
  </ol>
</nav>
```

- These are plain links (Tab moves between them; no roving tabindex, no `role=tab`). The active one has `aria-current="location"`; the others have none.
- Click handling: `preventDefault()`, then `scrollToSection(id, { focus: true })`. That scrolls the section into view (smooth, or `auto` under reduced motion), sets the hash with `history.replaceState`, and focuses the section `h2` (`tabIndex=-1`, `preventScroll`). Middle-click and "open in new tab" still work through the `href`.
- In compare mode every item is still active and means "exit compare, then go to this section". No item is `aria-current`.
- Rail variant: labels, icons at 18px, and a 1px `--ui-border` track at the left with a 2px accent indicator that moves (`transform: translateY`). Chip variant: horizontal, `overflow-x: auto`, the active chip gets a 2px accent underline, and the active chip is scrolled into view (`inline: 'nearest'`). Bottom-bar variant: `.ws-index-short` labels at 12px, icons at 20px, 2px accent top border on the active item, accent label colour (as today's bar).
- Short labels: de `Ergebnis · Annahmen · Geldfluss · Entnahme · Hebel`, en `Result · Inputs · Flows · Drawdown · Levers`. They must fit 64px items at 320px.

### 2.5 Sections, anchors, hash sync, scroll-spy

| Order | Section id | h2 (de / en) | Component |
|---|---|---|---|
| 1 | `result` | Ergebnis / Result | `sections/ResultSection.tsx` |
| 2 | `assumptions` | Annahmen / Assumptions | `sections/AssumptionsSection.tsx` |
| 3 | `cashflow` | Geldfluss / Money flow | `sections/CashflowSection.tsx` |
| 4 | `withdrawal` | Entnahme / Withdrawal | `sections/WithdrawalSection.tsx` |
| 5 | `levers` | Stellschrauben / Levers | `sections/LeversSection.tsx` |

Each section is rendered through `sections/WorkspaceSection.tsx`:

```tsx
<WorkspaceSection id="levers" title={…} description={…} actions={<…/>}>{children}</WorkspaceSection>
// → <section id="levers" aria-labelledby="levers-title" class="ws-section" data-section="levers">
//     <header class="ws-section-header"><h2 id="levers-title" tabIndex={-1}>…</h2><p>…</p><div>{actions}</div></header>
//     {children}
//   </section>
```

**Pure helpers** in `src/components/workspace/workspaceNav.ts` (unit-tested):

```ts
export const WORKSPACE_SECTIONS = ['result', 'assumptions', 'cashflow', 'withdrawal', 'levers'] as const
export type WorkspaceSectionId = (typeof WORKSPACE_SECTIONS)[number]
export const HASH_ALIASES = { ergebnis: 'result', annahmen: 'assumptions', geldfluss: 'cashflow',
  entnahme: 'withdrawal', stellschrauben: 'levers', vergleich: 'compare' } as const
export type WorkspaceHash = { compare: true } | { compare: false; section: WorkspaceSectionId; panel?: AssumptionPanel }
export function parseWorkspaceHash(hash: string): WorkspaceHash | null   // null → not ours, ignore
export function formatWorkspaceHash(state: WorkspaceHash): string       // '#result', '#cashflow:market', '#compare'
export function pickActiveSection(tops: { id: WorkspaceSectionId; top: number }[],
  readingLine: number, atBottom: boolean): WorkspaceSectionId
export function scrollToElement(el: HTMLElement, opts?: { behavior?: ScrollBehavior; extraOffset?: number }): void
// scrollToElement generalizes today's scrollToPlanSection (it reads [data-sticky-chrome="true"])
```

**Rules:**

- **Load:** after hydration and once the store has hydrated, parse `location.hash`. If it names a section, scroll there instantly. If it also names a panel, open that panel (after mount, so the mode is known). `#compare` enters compare mode. With no hash (or an unknown one), start at the top.
- **Scroll-spy** (`useScrollSpy`): a passive scroll listener throttled with rAF reads the five `getBoundingClientRect().top` values. `readingLine = stickyTop + 0.3 × (innerHeight − stickyTop − bottomBarHeight)`. The active section is the last one whose top is ≤ the reading line; when scrolled to the bottom (within 2px) it is `levers`. Keep `activeSection` in a tiny zustand store (`useWorkspaceUiStore`) so only `SectionIndex` re-renders.
- **Hash writing:** on a change of active section, `history.replaceState(null, '', formatWorkspaceHash(…))`. Replace, never push, so Back leaves the page instead of stepping through sections. Suspend writes and spy updates while a programmatic scroll runs (until `scrollend`, with a 700ms fallback), while an overlay or sheet panel is open, and in compare mode.
- **Panels:** opening a panel replaces the hash with `#<activeSection>:<panel>`; closing it restores `#<activeSection>`.
- **Compare:** entering pushes `#compare`. `popstate` / `hashchange` out of `#compare` exits the mode and restores the saved `scrollY`.

---

## 3. Edit panel

### 3.1 Component and modes

- `src/components/workspace/edit/EditPanel.tsx` is Radix `Dialog.Root open={editor !== null} modal={false}`. `Dialog.Content` has `id="edit-panel"`, `data-testid="edit-panel"`, `data-mode`, `data-panel`, and `aria-labelledby` pointing at the panel title.
- The mode comes from `usePanelMode()`: `(min-width:1280px)` → `docked`, `(min-width:761px)` → `overlay`, otherwise `sheet`. If the mode changes while the panel is open, the content remounts in its new container and focus returns to the panel title.
- **Docked** (≥1280): `Content` renders **without a Portal**, as grid area `panel`: `position: sticky; top: var(--ws-sticky-top); height: calc(100dvh − var(--ws-sticky-top)); overflow: auto; overscroll-behavior: contain`, with a left hairline. No scrim, no `inert`; the page stays fully interactive and charts stay visible. **Scroll anchoring on open:** record the invoker's `getBoundingClientRect().top` before opening, then after layout call `window.scrollBy(0, newTop − oldTop)` so the card or ledger line the user clicked does not jump. Do not animate the grid width, because charts would re-measure every frame.
- **Overlay** (761–1279): Portal. `position: fixed; right: 0; top: var(--ws-bar-bottom); bottom: 0; width: var(--ui-sheet-width)` (at 761–1023, `min(440px, 100vw − 48px)`). A scrim element (`edit-panel-scrim`, `background: var(--scrim)`) covers everything below the bar, and clicking it closes the panel. Set the `inert` attribute on `.ws-rail`, `.ws-index` and `.ws-main`. **Not** on the result bar (Save, Discard, plan menu and Menu keep working) and not on the toast container. No `aria-modal`. The page can still be scrolled with the wheel under the scrim, which is intentional: you can watch charts update.
- **Sheet** (≤760): Portal. `position: fixed; inset: auto 0 0 0; height: calc(100dvh − env(safe-area-inset-top) − 12px)`, top corners with `--ui-radius`. `aria-modal="true"`; `inert` on rail, index, bar and main, but **not** on the toast container, so undo toasts such as `cashflow-template-toast` stay clickable (that is why Radix `modal` is not used). The header is sticky inside the sheet.
- Always pass `onInteractOutside={e => e.preventDefault()}` and `onFocusOutside={e => e.preventDefault()}`, so clicking the page (docked) or the result bar (overlay) never dismisses the panel. The scrim closes it explicitly.

### 3.2 Anatomy

```
┌─ header ───────────────────────────────────────────────────────────────────────────┐
│ h2 "Vermögen & Sparen" (tabIndex -1)  [edit-panel-title]      ✕ [edit-panel-close] │
│ description: planEditor.groups.<key>.description, 14px muted                       │
│ sheet mode only, mini result [edit-panel-mini-result]:                             │
│   95,2 %  (+1,3 Pkt.)  ⟳ while running (same data as the bar, AnimatedNumber)      │
├─ body (container-type: inline-size; overflow: auto) ───────────────────────────────┤
│ <PanelGroup/> for the open panel (§3.4)                                            │
├─ footer (sticky) ──────────────────────────────────────────────────────────────────┤
│ [‹ Zurück: Person & Zeitachse]  [Weiter: Einnahmen & Ausgaben ›]    [Fertig]       │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- The footer's previous/next (`edit-panel-previous|next`) walk `person → savings → flows → market` with no wrap-around and swap the content in place. `Fertig` (`edit-panel-done`) closes the panel.
- A visually hidden `aria-live="polite"` region in the panel announces "Erfolgsquote jetzt 93,1 % (−2,1 Punkte gegenüber dem gespeicherten Plan)". It fires once per settled run (1s after `status` returns to `updated`), so screen-reader users hear cause and effect.

### 3.3 Behavior, focus, deep links

API (from `useWorkspace()`, Phase 1):

```ts
type AssumptionPanel = 'person' | 'savings' | 'flows' | 'market'
type EditTarget = { panel: AssumptionPanel; fieldId?: string } | { section: 'withdrawal'; fieldId?: string }
openEditor(target: EditTarget, invoker?: HTMLElement | null): void
closeEditor(): void
editor: { panel: AssumptionPanel; fieldId?: string } | null
```

- **One panel at a time.** Opening another panel while one is open swaps the content without a close animation. The invoker updates to the new one.
- **Open → focus.** In `onOpenAutoFocus`, call `preventDefault()`, then after two animation frames:
  - if `fieldId` is set, run `focusField(fieldId, body)`;
  - otherwise focus the panel `h2`.

  `focusField` (`edit/focusField.ts`) does the following:
  1. Resolves `#fieldId` within the body.
  2. Opens any ancestor `<details>`.
  3. Focuses the element if it is focusable. Otherwise it focuses the first `[role="slider"], input, select, button, textarea` inside it (`WizardSliderField` puts the id on the Radix Slider root; the thumb carries `role=slider`).
  4. Scrolls it to about a third of the panel height by setting the scroll container's `scrollTop`. It does not call `scrollIntoView`, which would also scroll the window.
  5. Sets `data-flash` on the nearest field wrapper for 1.2s.

  If the field does not exist (for example, the glide-path sliders while the glide path is off), it falls back to the panel `h2`.
- **Escape.** It closes the panel **only when focus is inside the panel or on `document.body`**. Otherwise `onEscapeKeyDown` calls `preventDefault()`. This avoids a conflict with the hand-rolled `PlanMenu` Escape handling and with a focused chart. Radix layers inside the panel (Select, InfoTip) consume Escape first, as today.
- **Close → focus.** In `onCloseAutoFocus`, call `preventDefault()` and focus the invoker if it is still connected. Otherwise focus `[data-edit-panel="<panel>"]` (the card's button).
- **Card buttons** carry `aria-expanded={editor?.panel === id}`, `aria-controls="edit-panel"` and `data-edit-panel`.
- **Cmd/Ctrl+S** works inside the panel (page-level shortcut). The `R` recalculation shortcut is ignored inside the panel because it has `role="dialog"`, as today.

**Deep-link sources:**

| Source | Target |
|---|---|
| Annahmen card "Bearbeiten" (`edit-person/savings/flows/market`) | `{ panel }` (focus title) |
| Life stage "Heute" / "Ruhestart" / "Horizont" | `person` + `editor-currentAge` / `editor-retirementAge` / `editor-endAge` |
| Life stage "Erste geplante Rente" | `flows` |
| Ledger ✎ "Renten und weitere Einnahmen brutto" (+ income detail lines) | `flows` |
| Ledger ✎ "Steuern auf Renten und Einnahmen" | `market` + `editor-pensionTaxablePortion` (opens the pension-tax `<details>`) |
| Ledger ✎ "Sparbeitrag aus Erwerbseinkommen" | `savings` + `editor-annualSavings` |
| Ledger ✎ "Depotentnahme brutto" | `{ section: 'withdrawal' }`: scroll to `#withdrawal`, focus `withdrawal-strategy-<current>` |
| Ledger ✎ "Kapitalertragsteuer" | `market` + `editor-capitalGainsTax` |
| Ledger ✎ "Ausgabenbedarf" (+ detail lines) | `flows` |
| Savings panel one-off pointer | switch to `flows` |
| Market panel withdrawal pointer | close panel, then `{ section: 'withdrawal' }` |
| Stellschrauben "Alle Marktannahmen bearbeiten" | `market` |
| `CompareView` "Annahmen bearbeiten" | exit compare, `scrollToSection('assumptions', { focus: true })` (no panel) |
| URL `#<section>:<panel>` | that panel after scrolling to the section |

`CashflowCard` changes: its prop becomes `onEdit?: (target: EditTarget) => void`, and `LineOptions.section` becomes `edit?: EditTarget`. The sr-only suffix uses `cashflowSankey.ledger.edit` with the panel title (`planEditor.groups.<key>.title`) or the section title `workspace.sections.withdrawal.title`, e.g. "Capital gains tax – edit in “Market & taxes”".

`planSections.ts` is rewritten:

```ts
export type AssumptionPanel = 'person' | 'savings' | 'flows' | 'market'
export const ASSUMPTION_PANELS = [
  { id: 'person',  bodyId: 'plan-editor-personal', messageKey: 'personal' },
  { id: 'savings', bodyId: 'plan-editor-income',   messageKey: 'income' },
  { id: 'flows',   bodyId: 'plan-editor-expenses', messageKey: 'cashFlows' },
  { id: 'market',  bodyId: 'plan-editor-market',   messageKey: 'market' },
] as const                 // messageKey → planEditor.groups.<key>.{title,description}
export function isAssumptionPanel(v: unknown): v is AssumptionPanel
export function adjacentPanels(p: AssumptionPanel): { previous?: AssumptionPanel; next?: AssumptionPanel }
export function panelForField(fieldId: string): AssumptionPanel | 'withdrawal' | undefined
```

`panelForField` must use the **real** ids. Today's map lists the non-existent `editor-taxAllowance` and `editor-partialExemption`; that is a bug.

- `person`: `editor-currentAge|legalRetirementAge|retirementAge|endAge`
- `savings`: `editor-currentAssets|annualSavings|annualSavingsGrowthRate`
- `flows`: prefix `cashflow-`
- `market`: `editor-averageROI|roiVolatility|averageInflation|inflationVolatility|simulationRuns|capitalGainsTax|taxAllowanceAnnual|equityFundExemption|pensionTaxablePortion|pensionTaxRate|bondReturn|bondVolatility|equityAllocationStart|equityAllocationEnd`, plus prefixes `market-model-`, `glide-path`, `household-type-`, `tax-`
- `withdrawal`: prefixes `planner-`, `withdrawal-strategy-`

### 3.4 Splitting `PlanEditor` into panel contents

This is a pure move with **no input rewrites**. JSX moves verbatim; only wrapper chrome and grid breakpoint classes change.

| New file (`src/components/plans/editor/`) | Moved from `PlanEditor.tsx` |
|---|---|
| `shared.tsx` | `StatStrip`, `PresetRow`, `isClose`, `useInvalidFields()` (the old `invalidFields` / `markInvalid`), and `useEditorFormat()`: currency/percent/integer formatters plus the validation copy helpers `ageRange`, `numberRange`, `atLeast`, `notANumber`. `EditorCard` is replaced by `PanelGroupBody({ id, stats, statsStale, statsStaleNote, children })`, which renders `<section id={id} data-testid={id}>` plus stats and stale note, **without** the title header (the panel header shows the title). The stale note keeps `data-testid="${id}-stats-stale"`. |
| `PersonalGroup.tsx` | `TabsContent value="personal"` body, `ageIssues`, `retirementSliderMin`, and the `personalFieldsInvalid` stale logic |
| `SavingsGroup.tsx` | `income` body. The dashed pointer `<p>` becomes a `<button>` calling `openEditor({ panel: 'flows' })`; text `planEditor.groups.cashFlows.incomePointer` (updated copy). |
| `FlowsGroup.tsx` | `cashFlows` body, `cashFlowTemplates` memo, pension summaries |
| `MarketGroup.tsx` | `market` body, `INVESTMENT_PRESETS`, `INFLATION_PRESETS`, tax readouts. The withdrawal pointer becomes a link-button calling `closeEditor()` then `openEditor({ section: 'withdrawal' })`. |

- Inside the moved JSX, replace `sm:grid-cols-2` / `sm:grid-cols-3` with container variants `@md:grid-cols-2` / `@md:grid-cols-3`. The panel body sets `container-type: inline-size` (Tailwind v4 `@container`). This way a 400px docked panel and a 390px sheet stack one column, while a wide container gets two.
- **Delete** `PlanEditor.tsx` and `PlanSectionNav.tsx`, and remove `planSection` / `setPlanSection` / `usePlanSection` / `useSetPlanSection` from `displayStore.ts`. In the `merge` function, drop a persisted legacy `planSection` key the same way `planSectionsCollapsed` is dropped.
- `edit/panelContent.tsx` maps `AssumptionPanel → Group component`. `FlowsGroup` and `MarketGroup` may use `next/dynamic`, with a skeleton as the loading state.
- An invalid value that is still being typed is local to its group component and is discarded when the panel closes. That is acceptable: invalid values never reach the store.

### 3.5 Draft semantics (unchanged)

Every edit goes through `updateParams` into the working copy, and auto-run follows after 100ms. `isDirty` drives the draft cluster. Save calls `savePlanDraft`. Discard calls `revertPlanDraft` with the snapshot/undo toast moved verbatim from `WorkspaceHeader`. Closing the panel neither saves nor discards. There is **no** save button in the panel: one save path.

---

## 4. Compare mode

- **Entry points:**
  - Plan menu → "Pläne vergleichen" (`plan-menu-compare`). If the stored `comparisonStore.selectedIds` still contains the active plan and a challenger, keep it. Otherwise select `[active, most recently updated other]` (the same logic as today's `CompareEntry`). With a single plan, enter compare with `[active]` only; `CompareView`'s "+ Plan hinzufügen" duplicates the plan (existing behavior).
  - Ergebnis compare entry (`overview-compare`), unchanged selection logic, and `overview-duplicate` (naming dialog, then the entry appears).
  - Optional (lane B): a "Vergleichen" action in the `plan-created-toast`.
- **Enter:**
  1. `closeEditor()`.
  2. Remember `scrollY` and the invoker. For the plan-menu item, the invoker is `plan-menu-trigger`, because the menu item unmounts when the menu closes.
  3. `history.pushState(null, '', '#compare')`.
  4. Set `data-mode="compare"`; `.ws-sections` gets `hidden`, which keeps state (strategy-comparison table, chart zoom, open disclosures) and scroll position.
  5. Mount `CompareView` (via `next/dynamic`).
  6. Scroll to the top and focus the compare title. Phase 1 changes `CompareView`'s title `<span>` into `<h2 id="compare-title" tabIndex={-1}>`.
- **What the page shows:** `CompareView` as it is today (chips, add plan, meta, exit, KPI deltas, overlay fan, diff table). `.compare-header` becomes sticky at `top: var(--ws-sticky-top)`. The base is the active plan's **working copy** (existing behavior).
- **Result bar:** unchanged and fully live. KPIs describe the active plan (the comparison base). Save and discard apply to it, and switching plans re-bases the comparison (the existing `CompareView` effect keeps the active plan selected). No extra controls.
- **Section index:** visible and usable; each item exits compare and scrolls to its section. No `aria-current`.
- **Exit:**
  - "Vergleich beenden" (`compare-exit`): `history.back()` if we pushed `#compare`, otherwise `replaceState` to the previous hash.
  - Browser Back: the `popstate` handler exits.
  - Any index item.
  - "Annahmen bearbeiten".

  On exit, restore the saved `scrollY` (unless a section target was given) and return focus to the invoker if it is connected, otherwise to `#result-title`.

---

## 5. Section compositions

### 5.1 Ergebnis (`#result`), Phase 1 builds it and lane C polishes it

1. **Verdict** (`verdict`):
   - A 32px tabular numeral for the success rate.
   - Lead sentence `workspace.verdict.lead` ("der simulierten Verläufe finanzieren dein Budget und dein Vermögensziel bis Alter {end}.").
   - A 12px muted run-context line from `useSimulationContext()`: `workspace.runContext.monteCarlo|historical` + " · " + "Eine Modellrechnung, keine Garantie."
2. **Facts row** (`kpi-strip`): three flat columns separated by hairlines — "Vermögen reicht im Median bis Alter" + P10 hint, "Monatliche Depotentnahme zum Ruhestart" + "Durchschnitt, brutto…", "Vermögen am Ende · Median" + P10 hint. Reuse the existing keys `lastsTo`, `badPaths`, `firstDraw`, `grossMean`, `endAssets`, `lowAssets`. The "Depotentnahme" value is a link-button to `#withdrawal`.
3. **Fan chart card:** h3 `workspace.assetTitle` plus description, then `FanChartCard` (height 330, 260 at ≤760). One surface card with no inner border.
4. **Life stages** (`life-stages`): four equally spaced stops joined by a hairline — Heute 55 → Ruhestart 60 → Erste Rente 67 → Horizont 90. Each is a `<button>` deep link (`life-stage-today|retirement|pension|horizon`).
5. **Compare entry**: a quiet full-width row at the end (`overview-compare` / `overview-duplicate`).

The skeleton (no results yet) is described in §6.6.

### 5.2 Annahmen (`#assumptions`), Phase 1

- **Header actions:** "Lieber Schritt für Schritt? **Geführte Einrichtung →**" (`setup-link`, `<Link href="/setup">`).
- A **2×2 card grid** (1 column below a container width of 640px). Each card `assumption-card-<panel>` is an `<article>` containing: an h3 title, a key figure (20px/600 tabular), two detail lines (14px muted), and a text button "Bearbeiten" (`edit-<panel>`, `aria-label` "{title} bearbeiten"). The button's `::after` stretches over the card, so the whole card is clickable. Values are **plan inputs** (today's €) and never follow the € display switch. A small footnote says so (`workspace.cards.startingValues`).

  | Card | Key figure | Detail lines |
  |---|---|---|
  | person | "Ruhestart mit 60" | "Heute 55 · geplant bis 90" / "Gesetzliche Rente ab 67" |
  | savings | "630.000 €" (label "Vermögen heute") | "48.000 € Sparbeitrag pro Jahr" / "+2 % pro Jahr · Sparquote 43 %" |
  | flows | "5.242 € pro Monat" (label "Geplantes Monatsbudget") | "1 Rente · 8 Ausgabenposten · 0 Einnahmen" / "Renten mit 67: 5.000 € brutto/Monat" |
  | market | "7 % Rendite" (historical mode: "Historische Renditen") | "Inflation 2,5 % · Schwankung ± 15 %" (historical: "1900–2024 · 125 Startjahre") / "Gleitpfad aus · Steuerlast ≈ 12 %" (drag from `results.withdrawalTaxDrag`, "—" if none) |

- An open card shows `box-shadow: inset 2px 0 0 var(--ui-accent)`.
- **Footer:** "Auf Standard zurücksetzen" (`plan-editor-reset`), a quiet button in `--danger` text, with the reset dialog and undo toast moved verbatim from `PlanEditor`.

### 5.3 Geldfluss (`#cashflow`), Phase 1 wires it and lane C flattens it

`<CashflowCard params results onEdit={openEditor} />` inside `LazyMount`. The card's own title "Wohin das Geld fließt" becomes an `h3`, and the Sankey title becomes an `h4` (lane C). Nothing else moves.

**Update (drill-down):** the link table and the three-column ledger are replaced by one "Aufstellung" grouped like the Sankey; categories open into their plan flows in both, and an item deep-links to its row in the flows panel. The ledger ✎ targets in §3.3 are kept on the table's rows (labels now match the Sankey nodes, e.g. "Kapitalertragsteuer", "Depotentnahme (brutto)", "Einkommensteuer", "Sparbeitrag"). See `2026-09-28-cashflow-drilldown.md`.

### 5.4 Entnahme (`#withdrawal`), lane A

**Merge:** `WithdrawalPlanner` + `SpendingSection`, deduped to one chart.

Hierarchy (inside `WorkspaceSection id="withdrawal"`; the body root keeps `data-testid="withdrawal-planner"`):

1. **Regel wählen** (h3): the strategy picker `withdrawal-strategy-picker`, with four option buttons (`withdrawal-strategy-*`). Keep the short option descriptions.
2. **Regel einstellen** (h3): parameters (`planner-dsWithdrawalRate`, `planner-dsCeilingRate`, `planner-dsFloorRate`, `planner-spendingFloorReal`, or the "no settings" note).
   - Directly below: **"So wirkt deine Regel"** (`withdrawal-rule-effect`), the interpolated `spendingChart.explanation.strategies.<strategy>` text (moved from `SpendingChart`).
3. **Readouts:** `withdrawal-planner-stats` (four stats, unchanged testids), rendered as a flat `dl` with hairlines instead of bordered boxes.
4. **Entnahmekorridor** (h3 `withdrawalPlanner.corridor.title` + InfoTip whose content is `spendingChart.explanation.reading`, the "Lesart"): `SpendingCorridorChart` is the **only** spending chart. Add:
   - a tooltip row `spendingChart.legend.meanWithdrawalRate` = mean gross withdrawal ÷ mean opening assets. Implementation: add `withdrawalRateMean: number | null` to `SpendingCorridorPoint` in `lib/simulation/spendingCorridor.ts`, computed from `results.cashFlowMeans[i].portfolioWithdrawal / openingAssets` (a ratio, so it is unit-independent);
   - a caption under the chart: `spendingChart.legend.note`.

   Its existing table toggle stays (a superset of the old SpendingSection table).
5. **Alle vier Regeln vergleichen** (h3): the strategy comparison, unchanged behavior and testids (`strategy-compare-*`).

**Layout:** when the section's container is ≥ 880px wide, use two columns (`5fr 7fr`): left = steps 1 and 2, right = steps 3 and 4 (cause next to effect). Step 5 spans full width. Otherwise use one column. In practice that means two columns at ≥1280 without the docked panel.

**Deletions (lane A):** `charts/SpendingSection.tsx`, `charts/SpendingChart.tsx`, `useBrushRange` in `charts/useChartData.ts` (it has no other users), and the planner's own card chrome and "Entnahmeplaner" header. Remove the planner's `id="plan-editor-withdrawal"`; the section id `withdrawal` replaces it.

### 5.5 Stellschrauben (`#levers`), lane B

**Merge:**

- `WhatIfStrip` / `CompactCommandBar` quick row + `InlineSlider`
- `AdvancedParamsPanel`
- `ScenarioList`
- `BottomStrip recommendationsOnly`
- `RecommendationList`

The order is quick sliders → what moves the needle → recommendations.

0. **Note** (`levers-note`): `workspace.whatIf.note` (+ `workspace.whatIf.pending` while dirty). No save or discard buttons in this section.
1. **Schnell ausprobieren** (h3, `quick-levers`): Renteneintrittsalter, Jährliche Sparrate, Monatliche Ausgaben, Erwartete Rendite. The logic moves **verbatim** from `CompactCommandBar` (`scaleBaseRef` / `emittedRef` spending scaling, plan-anchored ranges, per-lever reset). The layout is a 2×2 grid (1 column below a 640px container).
   - Reset button: `aria-label` / `title` = `workspace.levers.reset` ("{label} zurücksetzen" / "Reset {label}"). This fixes today's hard-coded English.
   - Below the grid: **"Weitere Regler"** toggle (`more-sliders-toggle`, `aria-expanded`) → `advanced-params`: Volatilität, Inflation, Rente /Mon., Planen bis, and the Gleitpfad checkbox (moved from `AdvancedParamsPanel`, minus "Läufe"), plus the link "Alle Marktannahmen bearbeiten" → `openEditor({ panel: 'market' })`.
2. **Was am meisten bewirkt** (h3, `lever-list`):
   - The baseline line (`stress-lever-baseline`, same copy) and the saturation note (`stress-lever-saturated`).
   - Rows `stress-lever` for `laterRetirement`, `moreSavings`, `lowerSpending`, sorted as `ScenarioList` sorts them (by delta, or by worst-decile delta when saturated). Each row contains: name + description, delta chip (`stress-lever-delta`) → resulting rate, **"Übernehmen"** (`stress-lever-apply`) and **"Als Plan speichern"** (`stress-lever-save`, same dialog and toast).
   - "Übernehmen" applies only the changed keys:

     | Lever | Keys applied |
     |---|---|
     | laterRetirement | `retirementAge` |
     | moreSavings | `annualSavings` |
     | lowerSpending | `customExpenses`, `cashFlows` |

     It shows an `ActionToast` "„{name}“ übernommen – noch nicht gespeichert" with Undo. Undo restores the previous values of those keys, only if the same plan is still active (same rule as the discard undo).
   - Measurement (`useLeverMeasurements`) reuses the `ScenarioList` effect, with a debounce of **800ms** and `enabled = nearViewport(#levers) && editor === null && !busy && resultsMatchParams`. It keeps the last measured fingerprint so it does not re-measure after being re-enabled when nothing changed. Loading rows use skeleton chips.
3. **Empfehlungen** (h3): `RecommendationList`, flattened (hairline rows). The glide-path action (`recommendation-enable-glide-path`) with undo is kept. It is the only glide-path action on the page.

**Deletions (lane B):** `CompactCommandBar.tsx`, `AdvancedParamsPanel.tsx`, `BottomStrip.tsx`, `charts/ScenarioList.tsx` (its logic moves into `workspace/levers/LeverImpactList.tsx`). `InlineSlider.tsx` is kept and restyled (inline styles become classes).

---

## 6. Visual direction: calmer, slicker, same system

### 6.1 Principles

- **Calm ledger, not a dashboard.** Numbers carry the page. Structure comes from whitespace and 1px hairlines, not boxes.
- **One surface level.** Sections sit on `--ui-bg` without card chrome. Charts, assumption cards and lever lists are the only `--ui-surface` blocks (1px `--ui-border`, `--ui-radius` 4px, no shadow). Nothing bordered sits inside something bordered.
- **Shadows only for things that float:** the result bar once scrolled, the overlay/bottom sheet, menus and dialogs.
- **Avoid:** gradients, glass or blur, emoji, coloured icon tiles, uppercase letter-spaced eyebrows (`ds-micro` stays out of the new sections), pill-shaped everything, "✨ insights" copy, pulsing loaders, adjectives in verdicts, weights above 600 (normalize `font-extrabold` / `font-black` / `font-bold` to 600 in touched files).
- The accent stays steel blue, used for the active index item, links, focus and slider ranges. Status colours (`--ok`, `--danger`, `--warn`) appear only for delta, validation and status.

### 6.2 Token additions (`src/app/interface.css`)

Add to `:root`. Colour and shadow tokens must also be added **identically** to both dark blocks; `colorScheme.test.ts` enforces that the dark blocks are identical and that dark names are a subset of light names.

```css
:root {
  /* type */
  --ui-font-lead: 16px;      /* card titles, verdict lead, panel group headings */
  --ui-font-kpi: 20px;       /* result bar + card key figures */
  --ui-font-display: 32px;   /* verdict numeral */
  /* space */
  --ui-space-10: 40px; --ui-space-12: 48px; --ui-space-16: 64px;
  /* layout (Phase 1 adds these four) */
  --ui-bar-height: 56px; --ui-rail-width: 184px; --ui-panel-width: 400px; --ui-sheet-width: 440px;
  /* motion */
  --motion-fast: 120ms; --motion-base: 200ms; --motion-slow: 280ms;
  --motion-ease: cubic-bezier(0.2, 0, 0, 1);
  /* elevation & overlays (also in BOTH dark blocks) */
  --shadow-bar: 0 1px 0 var(--ui-border), 0 8px 24px -18px rgb(15 20 27 / 0.35);
  --shadow-sheet: -16px 0 48px -24px rgb(15 20 27 / 0.35);
  --shadow-sheet-up: 0 -16px 48px -24px rgb(15 20 27 / 0.35);
  --scrim: rgb(15 20 27 / 0.18);
  --skeleton-base: var(--ui-subtle);
  --skeleton-sheen: rgb(255 255 255 / 0.6);
}
/* dark (both blocks) */
  --shadow-bar: 0 1px 0 var(--ui-border), 0 8px 24px -16px rgb(0 0 0 / 0.7);
  --shadow-sheet: -16px 0 48px -24px rgb(0 0 0 / 0.75);
  --shadow-sheet-up: 0 -16px 48px -24px rgb(0 0 0 / 0.75);
  --scrim: rgb(4 7 10 / 0.45);
  --skeleton-sheen: rgb(227 232 238 / 0.06);
```

No new text colours are introduced. Text keeps using `--ui-text`, `--ui-muted`, `--ui-accent`, and the existing `ds-delta--*` pairs.

### 6.3 Type scale and section headers

| Role | Size / weight / line-height |
|---|---|
| Verdict numeral | `--ui-font-display` 32 / 600 / 1.15, tabular, `letter-spacing: -0.01em` |
| Section h2 | `--ui-font-title` 24 / 600 / 1.25 |
| Subsection h3 (chart titles, "Schnell ausprobieren") | `--ui-font-section` 18 / 600 / 1.3 |
| Card title, verdict lead, panel group h4 | `--ui-font-lead` 16 / 600 (lead: 400) / 1.4 |
| KPI values (bar, cards, facts) | `--ui-font-kpi` 20 / 600 / 1.2, tabular |
| Body | 14 / 400 / 1.5 |
| Labels, meta, hints | 12 / 500 (labels) or 400 (hints) / 1.4, `--ui-muted` |

**Section header treatment** ("ruled ledger"). Every section except Ergebnis starts with a full-width 1px `--ui-border` rule. The h2 sits 24px below it. The description is 14px `--ui-muted` with `max-width: 64ch` and a 4px gap. Header actions are right-aligned on the h2 baseline. There is 24px from the header to the content. Section gap: `--ui-space-16` at ≥1024, `--ui-space-12` at 761–1023, `--ui-space-10` at ≤760.

### 6.4 Spacing rhythm and flattening

- An 8px grid. Card padding is 24px (16px at ≤760). Card grid gap is 16px (12px on phones). Subsections within a section are 32px apart.
- Replace these offenders (each by the lane that owns the file):
  - `StatStrip` boxes (`rounded-sm border-2 bg-background`) become a plain `dl` with a hairline between columns.
  - Glide-path and tax blocks (`border-2 bg-background` boxes) become subsections with an h4 and a hairline top.
  - `<details>` with borders become a text summary with a chevron and no border.
  - `WithdrawalPlanner` and `RecommendationList` inner boxes and bordered `li`: the planner's inner boxes become hairline rows, and recommendation items become hairline rows inside one surface.
  - `ScenarioList` card plus bordered rows become one surface with hairline rows.
  - `CashflowCard`: `ds-card` inside the section loses its border; the ledger columns become three columns split by hairlines; the Sankey figure border goes; the details lose their borders.
  - `FanChartCard` `ds-card` inside the chart card is neutralized (as `.workspace-panel [data-testid='fan-chart']` does today).
- Status callouts (validation, stale, historical notice, tax-drag readout) become a tinted background `color-mix(in srgb, var(--warn|--danger|--ui-accent) 8%, var(--ui-surface))`, radius 4, **no border**. The `.workspace-content .border-2` hack is not carried over.

### 6.5 Result bar look and number transitions

- Background `--ui-surface`, height `--ui-bar-height`, padding `0 24px` (16px on phones), bottom hairline. With `data-scrolled`, apply `box-shadow: var(--shadow-bar)` with a 200ms transition.
- Each KPI is stacked: label (12px muted) above value (20px/600, tabular). Reserve widths (`min-inline-size: 6.5ch` for the rate, `8ch` for end assets) so the bar never jitters. KPIs are separated by a 1px × 24px `--ui-border` rule. The delta chip is the existing `ds-delta` style, set 6px from the rate.
- **`AnimatedNumber`** (`src/components/workspace/AnimatedNumber.tsx`, lane C). Props: `value`, `format`, and `durationMs` (default 240). It tweens from the currently displayed value with an ease-out cubic curve and is interruptible. It renders an `aria-hidden` animated span plus an `sr-only` final value, and sets `data-value={value}` for tests. Use it in the bar, the sheet mini result and the verdict numeral.
- While `status === 'running'`, values sit at 55% opacity for `--motion-base`. **No pulse loop** (this replaces `workspace-pulse`). The delta chip crossfades in `--motion-fast`.

### 6.6 Panel and sheet motion, scroll-spy indicator, skeletons

- **Docked panel:** opacity 0 → 1 plus `translateX(16px → 0)`, `--motion-base`, `--motion-ease`, panel only. The page column snaps (no width animation).
- **Overlay sheet:** `translateX(100% → 0)` over `--motion-slow`; the scrim fades over `--motion-base`. Closing takes 180ms. Shadow `--shadow-sheet`; background `--surface-raised`.
- **Bottom sheet:** `translateY(100% → 0)` over `--motion-slow`; shadow `--shadow-sheet-up`. No drag handle (a handle that does nothing is a false affordance); close with "Fertig", ✕ or Escape.
- **Scroll-spy indicator:** the rail's 2px accent bar moves with `transform` over `--motion-base`. The chip underline and bottom-bar top border switch without animation.
- **Field flash** after a deep link: background `--ui-subtle` fading out over 1.2s. Under reduced motion it is a static 2px accent outline for 1.2s.
- **Skeletons** (`Skeleton.tsx`, class `ws-skeleton`): `--skeleton-base` blocks, radius 4, with a 1.2s linear sheen (`--skeleton-sheen` gradient) that becomes static under reduced motion. Placeholders:
  - result bar values (72×20);
  - verdict (32px numeral block plus two text lines at 60% and 40%);
  - facts row;
  - each lazy chart at its final height with three faint hairlines (fan 330/260, Sankey 360, corridor 320/272);
  - lever rows (3 × 56px).

  Add a visually hidden `role="status"` with `workspace.computing`. This replaces the "Berechnung läuft …" boxes.

### 6.7 `prefers-reduced-motion: reduce`

- Instant scrolling (`behavior: 'auto'`).
- No number tween (swap values).
- Panel and sheet appear with no transform, only an instant opacity change.
- No indicator slide.
- No skeleton sheen.
- No spinner rotation (existing rule).
- Field flash becomes a static outline.

Test with `page.emulateMedia({ reducedMotion: 'reduce' })`.

### 6.8 Dark mode and contrast

- Every new surface uses existing surface tokens: bar `--ui-surface`, sheet `--surface-raised`, scrim `--scrim`. The bar reads as a lifted strip against `--ui-bg` `#0e141b`.
- **New unit test (lane C)** `src/lib/__tests__/contrast.test.ts`. It parses `interface.css` (hex, `rgb(var(--*-rgb))` and `oklch()`; convert oklch through OKLab to sRGB) and asserts WCAG AA (≥4.5:1) in **both** schemes for:
  - `--ui-text`, `--ui-muted` and `--ui-accent` on `--ui-bg`, `--ui-surface`, `--ui-subtle` and `--surface-raised`;
  - `--on-action` on `--action` and `--action-hover`;
  - `--ok` on `--green-50`, `--danger` on `--red-50`, and `--warn` on `--amber-50` (the delta chips);
  - graphical ≥3:1 for `--ui-accent` against `--ui-border` neighbours (the index indicator).

  The goal is to keep 0 AA failures.

### 6.9 Wireframes

**A. Desktop ≥1280 (1440 wide), panel docked, draft state**

```
┌───────────┬─────────────────────────────────────────────────────────────────────────────────────┐
│Ruhestands-│ Erfolgsquote          Vermögen am Ende·Median       ● Ungespeichert ↶ Verwerfen     │
│planung    │ 93,1 % [−2,1 Pkt.] │  1,87 Mio €     ✓ ⟳            [Speichern]  Basisplan ▾  [Menü]│
├───────────┼──────────────────────────────────────────────┬──────────────────────────────────────┤
│           │                                              │ Vermögen & Sparen                  ✕ │
│┃ Ergebnis │  Ergebnis                                    │ Was du heute hast und bis zum        │
│  Annahmen │  93,1 %                                      │ Ruhestand zurücklegst.               │
│  Geldfluss│  der simulierten Verläufe finanzieren dein   │ ──────────────────────────────────── │
│  Entnahme │  Budget und dein Vermögensziel bis Alter 90. │ Sparquote 41 %  │ Sparrate 44.000 €  │
│  Stell-   │  Reicht bis 90+ │ Entnahme 6.227 € │ 1,87 Mio│                                      │
│  schrauben│ ┌──────────────────────────────────────────┐ │ Aktuelles Vermögen                   │
│           │ │ Vermögensentwicklung                     │ │ [ 630.000                        € ] │
│           │ │  ░░▒▒▓▓ fan chart, updates live ▓▓▒▒░░   │ │ Jährliche Sparrate                   │
│           │ └──────────────────────────────────────────┘ │ [ 44.000                         € ] │
│           │  Heute 55 ──── Ruhestart 60 ──── Rente 67 ── │ Sparratenwachstum                    │
│           │  ──────────────────────────────────────────  │ [ 2                         %/Jahr ] │
│───────────│  Annahmen              Geführte Einrichtung →│ Einmalige Einnahmen → Einnahmen & A. │
│ Nominal | │ ┌ Person & Zeitachse ┐ ┃ Vermögen & Sparen ┐ │ ──────────────────────────────────── │
│ Heutige € │ │ Ruhestart mit 60   │ ┃ 630.000 €         │ │ ‹ Person & Zeitachse  Einnahmen … ›  │
│           │ └────────────────────┘ └───────────────────┘ │                            [Fertig]  │
└───────────┴──────────────────────────────────────────────┴──────────────────────────────────────┘
```

**B. Tablet 820, overlay sheet (bar stays live, page dimmed and inert)**

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ Erfolg 93,1 % [−2,1]  ✓   ● Ungespeichert  ↶  [Speichern]  Basisplan ▾  [Menü] │  ← live
├──────────────────────────────────┬─────────────────────────────────────────────┤
│░ Ergebnis Annahmen Geldfluss … ░░│ Markt & Steuern                          ✕  │
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ Renditeannahmen und deutsche Steuern.       │
│░░ fan chart keeps redrawing ░░░░░│ Reale Rendite 4,4 % │ ± 15 % │ 500 Läufe    │
│░░░░░░░ (scrim 18 %, inert) ░░░░░░│ Marktmodell  [Monte Carlo] [Historisch]     │
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ Rendite     ─────────●──────   7,00 %       │
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ …                                           │
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ ‹ Einnahmen & Ausgaben            [Fertig]  │
└──────────────────────────────────┴─────────────────────────────────────────────┘
```

**C. Phone 390: scrolled page (left) and bottom sheet open (right)**

```
┌────────────────────────────┐    ┌────────────────────────────┐
│ (plan row scrolled away)   │    │ ░░ page, inert ░░░░░░░░░░░ │  ← 12px gap
├────────────────────────────┤    ├────────────────────────────┤
│ Erfolg·−2,1  Ende·Median   │    │ Person & Zeitachse  Fertig │
│ 93,1 %       1,87 Mio  Menü│    │ 93,1 %  [−2,1 Pkt.]  ⟳     │  ← mini result
├────────────────────────────┤    ├────────────────────────────┤
│ ● Ungespeichert ↶ Speichern│    │ Erwerbsjahre 5 │ Ruhe 30   │
├────────────────────────────┤    │ Aktuelles Alter            │
│ ─────────────────────────  │    │ [ 55                     ] │
│ Annahmen                   │    │ Gesetzliches Rentenalter   │
│ ┌────────────────────────┐ │    │ [ 67                     ] │
│ │ Person & Zeitachse     │ │    │ Geplanter Ruhestart        │
│ │ Ruhestart mit 60       │ │    │ ─────────●────────  60     │
│ │ Heute 55 · bis 90   →  │ │    │ …                          │
│ └────────────────────────┘ │    │ ‹ Zurück        Weiter ›   │
├────────────────────────────┤    └────────────────────────────┘
│ Ergebnis Annahmen Geldfl.… │
└────────────────────────────┘
```

---

## 7. Performance

- **Lazy charts:** `LazyMount` (`src/components/workspace/LazyMount.tsx`) uses `useNearViewport(ref, '800px 0px')`, an `IntersectionObserver` that stays true once intersected (mount once, never unmount). Until then it renders a skeleton at the chart's reserved `minHeight`. Wrap:
  - `FanChartCard` (effectively immediate unless the page loads on a deep hash);
  - `CashflowCard` (Sankey plus ledger);
  - the corridor chart;
  - the lever list's measurement consumer.

  Browser scroll anchoring (`overflow-anchor: auto`, the default) absorbs any height difference above the viewport. Placeholders set `data-lazy-state="pending|mounted"` for tests.
- **Code splitting:** use `next/dynamic` (`ssr: false`) for `CompareView`, `PlanManagerDialog`, and the `FlowsGroup` / `MarketGroup` panel contents.
- **Auto-run is unchanged:** 100ms debounce, `useRunStatus` holds "running" for at least 400ms, and the store's stale-request guard stays.
- **Worker contention (important).** `runSimulationInClient` uses **one** shared worker with FIFO messages. On one page, extra runs (levers: 3 full runs; strategy comparison: 4; compare: 1 per plan) can queue ahead of the main run and delay the result bar. Rules:
  - lever measurement only when `#levers` is near the viewport, no panel is open, results are current, after 800ms of settle;
  - strategy comparison stays user-initiated;
  - `CompareView` only mounts in compare mode.

  (Follow-up, not in scope: a second, low-priority worker for background measurements.)
- **Render isolation:**
  - `activeSection` and scroll state live in `useWorkspaceUiStore`, so only `SectionIndex` re-renders on scroll;
  - sections are `React.memo` and read narrow store selectors;
  - the scroll handler is passive and rAF-throttled, with at most five rect reads per frame;
  - the sticky-offset `ResizeObserver` writes a CSS variable, not React state.
- **Budget:** from slider input to a result-bar update, at most 250ms at 500 runs on a mid-range laptop, the same as today. Opening a panel must not cause more than one chart re-measure.

---

## 8. Implementation plan and file ownership

### 8.1 Phase 1: skeleton (one agent, sequential)

**Creates**

- `src/app/[locale]/simulation/ws-page.css`
- `src/components/workspace/`:
  - `WorkspaceProvider.tsx` (context + `useWorkspace`)
  - `useWorkspaceUiStore.ts`
  - `workspaceNav.ts`
  - `useScrollSpy.ts`
  - `useWorkspaceHash.ts`
  - `useStickyOffset.ts`
  - `useNearViewport.ts`
  - `LazyMount.tsx`
  - `ResultBar.tsx`
  - `useSavedSuccessDelta.ts`
  - `SectionIndex.tsx`
  - `PlanManagerDialog.tsx`
  - `edit/EditPanel.tsx`
  - `edit/panelContent.tsx`
  - `edit/focusField.ts`
  - `sections/WorkspaceSection.tsx`
  - `sections/ResultSection.tsx`
  - `sections/AssumptionsSection.tsx`
  - `sections/CashflowSection.tsx`
  - `sections/WithdrawalSection.tsx` (interim)
  - `sections/LeversSection.tsx` (interim)
- `src/components/plans/editor/{shared,PersonalGroup,SavingsGroup,FlowsGroup,MarketGroup}.tsx`
- `tests/onepage.spec.ts`
- `src/components/workspace/__tests__/workspaceNav.test.ts`
- `src/components/plans/__tests__/planSections.test.ts`

**Modifies**

- `src/app/[locale]/simulation/page.tsx` (rewrite)
- `src/app/interface.css` (layout tokens + `:has` rule only)
- `src/components/plans/planSections.ts` (rewrite)
- `src/components/workspace/PlanMenu.tsx` (compare item)
- `src/components/simulation-compact/DashboardTools.tsx`:
  - remove `PlanSwitcher`, the setup link, `focusPlans` and `returnFocusRef`;
  - keep `FOCUSABLE`;
  - show the € display at <1024 via `body:has(.ws-page) .workspace-menu-display` in `ws-page.css`
- `src/components/simulation-compact/CompareView.tsx` (title → `h2#compare-title`; `data-testid="compare-exit"` on the exit button)
- `src/components/simulation-compact/format.ts` (+ `formatBarEuro`)
- `src/components/charts/CashflowCard.tsx` (`onEdit(EditTarget)` + sr-only title source)
- `src/lib/stores/displayStore.ts` (drop `planSection`)
- `src/i18n/messages/{en,de}.json` (all Phase 1 keys in §10)
- `src/app/[locale]/simulation/__tests__/navigationMessages.test.ts`
- `src/lib/validation/__tests__/fieldValidation.test.ts` (move the section tests to `planSections.test.ts`)
- `src/lib/stores/__tests__/displayStore.test.ts` (+ legacy-key test)

**Deletes**

- `src/components/workspace/WorkspaceHeader.tsx` (`EuroDisplay` is imported from `./EuroDisplay`)
- `src/components/workspace/Overview.tsx`
- `src/components/workspace/overview.css` (still-needed rules move to `ws-page.css`)
- `src/components/plans/PlanEditor.tsx`
- `src/components/plans/PlanSectionNav.tsx`

**Does not touch:** `workspace.css` (the setup wizard depends on it), and the lane A/B components beyond the interim sections below.

**Interim sections** (so nothing is lost between phases):

- `WithdrawalSection` renders `<WithdrawalPlanner/>` followed by the existing `<details>` "Ausgabenstrategie im Detail" containing `<SpendingSection results/>`.
- `LeversSection` renders, inside one `LazyMount` (which also gates the extra simulation runs):
  - the note;
  - `CompactCommandBar quickOnly` (+ its "Erweitert" toggle → `AdvancedParamsPanel onOpenFullEditor={() => openEditor({ panel: 'market' })}`);
  - `BottomStrip recommendationsOnly` (`onOpenFullEditor` → `scrollToSection('assumptions')`);
  - `ScenarioList`;
  - `RecommendationList`.

**Suggested order:**

1. `planSections.ts` + `workspaceNav.ts` + unit tests.
2. Split `PlanEditor` into groups. Verify that every field id is unchanged: `grep -o 'id="editor-[^"]*"'` before and after.
3. Provider and hooks.
4. `ResultBar`, `PlanManagerDialog`, Menu cleanup, plan-menu compare item.
5. Sections and `SectionIndex`.
6. `EditPanel` (all three modes), deep links, `CashflowCard` rewiring.
7. Compare mode.
8. `ws-page.css` + tokens.
9. i18n.
10. Deletions + `displayStore`.
11. Tests; `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; `pnpm test:e2e tests/onepage.spec.ts`.

**Phase 1 acceptance:**

- [ ] Every row of §1 is reachable in the running app at 1440 / 1280 / 1100 / 820 / 390 / 320, in light and dark.
- [ ] Exactly one navigation element is visible at each width.
- [ ] Hash deep links, scroll-spy, panel focus/Escape/return, and compare enter/exit work.
- [ ] Setup wizard unchanged (`tests/app-header.spec.ts`, and the setup test in `workspace.spec.ts`, pass).
- [ ] Unit tests green.
- [ ] `onepage.spec.ts` green.

Other old E2E specs may fail; lane D migrates them.

### 8.2 Frozen after Phase 1 (contracts for Phase 2)

- `useWorkspace()` API
- `WorkspaceSection` props
- `LazyMount` / `useNearViewport` signatures
- `EditTarget`, `AssumptionPanel`, `panelForField`
- `workspaceNav.ts` exports and hash grammar
- DOM ids and testids in §9.4
- `page.tsx` composition

Changes to these go through the integrator only.

### 8.3 Phase 2: parallel lanes (disjoint files)

| Lane | Goal | Owns (exclusively) |
|---|---|---|
| **A: Entnahme** | §5.4 | `src/components/workspace/sections/WithdrawalSection.tsx`, `sections/withdrawal.css` (new), `src/components/plans/WithdrawalPlanner.tsx`, `src/components/charts/SpendingCorridorChart.tsx`, delete `charts/SpendingSection.tsx` and `charts/SpendingChart.tsx`, remove `useBrushRange` from `charts/useChartData.ts` (removal only), `src/lib/simulation/spendingCorridor.ts` + its `__tests__`; i18n namespace `withdrawalPlanner.*` (add only) |
| **B: Stellschrauben** | §5.5 | `sections/LeversSection.tsx`, `sections/levers.css` (new), `src/components/workspace/levers/{QuickLevers,LeverImpactList,useLeverMeasurements}.ts(x)` (new), delete `simulation-compact/{CompactCommandBar,AdvancedParamsPanel,BottomStrip}.tsx` and `charts/ScenarioList.tsx`, `simulation-compact/InlineSlider.tsx`, `charts/RecommendationList.tsx`, `plans/ScenarioPlanDialog.tsx`; may **add** (not modify) exports in `src/lib/simulation/planInsights.ts`; i18n `workspace.levers.*`, `planDashboard.scenarios.*`, `recommendations.*`, `simulationCompact.commandBar.*`, `simulationCompact.advanced.*`, `plans.toasts.compare` (add only) |
| **C: Visual polish** | §6 | `src/app/interface.css`, `src/app/design-system.css`, `src/app/[locale]/simulation/ws-page.css`, `src/app/[locale]/simulation/workspace.css` (prune rules only the old page used; keep everything setup uses), `src/components/workspace/{ResultBar,SectionIndex,AnimatedNumber (new),Skeleton (new),PlanMenu,PlanManagerDialog,EuroDisplay}.tsx`, `sections/{WorkspaceSection,ResultSection,AssumptionsSection,CashflowSection}.tsx`, `edit/EditPanel.tsx` (visual and motion only; behavior frozen), `src/components/plans/editor/*.tsx` (class-level flattening only), `charts/{CashflowCard,CashflowSankey}.tsx`, `simulation-compact/{FanChartCard,CompareView,CompareFanChart,DashboardTools}.tsx` (visual only), new `src/lib/__tests__/contrast.test.ts`; i18n `workspace.a11y.*` only if needed |
| **D: E2E migration** | §9 | `tests/**` (all specs, helpers, `onepage.spec.ts` from Phase 1 onward). **No `src/` edits.** A missing hook or testid goes back to the owning lane or the integrator. |

### 8.4 Coordination rules for shared files

1. **i18n (`src/i18n/messages/en.json`, `de.json`).**
   - Add keys only inside your namespaces (table above), in both files, with the same key order.
   - Never delete, rename or move keys during Phase 2; the Phase 3 cleanup does that.
   - Don't reformat blocks you don't own.
   - On merge conflicts, the integrator keeps both sides.
2. **CSS.**
   - Lanes A and B style through their co-located CSS file with prefixes `ws-withdrawal-*` / `ws-levers-*` and **tokens only** (no raw colours or pixel shadows).
   - They must not edit `interface.css`, `design-system.css`, `ws-page.css` or `workspace.css`.
   - If a lane needs a new shared token, use the nearest existing one and list the request in the PR description for lane C.
3. **Shared components** (`WorkspaceSection`, `LazyMount`, `Skeleton`, `AnimatedNumber`): A and B import them; C may restyle but not change props. `Skeleton` and `AnimatedNumber` arrive from lane C. Until then, A and B use `LazyMount`'s default skeleton and static numbers.
4. **Testids** in §9.4 are a contract. Lanes A, B and C must render them exactly; D writes against them.
5. **Unit tests:** each lane keeps the tests for its own files green. `pnpm lint && pnpm typecheck && pnpm test` must pass per lane before merge.
6. **Merge order:** A → B → C → D. Each lane rebases onto the previous one before merging.

### 8.5 Phase 3: integration (one agent, short)

- Delete the i18n keys listed as unused in §10.3 (grep-verify each one first).
- Run `pnpm verify` and `pnpm test:e2e`.
- Screenshot pass at 1440 / 1280 / 1100 / 1024 / 820 / 768 / 390 / 320 in light and dark, including a panel open in each mode and compare mode. Save to `docs/reviews/one-page/`.
- Update `CLAUDE.md` "Component Structure" with a line for `src/components/workspace/` (sections, edit panel).

---

## 9. Test migration

The Playwright default viewport is 1280×720 (Desktop Chrome), which means **docked panel and rail**. Numbers tween, so read `data-value` or use `expect.poll` rather than exact text right after a change.

### 9.1 Existing Playwright specs

| Spec · test | New assertion |
|---|---|
| **workspace.spec** · tablet overview, editor shortcuts and variants | At 1366:<br>• `success-pill` is visible in `result-bar`<br>• the five section `h2`s are in order<br>• quick slider "Jährliche Sparrate" is **not** in the viewport at load<br>• `edit-savings` click → `edit-panel[data-mode=docked]` is visible, the panel title is focused, `#editor-currentAssets` is visible<br>• plan menu → `plan-menu-compare` → `compare-view` and `compare-fan-chart` visible, hash `#compare`<br>• screenshots |
| · mobile workspace and menu fit | Unchanged: no horizontal overflow at 390; the Menu dialog is inside the viewport. |
| · navigation labels and toolbar controls fit | For 1280, 1024, 820, 768, 390 and 320:<br>• no overflow<br>• exactly one `section-index` is visible, in the right place: inside the left rail at ≥1024 (box `x` < `--ui-rail-width`), directly below the result bar at 761–1023 (computed `position: sticky`), bottom-aligned at ≤760 (computed `position: fixed`)<br>• every `section-link-*` has `scrollWidth ≤ clientWidth`<br>• result-bar buttons are ≥40px tall with a 14px font |
| · what-if strip explains drafts | Renamed "levers explain drafts".<br>• scroll to `#levers`; `levers-note` contains "Änderungen hier sind Entwürfe …"<br>• move the first quick slider → the result bar shows "Ungespeichert", and the note contains the new `whatIf.pending` text<br>• `#levers` contains no save or discard button<br>• `command-save` clears the marker |
| · overview offers a variant, then opens compare | Same flow via `overview-duplicate` → `overview-compare` (both inside `#result`).<br>• assert the hash is `#compare` and `compare-view` is in the viewport, with both chips `aria-pressed`<br>• remove the `tab-scenarios` / `enter-compare` asserts |
| · setup wizard sits in the workspace shell | **Unchanged** (guards the `workspace.css` pruning). |
| · phone first screen | At 390×844:<br>• `success-pill` and `h2` "Ergebnis" are in the viewport<br>• `section-index` (name "Abschnitte") has `position: fixed` with its bottom at 844<br>• `success-pill` is above the index; link "Geldfluss" is visible<br>• `display-toggle` is hidden; Menu → `menu-display-toggle` is visible |
| · plan menu lists plans … | Same, plus a "Compare plans" menu item.<br>• "Manage plans …" → dialog "Manage plans" (`plan-manager`) with `plan-switcher-select` focused; Escape → trigger focused<br>• unsaved edit via the quick slider in `#levers` (scroll first) |
| · discard sits next to the unsaved marker | Same via the `#levers` slider; `.workspace-toolbar` becomes `result-bar`. |
| · recalculate stays quiet | Same; `main[data-run-status]` is kept. |
| · menu focuses a real control, nested dialogs | Menu dialog name "Report and settings", "Generate Report" focused; the Menu contains no `plan-switcher` or `setup-link`. Nested case moved: `plan-manager` → `plan-duplicate` → Escape closes the name dialog only → Escape closes the manager → focus returns to `plan-menu-trigger`. |
| · comparison stacks chart above table on phones | Unchanged flow and assertions; also assert the bottom index does not cover `compare-exit`. |
| · header keeps one row from 761px up | Renamed "result bar keeps one row from 761px".<br>• dirty via the `#levers` slider<br>• for 761, 850, 950, 1023, 1024, 1200, 1279, 1280, 1366 and 1440: the vertical centres of the result bar's visible clusters are within 8px; `command-save` is in the viewport; the "Ungespeichert" marker is visible; the "updated" check is hidden while dirty; `command-discard` has title "Verwerfen" and a matching accessible name<br>• **`success-pill` x is stable across the dirty toggle** (replaces the picker-x check)<br>• 390: the result bar spans 3 visible rows at scroll 0; the plan name is not truncated; `h2` Ergebnis is in the viewport<br>• 320: the short marker is not clipped; no overflow |
| · discard toast leaves with a plan switch | Same, dirty via the `#levers` slider. |
| **dashboard.spec** · shows the result overview … | `verdict` contains "of simulated paths"; `fan-chart` is visible; `quick-levers` is not in the viewport; after `section-link-levers` the four sliders are visible. |
| · switches tabs | Replace with "section index scrolls and marks current": click each `section-link-*`; the target `h2` is focused and in the viewport; the link has `aria-current="location"`; the hash updates. |
| · scrubbing the age slider | Via `quick-levers`; the readout shows "62"; the stored `retirementAge` is 62. |
| · toggles the advanced parameter row | `more-sliders-toggle` toggles `advanced-params` (with the "Return volatility" slider and the checkbox). |
| · measures the recommendation chips | Renamed "measures lever effects and applies one": in `#levers`, the `stress-lever` for "Retire 2 years later" shows `stress-lever-delta` ("pts"); `stress-lever-apply` → stored `retirementAge` 62; the result bar is dirty. |
| · nominal/real | `display-toggle` in the rail (1280); the chart legend follows. |
| · enters compare, gains a challenger | Enter via `plan-menu-compare`; "Add plan"; delta KPIs and diff table; "Exit compare" → hash no longer `#compare`, `#result` is visible. |
| · runs on demand | Unchanged. |
| · working copy until saved | `edit-savings` → fill `#editor-currentAssets` 900000 → **`command-discard`** (replaces `plan-editor-revert`) → the field shows 630.000 → fill 700000 → `command-save` → stored assertions unchanged. |
| · wizard session abandoned | Unchanged. |
| · historical backtest / glide path / German taxes | `edit-market` replaces the `tab-plan` + pill steps; the rest is unchanged. |
| · unified cash flows / second pension / lump sum / template undo | `edit-flows` replaces the `tab-plan` + pill steps; `#plan-editor-expenses` stays the panel body id. |
| · toasts as fixed overlay | In `#levers`: `stress-lever-save` → confirm → toast fixed at bottom-right. |
| **cashflow-consolidation.spec** · tabs keyboard | Renamed "index is keyboard-reachable; the panel has one set of controls": Tab from `section-link-result` to `section-link-assumptions`; Enter focuses `h2` "Annahmen"; `edit-person` → dialog "Person & Zeitachse"; `plan-section-nav` count 0. |
| · actual tax deductions | `page.goto('/de/simulation#cashflow')`; the rest is unchanged. |
| · menu restores report … | Renamed "menu holds report, language, account, appearance": no `plan-switcher`, no `setup-link` in the Menu; `setup-link` in `#assumptions` has href `/en/setup`. |
| · spending slider after zero | Via `#levers`. |
| · historical mode disables … | `edit-market` → historical → Escape → `#levers` "Expected return" is `data-disabled`; `more-sliders-toggle` → "Return volatility" is disabled. |
| · mobile cash flows fit | At 390: `dashboard-tools` is in the viewport; `section-link-cashflow` → ledger visible; no overflow. |
| **cashflow-sankey.spec** · follows selected year | `goto('/de/simulation#cashflow')`; assertions unchanged. |
| · ledger labels open the matching section | Renamed "ledger labels open the matching panel and field": "Capital gains tax – edit in …" → the `edit-panel` title is "Market & taxes" and `#editor-capitalGainsTax` is focused. "Portfolio withdrawal – edit in …" → `#withdrawal` in the viewport, strategy button focused. |
| · phones stacked flows | Via `section-link-cashflow`; unchanged. |
| **plan-structure.spec** · out-of-range age / contradicting ages | `edit-person` replaces `tab-plan`; ids unchanged. |
| · plan tab sections | Replace with "edit panel: one at a time, walks, restores from the hash":<br>• `edit-person` → `edit-panel-next` ×3 → market body visible, other bodies count 0, `edit-panel-next` count 0<br>• `edit-panel-previous` works<br>• reload `/en/simulation#assumptions:market` → market panel open<br>• Escape → focus on `edit-market` |
| · wizard (2 tests) | Unchanged. |
| **quick-access.spec** (3 tests) | Via `#levers`; `.workspace-toolbar` becomes `result-bar`; reset names "Reset Annual savings" / "Reset Monthly spending" (now from i18n). |
| **withdrawal-planner.spec** (4 tests) | `goto('/en/simulation#withdrawal')` replaces the tab + pill steps. German: "Entnahmeplaner" becomes the `h2` "Entnahme". Add: `withdrawal-rule-effect` is visible; `spending-corridor-chart` count 1 and `#spending-chart-title` count 0; the corridor tooltip on hover contains "Mean gross draw / mean opening portfolio". |
| **i18n.spec** · German translations | `run-button` has accessible name "Neu berechnen"; `section-index` contains "Ergebnis"; `quick-levers` slider "Jährliche Sparrate" is visible after `section-link-levers`. |
| · seeded / renamed flows | `edit-flows`; reload `/de/simulation#assumptions:flows`. |
| **dialog-position.spec** | Dialog name "Bericht und Einstellungen"; otherwise unchanged. |
| **appearance.spec**, **app-header.spec**, **auth-entry.spec** | Unchanged (the setup and landing checks guard the CSS pruning). |

### 9.2 Unit tests affected

| Test | Change |
|---|---|
| `src/app/[locale]/simulation/__tests__/navigationMessages.test.ts` | Assert `workspace.sections.<id>.{title,short,description}` for all five ids in en and de. Drop the `simulationCompact.tabs` / `compareButton` asserts (those keys are unused and deleted in Phase 1). |
| `src/lib/validation/__tests__/fieldValidation.test.ts` | Remove the "plan section lookup" block (it moves). |
| `src/lib/stores/__tests__/displayStore.test.ts` | Add: a persisted `planSection` is dropped on rehydrate and `displayReal` still restores. |
| `src/components/workspace/__tests__/runStatus.test.ts` | Unchanged. |
| `src/lib/__tests__/colorScheme.test.ts` | Unchanged; must stay green after the token additions. |

### 9.3 New tests

- **Unit, Phase 1:**
  - `planSections.test.ts`:
    - `panelForField` for every real id (incl. `editor-taxAllowanceAnnual` and `editor-equityFundExemption`), the prefixes, and unknown ids;
    - `adjacentPanels`.
  - `workspaceNav.test.ts`:
    - `parseWorkspaceHash` / `formatWorkspaceHash` round trips (`#cashflow:market`, `#compare`);
    - German aliases;
    - `#main-content` / `#navigation` / `''` return `null`;
    - `pickActiveSection` for the top of page, a mid-section, the reading-line boundary and the at-bottom case.
  - `useSavedSuccessDelta` (as a pure helper): null when clean, null when the saved rate is unknown, and the sign cases.
  - `formatBarEuro` in de and en.
- **Unit, lanes:**
  - A: `withdrawalRateMean` in `spendingCorridor`.
  - B: the lever apply-key builder and undo snapshot, and the `shouldMeasure` gating predicate.
  - C: `contrast.test.ts`, and the `AnimatedNumber` tween function (instant under reduced motion).
- **E2E, `tests/onepage.spec.ts`** (Phase 1 writes the first version, D extends it):
  1. **Panel focus and Escape (docked, 1366):** `edit-savings` → the panel title is focused → Tab reaches `#editor-currentAssets` → Escape closes it → focus is on `edit-savings`. Clicking the page does not close the panel.
  2. **Overlay (1100 and 820):** the panel's top is ≥ the result bar's bottom; `.ws-main` has `inert`; `command-save` is clickable while the panel is open; a scrim click closes it; focus returns.
  3. **Sheet (390):** `edit-person` → `edit-panel[data-mode=sheet]` covers `section-index`; `edit-panel-mini-result` `data-value` equals `success-pill` `data-value`; `edit-panel-done` closes it.
  4. **Live update while the panel is open (1366):** open `person`; move the `editor-retirementAge` slider → `success-pill` `data-value` changes (poll), `success-delta` appears, `fan-chart` is still in the viewport, and the panel is still open.
  5. **Scroll-spy:** scroll `#cashflow` to the top via `scrollIntoView` → `section-link-cashflow` has `aria-current`; the hash is `#cashflow`; Back leaves the page (no history entry per section).
  6. **Hash deep links:**
     - `#levers` lands with the `h2` below the result bar;
     - `#assumptions:flows` opens the flows panel;
     - `#ergebnis` (alias) is handled;
     - `#main-content` does not throw and the page stays at the top.
  7. **Compare entry and exit:** `plan-menu-compare` → `#compare`, the sections are hidden, `compare-title` is focused → `page.goBack()` exits, the sections are visible and `scrollY` is restored within 50px; `compare-exit` returns focus to the plan menu trigger.
  8. **Lazy charts:** at the top of a 1280×720 page, `cashflow-sankey` count is 0 and the `#cashflow` lazy placeholder is `pending`; after scrolling it is visible.
  9. **Reduced motion:** with `emulateMedia({ reducedMotion: 'reduce' })`, the opened panel's computed `transition-duration` is `0s`, and clicking an index item scrolls with `behavior: auto` (the position is reached on the next frame).

### 9.4 Testid contract

- **Kept, same meaning:**
  - Result bar and runs: `run-status`, `run-button`, `command-save`, `command-discard`, `plan-discarded-toast(-undo)`, `dashboard-tools`
  - Plan menu: `plan-menu-trigger`, `plan-menu`, `plan-menu-option-*`, `plan-menu-new|duplicate|rename|manage`
  - Display switch: `display-toggle` (rail), `menu-display-toggle`
  - Ergebnis: `fan-chart`, `overview-compare`, `overview-duplicate`
  - Compare: `compare-view`, `compare-fan-chart`
  - Geldfluss: all `cashflow-*` (drill-down, see `2026-09-28-cashflow-drilldown.md`: new `cashflow-table`, `cashflow-toggle-<category>`, `cashflow-expand-all`, `cashflow-disabled-flows`; SVG nodes `data-node` = category or `<category>:<flow id>` / `<category>:more`, captions `data-group`; removed `cashflow-sankey-table-toggle`, `cashflow-sankey-table`; `cashflow-sum-heading` now sits in the table caption)
  - Panel bodies and fields: `plan-editor-personal|income|expenses|market`, `plan-editor-personal-stats-stale`, all `editor-*` / `cashflow-*` / `market-model-*` / `glide-path-*` / `tax-*` / `household-type-*` ids, `pension-net-readout`, `tax-drag-readout`, `editor-timeline-issues`
  - Reset: `plan-reset-dialog|confirm|toast(-undo)`, `plan-editor-reset` (moved)
  - Entnahme: `withdrawal-planner` (the `WithdrawalPlanner` root, i.e. the body of `#withdrawal`), `withdrawal-*`, `strategy-compare-*`, `spending-corridor-chart`, `corridor-marker-label`
  - Stellschrauben: `stress-lever` (now with `data-lever="laterRetirement|moreSavings|lowerSpending"`), `stress-lever-delta|save|baseline|saturated`, `scenario-plan-dialog|confirm`, `plan-created-toast(-switch)`, `recommendation-enable-glide-path`, `advanced-params` (the "Weitere Regler" body)
  - Setup link and plan manager contents: `setup-link` (moved), `plan-switcher*`, `plan-switch-discard`, and the rest of `PlanSwitcher`'s ids (`plan-new|rename|duplicate|delete(-confirm)`, `plan-deleted-toast(-undo)`, `plan-save-draft`, `plan-revert-draft`, `plan-dirty-badge|actions`, `plan-switch-guard|save`)
- **Moved:** `success-pill` (to the result bar, now with `data-value`); `kpi-strip` (Ergebnis facts row).
- **New:**
  - Result bar: `result-bar`, `result-bar-kpis`, `success-delta`, `end-assets` (with `data-value`)
  - Index: `section-index`, `section-link-{result|assumptions|cashflow|withdrawal|levers}`
  - Ergebnis: `verdict`, `life-stages`, `life-stage-{today|retirement|pension|horizon}`
  - Annahmen: `assumption-card-{person|savings|flows|market}`, `edit-{person|savings|flows|market}`
  - Edit panel: `edit-panel` (`data-mode`, `data-panel`), `edit-panel-title|close|done|previous|next|scrim`, `edit-panel-mini-result` (with `data-value`)
  - Plan menu and manager: `plan-menu-compare`, `plan-manager`
  - Compare: `compare-exit` (Phase 1 adds it to the existing exit button). The focus target on entry is the element id `#compare-title`, not a testid.
  - Stellschrauben (lane B):
    - `quick-levers` (the "Schnell ausprobieren" group), `levers-note`, `more-sliders-toggle` (controls `advanced-params`)
    - `lever-list` (the "Was am meisten bewirkt" group, with `data-measure="pending|ready|stale"`), `stress-lever-apply`
    - `lever-applied-toast`, `lever-applied-toast-undo` (after "Übernehmen")
    - `plan-created-toast-compare` (the created-plan toast's "Vergleichen" action)
    - `recommendations` (the `RecommendationList` root, "Empfehlungen")
  - Entnahme: `withdrawal-rule-effect`
  - Numbers that tween (`AnimatedNumber`) expose the final value as `data-value`; assert on it rather than on the text.
  - Lazy placeholders: `data-lazy-state` on `LazyMount`
- **Removed:**
  - Old navigation: `tab-overview|plan|cashflow|scenarios`, `enter-compare`
  - What-if strip: `whatif-strip`, `whatif-draft`, `whatif-note` (becomes `levers-note`)
  - Old command bar: `compact-command-bar`, `command-quick-row` (becomes `quick-levers`), `bottom-strip`
  - Old editor: `plan-editor`, `plan-section-nav`, `plan-section-pill-*`, `plan-section-footer`, `plan-section-previous|next` (become `edit-panel-*`), `plan-editor-revert`

---

## 10. i18n

German copy uses "du" throughout. Existing `planDashboard.scenarios.deltaPoints` is used for all "Pkt." / "pts" deltas.

### 10.1 New keys (Phase 1 unless noted)

Where one row lists several keys, their values are separated by ` ¦ ` in key order.

| Key | de | en |
|---|---|---|
| `workspace.pageTitle` | {plan} – Ruhestandsplanung | {plan} – Retirement planner |
| `workspace.sections.result.{title,short,description}` | Ergebnis ¦ Ergebnis ¦ Wie wahrscheinlich dein Geld reicht und wie sich dein Vermögen entwickeln kann. | Result ¦ Result ¦ How likely your money is to last, and how your assets may develop. |
| `workspace.sections.assumptions.{title,short,description}` | Annahmen ¦ Annahmen ¦ Die Ausgangswerte deines Plans. Änderungen rechnen sofort durch und bleiben ein Entwurf, bis du speicherst. | Assumptions ¦ Inputs ¦ Your plan's starting values. Changes recalculate instantly and stay a draft until you save. |
| `workspace.sections.cashflow.{title,short,description}` | Geldfluss ¦ Geldfluss ¦ Woher dein Geld kommt und wohin es fließt – Jahr für Jahr, nach Steuern. | Money flow ¦ Flows ¦ Where your money comes from and where it goes – year by year, after tax. |
| `workspace.sections.withdrawal.{title,short,description}` | Entnahme ¦ Entnahme ¦ Wie aus deinem Depot ein Einkommen wird – und was es in schwachen Jahren tut. | Withdrawal ¦ Drawdown ¦ How your portfolio becomes an income – and what it does in weak years. |
| `workspace.sections.levers.{title,short,description}` | Stellschrauben ¦ Hebel ¦ Probier Änderungen aus und sieh, was am meisten bewirkt. | Levers ¦ Levers ¦ Try changes and see what moves the needle most. |
| `workspace.bar.{label,success,successShort,endAssets,endAssetsShort,deltaAria}` | Ergebnis deines Plans ¦ Erfolgsquote ¦ Erfolg ¦ Vermögen am Ende · Median ¦ Ende · Median ¦ Veränderung gegenüber dem gespeicherten Plan: {delta} | Your plan's result ¦ Success rate ¦ Success ¦ End assets · median ¦ End · median ¦ Change against the saved plan: {delta} |
| `workspace.verdict.lead` | der simulierten Verläufe finanzieren dein Budget und dein Vermögensziel bis Alter {end}. | of simulated paths fund your budget and legacy goal through age {end}. |
| `workspace.runContext.{monteCarlo,historical,disclaimer}` | Monte-Carlo-Simulation mit {runs} Läufen ¦ Historische Renditen, {runs} Startjahre ¦ Eine Modellrechnung, keine Garantie. | Monte Carlo simulation, {runs} runs ¦ Historical returns, {runs} start years ¦ A model, not a guarantee. |
| `workspace.lifeStages.{label,editAria}` | Lebensphasen ¦ {label}: {value} – bearbeiten | Life stages ¦ {label}: {value} – edit |
| `workspace.cards.person.{value,detail,pension}` | Ruhestart mit {age} ¦ Heute {current} · geplant bis {end} ¦ Gesetzliche Rente ab {age} | Retire at {age} ¦ Today {current} · planned to {end} ¦ State pension from {age} |
| `workspace.cards.savings.growth` | +{rate} pro Jahr · Sparquote {share} | +{rate} per year · savings rate {share} |
| `workspace.cards.flows.{value,counts,pensions}` | {amount} pro Monat ¦ {pensions, plural, =0 {keine Rente} one {# Rente} other {# Renten}} · {expenses} Ausgabenposten · {incomes} Einnahmen ¦ Renten mit {age}: {amount} brutto/Monat | {amount} per month ¦ {pensions, plural, =0 {no pension} one {# pension} other {# pensions}} · {expenses} expense items · {incomes} incomes ¦ Pensions at {age}: {amount} gross/month |
| `workspace.cards.market.{value,valueHistorical,detail,detailHistorical,glideOn,glideOff,tax}` | {rate} Rendite ¦ Historische Renditen ¦ Inflation {inflation} · Schwankung ± {volatility} ¦ {from}–{to} · {count} Startjahre ¦ Gleitpfad {start} → {end} ¦ Gleitpfad aus ¦ Steuerlast ≈ {rate} | {rate} return ¦ Historical returns ¦ Inflation {inflation} · volatility ± {volatility} ¦ {from}–{to} · {count} start years ¦ Glide path {start} → {end} ¦ Glide path off ¦ Tax drag ≈ {rate} |
| `workspace.cards.startingValues` | Ausgangswerte in heutigen Euro | Starting values in today's euros |
| `workspace.{guidedSetup,guidedSetupHint}` | Geführte Einrichtung ¦ Lieber Schritt für Schritt? | Guided setup ¦ Prefer step by step? |
| `workspace.editPanel.{close,done,navLabel,editAria,liveResult,liveDelta,toFlows,toWithdrawal}` | Bearbeiten schließen ¦ Fertig ¦ Annahmen durchgehen ¦ {title} bearbeiten ¦ Erfolgsquote jetzt {rate} ¦ {delta} gegenüber dem gespeicherten Plan ¦ Zu Einnahmen & Ausgaben ¦ Zum Abschnitt Entnahme | Close editor ¦ Done ¦ Walk through assumptions ¦ Edit {title} ¦ Success rate now {rate} ¦ {delta} against the saved plan ¦ Go to Income & spending ¦ Go to Withdrawal |
| `workspace.planMenu.compare` | Pläne vergleichen | Compare plans |
| `workspace.planManager.{title,description}` | Pläne verwalten ¦ Wechseln, anlegen, umbenennen, duplizieren oder löschen. | Manage plans ¦ Switch, create, rename, duplicate or delete plans. |
| `workspace.levers.{quickTitle,more,editMarket,impactTitle,apply,applyAria,appliedToast,reset}` (**lane B**) | Schnell ausprobieren ¦ Weitere Regler ¦ Alle Marktannahmen bearbeiten ¦ Was am meisten bewirkt ¦ Übernehmen ¦ „{name}“ in den Entwurf übernehmen ¦ „{name}“ übernommen – noch nicht gespeichert. ¦ {label} zurücksetzen | Try quickly ¦ More sliders ¦ Edit all market assumptions ¦ What moves the needle ¦ Apply ¦ Apply “{name}” to your draft ¦ Applied “{name}” – not saved yet. ¦ Reset {label} |
| `plans.toasts.compare` (**lane B**) | Vergleichen | Compare |
| `withdrawalPlanner.steps.{choose,tune,effect,compare}` (**lane A**) | Regel wählen ¦ Regel einstellen ¦ So wirkt deine Regel ¦ Alle vier Regeln vergleichen | Choose a rule ¦ Tune the rule ¦ How your rule behaves ¦ Compare all four rules |

### 10.2 Changed values (Phase 1)

Multi-key rows use the same ` ¦ ` separator.

| Key | de | en |
|---|---|---|
| `workspace.navigation` | Abschnitte | Sections |
| `workspace.whatIf.pending` | Speichern oder verwerfen kannst du sie oben in der Ergebnisleiste. | Save or discard them in the result bar at the top. |
| `planEditor.groups.income.{title,description}` | Vermögen & Sparen ¦ Was du heute hast und bis zum Ruhestand zurücklegst. | Assets & savings ¦ What you have today and put aside until retirement. |
| `planEditor.groups.cashFlows.title` | Einnahmen & Ausgaben | Income & spending |
| `planEditor.groups.cashFlows.incomePointer` | …Bearbeitung unter „Einnahmen & Ausgaben“ (all three plural branches) | …edited under “Income & spending” |
| `planEditor.groups.market.title` | Markt & Steuern | Market & taxes |
| `planEditor.groups.withdrawal.pointer` | Entnahmeregel: {strategy} — festgelegt im Abschnitt „Entnahme“ | Withdrawal rule: {strategy} — set in the “Withdrawal” section |
| `simulationCompact.tools.{title,description}` | Bericht und Einstellungen ¦ Bericht exportieren, Sprache, Konto und Darstellung ändern. | Report and settings ¦ Export a report and change language, account or appearance. |
| `simulationCompact.compare.openEditor` | Annahmen bearbeiten → | Edit assumptions → |

### 10.3 Keys that become unused (delete in Phase 3 after a grep check)

- `workspace.views.*` (all), `activePlan`, `current`, `outcome`, `successfulPaths`, `planSnapshot`, `snapshotHint`, `followMoney`, `experiment`, `experimentHint`, `spendingAnalysis`, `variantMode`, `exploreVariants`, `comparePlans`, `applyChanges`, `timelineHint`, `budgetHint`, `whatIf.draft`, `whatIf.draftAria`.
- `simulationCompact.tabs.*` and `simulationCompact.compareButton`: delete in **Phase 1** together with the test update.
- `simulationCompact.tools.setup`.
- `simulationCompact.bottom.*` (all).
- `simulationCompact.commandBar.{planAria,setup,run,successAria,unsavedSwitch,advanced}`. Keep `saveButton`, `age/ageAria`, `save/saveAria`, `spend/spendAria/spendValue` and `roi/roiAria`.
- `simulationCompact.advanced.{runs,runsAria,editFullPlan}`.
- `planEditor.{title,description,descriptionGeneric}`, `planEditor.sections.navLabel`, `planEditor.groups.expenses.*` (already unused today).
- `spendingChart.*` **except** `explanation.*`, `legend.meanWithdrawalRate` and `legend.note`.
- `simulationChart.spendingTable.{note.*,caption,headers.*}`. Keep `toggle`, which the corridor uses.
- `withdrawalPlanner.title` and `withdrawalPlanner.description`, unless lane A reuses them.

Phase 3 deleted all of the above after the grep check, plus the leftovers the lanes reported (`withdrawalPlanner.{strategyLabel,paramsLabel,corridor.description,corridor.noFloor,compare.title,compare.empty}`, `simulationCompact.commandBar.{age,save,spend,roi}`, `simulationCompact.advanced.{volatility,inflation,pension,endAge}`, `planDashboard.scenarios.{title,loading,preview,worstDecile,baseline,baselineHistorical,saveAsPlan}`, `recommendations.empty`), `spendingChart.explanation.strategyLabel` (unread), `workspace.outcomeExplain`, `simulationCompact.computing`, `simulation.display.realHint`, and the `assetsChart.*` keys that only the unrendered `AssetsChart` read.

---

## 11. Risks and open questions

**Risks, with mitigations**

1. **Worker contention** from background simulations delays the result bar. Mitigation: gating and an 800ms settle (§7). If the budget is still missed, add a second low-priority worker (follow-up).
2. **Sticky and safe-area quirks on iOS** (the negative sticky `top` on phones). Mitigation: fixed row heights (52 / 52 / 44), `env()` fallbacks, and a manual check on an iPhone (or Safari's responsive mode) during Phase 3. The Playwright config only runs Chromium.
3. **Escape and focus conflicts** between the Radix non-modal panel and the hand-rolled `PlanMenu`. Mitigation: the Escape rule in §3.3, covered by `onepage.spec` test 1.
4. **Chart thrash when the docked panel opens.** Mitigation: no width animation; a single re-measure.
5. **Flaky E2E caused by number tweens.** Mitigation: `data-value` attributes and `expect.poll`.
6. **Setup wizard regression** from pruning `workspace.css`. Mitigation: lane C prunes only selectors unused by `setup/page.tsx` and `setup-shell.css`; app-header, workspace-setup and auth-entry specs guard it.
7. **Long-page performance on low-end phones.** Mitigation: `LazyMount`, memoized sections, code-split compare and panels.
8. **i18n JSON merge conflicts.** Mitigation: the namespace rule plus integrator merges (§8.4).
9. **Locale switch drops the hash.** `next-intl` `router.replace` does not carry it, so after changing language the page opens at the top. Accepted as a known limitation.
10. **Deep links to unrendered fields** (glide-path sliders while the glide path is off). `focusField` falls back to the panel title. No deep-link source in §3.3 targets a conditional field today, so the fallback is defensive. Phase 1 verifies it manually; Jest runs in the `node` environment without a DOM, so there is no unit test for it.

**Open questions:** none block implementation. Two decisions are flagged for the owner's sign-off at the Phase 3 screenshot review:

- (a) On phones the plan picker scrolls away while KPIs and Menü stay pinned.
- (b) The short phone label "Hebel" for "Stellschrauben".

Changing either later is CSS or copy only.
