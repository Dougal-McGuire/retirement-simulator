# Flow switches: design note

- **Status:** implemented · **Date:** 2026-09-28 · **Base:** `6ad6d63` (the `CashFlow.enabled` contract)
- **Request:** "As for the incomes and expense, it would be useful to have an option, to enable disable, which will make the workflow for creating different scenarios based on uncertain income/expense events more flexible."
- **Related:** `docs/specs/2026-09-28-one-page-workspace.md` (result bar, edit panel, compare mode, Stellschrauben)

Every income, expense and pension in a plan can be switched off. A switched-off flow stays in the plan but no calculation sees it. Switching is a normal draft edit. The draft can be kept as a plan of its own, and Stellschrauben measures what each uncertain item is worth.

## 1. Semantics

`CashFlow.enabled?: boolean` defaults to on and is stored only as `enabled: false`. `withCashFlowEnabled(flow, true)` drops the field, so switching a flow back on leaves it byte-identical to before.

**A switched-off flow is invisible to every calculation.** It is still in the plan: in the flow list, in localStorage, in cloud sync (`normalizePersistedParams` keeps it) and in the PDF request.

| Consumer           | How it skips switched-off flows                                                                                                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine             | `buildCashFlowSeries`, the engine's only per-year expansion of flows, skips them first. The per-year baseline, windowed flows, one-offs, pensions and taxes all come from it, and so do `spendingCorridor` and `planDiff.scheduledTotals`.                                                                             |
| Pension helpers    | `pensionMonthlyAtAge`, `netPensionAnnualAtAge` and `firstPensionAge` skip them. This covers `netAnnualPension`, `planInsights`, `insights/{planHealth,bridge,recommendations}`, the Market/Flows stat strips, the Annahmen card ("Renten mit 67"), the report's pension figure and planDiff's pension row.             |
| Legacy projections | `isLifetimeExpenseFlow` and `isOnceIncomeFlow` are false for switched-off flows, so `customExpenses` and `oneTimeIncomes` omit them. Everything that reads those arrays therefore counts only switched-on flows: the monthly budget, the expense counts, the savings rate, the compare view and the report categories. |
| Other readers      | `enabledCashFlows(flows)` is used by planDiff's scheduled-item count and the report transformer. The result section's "Erste Rente" checks `isCashFlowEnabled`.                                                                                                                                                        |
| Identity           | `cashFlowSignature` appends `off` for a switched-off flow only, so every existing signature stays byte-identical. The engine hash, `cashFlowsEqual`, `areSimulationParamsEqual`, `comparisonFingerprint`, `simulationFingerprint` and the store's dirty check (JSON of sanitized flows) all see a switch flip.         |
| Stress levers      | `lowerSpending` scales switched-on recurring expenses only, because the lever is measured on what the plan counts.                                                                                                                                                                                                     |

A unit test runs every flow kind through the engine switched off and deleted, with the same seed and the same parameters otherwise. The results are identical.

## 2. Reconcile rules (legacy arrays)

`reconcileCashFlows` treats `customExpenses` and `oneTimeIncomes` as authoritative for the subset they can express. It drops flows of that subset that are missing from them. A switched-off flow is **outside that subset**, so:

- A projection never contains it, and reconcile carries it through untouched, like a windowed flow. Round trips (`withCashFlowProjections`, `normalizePersistedParams`, the engine's normalization) are the identity, for every flow kind.
- A legacy write, such as a stress lever or the quick spending slider rewriting `customExpenses`, cannot drop, edit or re-enable it.
- An **expense** entry that still carries a switched-off flow's id is absorbed, not appended as a switched-on duplicate. This happens with a stale projection or with the quick slider's plan-anchored fallback.
- An **income** entry equal in value to a switched-off income is a _new_ switched-on income. Value is not identity: a legacy writer can legitimately add the same windfall again. (The setup wizard's one-off list no longer writes the legacy array: it reads every one-off income from `cashFlows`, switched-off ones dimmed with the same switch and an **Aus** tag, and writes flows-first through `components/forms/fields/oneOffIncomeFlows.ts`.)

### Statutory pension

The statutory pension (`pension-statutory`, legacy field `monthlyPension`) **can be switched off**, because "no statutory pension" is a legitimate stress scenario. The round trips are safe:

- `statutoryPensionMonthly` projects **0** while it is off. That is the pension the calculation counts.
- `withStatutoryPension` returns the list **untouched** while the statutory flow is off. Honouring the projected 0 would delete it on the next reconcile. Honouring any other value would switch it back on behind the user's back. A switched-off statutory pension can only be edited or re-enabled in the flow list.
- The quick "Monatliche gesetzliche Rente" slider, which writes `monthlyPension`, is disabled while the pension is off. It reads "Gesetzliche Rente ausgeschaltet" and has no reset or plan mark.

Tests cover reconcile idempotence for a switched-off expense (lifetime monthly, lifetime annual, windowed, one-off), income (recurring windowed, one-off) and pension (statutory, other). They also cover a legacy-first reconcile, projection exclusion, statutory writes while off, and the persisted round trip.

The quick spending slider's **reset** now restores lifetime expenses from the saved plan's _flows_, amount and switch included. It no longer writes the legacy array. Restoring the array would have dropped an expense the draft had switched back on.

## 3. UI: flow list (`CashFlowList`, used by the edit panel and the setup wizard)

- Each row's first control is a switch (`role="switch"`, `aria-checked`, name „{name}“ in der Berechnung, id and testid `cashflow-switch-<id>`). It has a Radix tooltip, "Berücksichtigen" (or "Ausgeschaltet – bleibt im Plan …" when off), shown on hover after 400 ms and immediately on keyboard focus. The column header names it for screen readers.
- A switched-off row (`data-enabled="false"`) is muted: muted name and amount, a faded kind icon and an **Aus** tag. Its timeline bar keeps its window but is hatched grey (`data-flow-off`).
- Group headers count switched-on flows and add "· 1 ausgeschaltet". The yearly totals leave switched-off flows out, and a line under them reads "1 Posten ausgeschaltet – in keiner Summe".
- Editing a switched-off flow keeps it switched off.
- The row is a deep-link target (`data-field-wrapper`). `focusField` flashes the row instead of the whole list; this is a one-line addition to `edit/focusField.ts`.
- The Flows panel stat strip names what is off next to the figure it would be part of, for example "5 Einträge · 1 ausgeschaltet". The Annahmen card "Einnahmen & Ausgaben" counts switched-on flows and appends "· 1 ausgeschaltet".
- Switching is an ordinary `updateParams({ cashFlows })`. The result bar shows "Ungespeichert" with the delta chip, the result recomputes live, and Verwerfen undoes the switch.

## 4. Scenario workflow: "Änderungen als neuen Plan speichern"

`saveDraftAsNewPlan(name)` is a new store action. It stores the working copy as a new plan in the background and remembers its success rate, because the results on screen describe the draft. It then puts the active plan back to its saved state; **the active plan stays active**.

**Why stay rather than switch:**

- Scenarios are built from one base: switch off the inheritance and save, then switch off the care costs and save again. Staying on the base makes the next variant one click away.
- It behaves like the levers' "Als Plan speichern" ("Dein aktueller Plan bleibt aktiv"), so the page has one meaning of "save as plan".
- "Duplizieren" already covers the switch-to-the-copy path. It copies the dirty working copy and activates the copy.
- The comparison reads in the natural direction: saved plan (base) → new variant.

The toast "„Ohne Erbschaft“ gespeichert. „Beispielplan“ ist wieder auf dem gespeicherten Stand." offers **Vergleichen** (primary), which enters compare mode with both plans, then **Dorthin wechseln** and **Schließen**. It reuses the `plan-created-toast*` test ids.

The dialog reuses `ScenarioPlanDialog` with `variant="draft"`. It lists switch flips first ("Erbschaft berücksichtigt → ausgeschaltet"), then the other differences. Those are measured against the base _with the draft's switches applied_ (`withSwitchesOf`), so a switched-off inheritance is not also reported as "Einmalzahlungen 80.000 € → 0 €". When the only change is one switch, the dialog suggests "Ohne {name}" or "Mit {name}" as the plan name; otherwise it suggests the duplicate name.

**Entry points:**

- **Plan menu:** the first action while dirty, "Änderungen als neuen Plan speichern …" (`plan-menu-saveAsNew`).
- **Result bar at ≥1600 px:** an icon button beside Speichern (`command-save-as-new`).

Measured with the button added, the bar overflowed at 1280 px and filled 1366 px to the pixel. At 1440 px it fit only by cutting the plan name to "Beisp…". So up to 1599 px the bar is unchanged and the plan menu is the entry point. A test asserts that the dirty bar fits at 1024, 1280, 1366, 1440 and 1600 px and that the plan name stays whole from 1366 px.

## 5. Compare

- `planDiff.buildFlowSwitchRows(paramsList)` matches flows by id. A row exists only where a flow is on in one compared plan and off in another. It feeds the save-draft dialog.
- `CompareView` renders `planDiff.buildFlowDiffRows(paramsList)`: switch flips first ("Erbschaft | berücksichtigt | ausgeschaltet", `plans.comparison.flowSwitch.*`), then flows missing from a plan ("—", read as "nicht im Plan", against amount and window), then flows in every plan whose amount, frequency or window differ. Flows are lined up by `matchFlowsAcrossPlans`: id + kind + name, then kind + name (plans whose ids were issued separately), then id + kind (a renamed copy). Lifetime budget items get no amount row (the monthly budget row shows them) and the statutory pension none at all (its own row). At most 8 rows; "n weitere Posten zeigen" (`compare-flow-more`) shows the rest. Rows carry `data-testid="compare-flow-row"` and `data-flow-change`.
- `diffFlowSwitches(base, next)` feeds the save-draft dialog.

## 6. Stellschrauben: "Unsichere Posten"

The group sits after "Was am meisten bewirkt" and before the recommendations (`levers/UncertainFlowsList.tsx`).

- **What is listed:** `isEventLikeFlow`, which covers one-off expenses, expenses with a start or end age, every income flow and every pension except the statutory one. Lifetime living costs and the statutory pension have their own sliders. Switched-off items are included, because switching one back on is the same question in the other direction.
- **Deviation:** the brief listed one-off incomes and windowed flows; this also includes _lifetime recurring incomes_, such as rent or a side job, because they are uncertain in exactly the same way.
- **Cap and order:** at most 8 items, the largest by plan total in today's euros (`flowPlanTotal`). Items are measured in that order. Once all are measured, the list is sorted by absolute impact. The order then stays fixed while the same items are listed, so a row never jumps away under the pointer after its own switch triggers a re-measure. If there are more than 8, a link names the rest.
- **Row content:** a switch (the same draft edit as in the list), the name as a link, and "−2.200 € · Monatlich · Alter 82–90". The name link calls `openEditor({ panel: 'flows', fieldId: 'cashflow-switch-<id>' })`, which focuses that row's switch.
- **Impact:** for a switched-on item, "ohne: −3,2 Pkt. → 90,8 %"; for a switched-off one, "mit: +1,2 Pkt. → 95,2 %". Saturated plans (≥ 99 %) show the worst-decile euro delta instead, as the lever list does. A screen-reader sentence carries the whole statement. A figure measured for the other switch position is never shown; the row shows a skeleton until it is re-measured.
- **Measurement:** `useFlowMeasurements` shares its gate and settle timer with the levers through the new `useSettledBase` hook, extracted from `useLeverMeasurements`. It runs only when the list is near the viewport, no panel is open, nothing is running or held, the results are current, and the page has been settled for 800 ms. Each item's scenario is `buildFlowToggleParams`, one switch flipped and projections rewritten flows-first, at the hero's run count and on the same random paths. Both lists go through `runInBackgroundSlot`, a module-level queue that allows **one background job on the worker at a time across both lists**, so at most one background run ever waits in front of the result bar's next run. Results are cached per draft fingerprint.
- **Empty state:** "Keine einmaligen oder befristeten Posten im Plan." with a "Posten hinzufügen" link that opens the Flows panel.

## 7. Report (PDF)

- Switched-off flows are left out of every figure: the transformer's scheduled flows use `enabledCashFlows`, and the pension, bridge, health and recommendation figures come from the helpers.
- They are named once, in the spending section below the scheduled flows, in the register the report uses: "Nicht berücksichtigt: Erbschaft (+80.000 €, einmalig). Diese Posten sind im Plan hinterlegt, aber ausgeschaltet; sie fließen in keine Zahl dieses Berichts ein." This comes from `spending.switchedOffFlows`, which is optional in the schema so older clients still validate.
- **Fix:** the `/api/generate-pdf` request schema now keeps `enabled`. Zod stripped it before, and a switched-off flow would have counted again in the server-side transform.

## 8. Files and test ids

- **Logic:** `lib/simulation/{cashFlows,planDiff,planInsights,uncertainFlows}.ts`, `lib/stores/simulationStore.ts` (`saveDraftAsNewPlan`), `lib/transformers/reportDataTransformer.ts`, `lib/pdf-generator/{schema/reportData,reportTypes}.ts`, the PDF `Spending` section, `app/api/generate-pdf/route.ts`.
- **UI:** `forms/fields/CashFlowList.tsx`, `plans/{ScenarioPlanDialog,SaveDraftAsPlanDialog,useAssumptionFormat}`, `plans/editor/FlowsGroup.tsx`, `workspace/{ResultBar,PlanMenu}.tsx`, `workspace/levers/{UncertainFlowsList,useFlowMeasurements,useLeverMeasurements,QuickLevers}`, `workspace/sections/{Assumptions,Levers,Result}Section.tsx`, `levers.css`, the `ws-page.css` bar rule, `simulation-compact/CompareView.tsx`, `workspace/edit/focusField.ts`.
- **Test ids:** `cashflow-switch-<id>`, `cashflow-row-<id>` (`data-enabled`), `cashflow-off-<id>`, `cashflow-switched-off-summary`, `[data-flow-off]`, `plan-menu-saveAsNew`, `command-save-as-new`, `save-draft-dialog`, `save-draft-confirm`, `uncertain-flows` (`data-measure`), `uncertain-flow` (`data-flow-id`, `data-enabled`), `uncertain-flow-switch`, `uncertain-flow-open`, `uncertain-flow-delta` (`data-value`), `uncertain-flows-empty`, `uncertain-flows-add`.
- **Tests:** `lib/simulation/__tests__/flowSwitches.test.ts`, the store tests for `saveDraftAsNewPlan`, the PDF route test, and `tests/flow-switches.spec.ts`. The spec's axe checks cover the panel and the levers group at 1366 and 390 px, light and dark. They need `AXE_CORE_PATH` pointing at an `axe.min.js`, because axe-core is not a dependency.
