# One-page workspace: Phase 3 screenshots

These are captures of `/de/simulation` after the Phase 3 integration pass (spec `docs/specs/2026-09-28-one-page-workspace.md`, §8.5).

How they were taken:

- Playwright Chromium against the dev server.
- `deviceScaleFactor` 1, `prefers-reduced-motion: reduce` so no number is caught mid-tween, JPEG quality 80, viewport only.
- Each shot is a fresh page load of the URL shown.
- The data is the default plan ("Basisplan") plus a saved copy, "Zwei Jahre später in Rente" (retirement age 62), so compare mode has something to compare. "Basisplan" is active in every shot.

| File | Viewport | URL / state | Shows |
|---|---|---|---|
| `1440-light-top.jpg` | 1440×900, light | `/de/simulation` | Result bar (success rate, median end assets, run status, saved marker, plan menu, Menü), left rail with the section index and the € switch, and the start of Ergebnis: verdict, facts row, fan chart. |
| `1440-light-panel-docked.jpg` | 1440×900, light | `#assumptions:market` | Edit panel **docked** as a third column ("Markt & Steuern"), with the Annahmen cards still readable beside it. The market card is marked as the one being edited, and the panel footer has Zurück / Fertig. |
| `1440-light-withdrawal.jpg` | 1440×900, light | `#withdrawal` | Entnahme: rule picker and rule settings on the left. On the right, the four readouts (now tweened via `AnimatedNumber`) and the spending corridor. |
| `1440-light-compare.jpg` | 1440×900, light | plan menu → "Pläne vergleichen" (`#compare`) | Compare mode: plan chips, KPI deltas, the overlaid fan chart and the diff table with changed rows highlighted. |
| `1440-dark-top.jpg` | 1440×900, dark | `/de/simulation` | Same as the first shot, in dark mode. |
| `1024-light-panel-overlay.jpg` | 1024×768, light | `#assumptions:savings` | Edit panel as an **overlay** sheet from the right, below the result bar. The page is dimmed and inert, and the bar stays usable. |
| `390-light-top.jpg` | 390×844, light | `/de/simulation` | Phone first screen: the plan picker row (it scrolls away), the pinned KPI row with Menü, Ergebnis, and the fixed bottom section index. |
| `390-light-panel-sheet.jpg` | 390×844, light | `#assumptions:person` | Edit panel as a **bottom sheet**, with the live mini result ("Erfolg 95,2 %") under the title. |
| `390-light-levers.jpg` | 390×844, light | `#levers` | Stellschrauben on a phone: the four quick levers, "Weitere Regler", the draft note, and the start of "Was am meisten bewirkt". The heading sits directly under the pinned bar, and "Hebel" is active in the bottom index. |

Two items from spec §11 are left for the owner's sign-off, and these shots show both:

- (a) On phones the plan picker scrolls away (see `390-light-levers.jpg`).
- (b) The short label "Hebel" is used in the bottom index.
