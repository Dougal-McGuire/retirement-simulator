# Withdrawal rules with non-portfolio income: design note

- **Status:** implemented · **Date:** 2026-11-09 · **Base:** `f1beaf3`
- **Trigger:** engine review. The three market-responsive rules applied their rate to the household's _total_ spending and netted pensions off afterwards. A plan with a pension was told to live on a fraction of that pension while the rest piled up in the portfolio, and the pile was then reported as a high success rate.
- **Code:** `src/lib/simulation/engine.ts` (`applyWithdrawalStrategy`, the three `calculate…AnnualSpending` functions, the year loop), `src/lib/simulation/spendingCorridor.ts`
- **Tests:** `src/lib/simulation/__tests__/engine-incomeRules.test.ts`, `spendingCorridor.test.ts`, `engine-golden.test.ts`

A withdrawal rule decides how much the **portfolio** pays. What the household receives without touching the portfolio is not the rule's to ration.

## 1. Terms

All amounts are per year and nominal unless marked real. `t` is a year of retirement.

| Symbol   | Meaning                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `B_t`    | The plan's lifetime budget in year `t`: the lifetime recurring expenses, re-priced with the path's own inflation.                                             |
| `N_t`    | Net non-portfolio income: every pension and every recurring income flow that pays in year `t`, after its own income tax. In the engine this is `extraIncome`. |
| `P_t`    | The portfolio the rule measures: the prior year-end balance plus any one-off income credited at the start of year `t`.                                        |
| `S_t`    | Baseline spending the rule sets for year `t`. Year one of retirement is `t = 0`.                                                                              |
| `E_t`    | Scheduled expenses of year `t`: windowed and one-off expense flows.                                                                                           |
| `π_t`    | The path's price change from year `t − 1` to year `t` (a factor, e.g. 1.02).                                                                                  |
| `r`      | `dsWithdrawalRate`.                                                                                                                                           |
| `c`, `f` | `dsCeilingRate` (≥ 0) and `dsFloorRate` (≤ 0), Vanguard only.                                                                                                 |

**One-off income is not part of `N_t`.** The engine has always paid a one-off (an inheritance, a lump sum) into the portfolio at the start of the year after its booked age, and it still does. It therefore raises `P_t`, and a rule spends it at its own rate over the following years instead of in one.

## 2. The rules

`fixedReal` is unchanged:

```
S_t = B_t
```

For the other three, year one of a memory-carrying rule still spends the plan's own budget (`S_0 = B_0` for Vanguard and Guyton-Klinger). After that:

**Percent of portfolio**

```
S_t = max( N_t + r · P_t ,  spendingFloorReal · priceLevel_t )
```

**Vanguard dynamic**

```
affordable_t = N_t + r · P_t
S_t = clamp( affordable_t ,  S_{t−1} · π_t · (1 + f) ,  S_{t−1} · π_t · (1 + c) )
```

In real terms that is `clamp(affordable, prev × (1 + f), prev × (1 + c))`, with `f` negative.

**Guyton-Klinger**

```
tentative_t = S_{t−1} · π_t
wr_t        = ( tentative_t − N_t ) / P_t            portfolio withdrawal rate
wr_t > 1.2 · r   →  S_t = S_{t−1} · 0.9              capital preservation: no raise, 10 % off
wr_t < 0.8 · r   →  S_t = tentative_t · 1.1          prosperity: the raise plus 10 %
otherwise        →  S_t = tentative_t
```

With `P_t ≤ 0` there is no rate to compare and `S_t = tentative_t`, as before.

**Income floor, all three**

```
S_t ← max( S_t ,  min( B_t , N_t ) )
```

No rule sets spending below what the household receives anyway, up to its own budget. Without it a Vanguard ceiling (+5 % a year) could hold a household at 80 % of its budget for years after a pension larger than that budget has started, and a Guyton-Klinger cut could reach into the pension. The floor stops at the budget: income above the budget is not forced into spending by the floor (the rule itself may still spend it, see `affordable_t`).

**Funding**

```
requested_t = S_t + E_t
netNeeded_t = requested_t − N_t        > 0: sold from the portfolio, grossed up for capital gains tax
                                       < 0: the surplus is reinvested
```

### Scheduled expenses stay outside the rule

Exactly as before: `E_t` is added after the rule has decided `S_t`. A roof repair is not a lifestyle decision a ceiling should clip, and it must not become next year's floor, so it never enters `S_{t−1}`. Under percent of portfolio the portfolio therefore pays `r · P_t + E_t`. This is the one way that rule can run dry without a spending floor.

## 3. Guyton-Klinger: what the guardrails are measured against

The guardrails compare the portfolio withdrawal rate `wr_t` with the **configured rate `r`**. They do not compare it with a rate measured in the first retirement year.

Options considered:

1. **A rate measured in year one**, `(B_0 − N_0) / P_0`. This is the textbook definition. It breaks on any plan with a bridge: retire at 60, pension at 67. The measured rate is the bridge rate, say 6.4 %. From 67 the portfolio pays 1–2 %, which reads as "more than 20 % below the initial rate" every year, so spending ratchets up 10 % a year until the portfolio is back to paying 5.1 % on top of the pension. The reference describes years that are over.
2. **Re-base the reference whenever `N_t` takes a scheduled step.** The reference is re-measured in the year a pension starts. That removes the ratchet, and with it the rule: after a hard bridge a path arrives at 67 with spending cut to 60 % of budget, the re-measured rate freezes exactly that level, and the household keeps living on it next to a seven-figure portfolio. That is the defect this note exists to fix (P10 spending of €2,178 a month at 67 beside €1.18M median real end assets). It also leaves `dsWithdrawalRate` without any effect.
3. **The configured rate** (chosen). `r` is the user's statement of what the portfolio can carry. It does not go stale when income changes. A pension starting drops `wr_t`, which can only ever read as prosperity: spending rises by 10 % a year until the portfolio pays at least `0.8 · r` again, then stops. That is bounded, it moves in the direction the household can afford, and it lands where the other two rules land (`N + r · P`). A pension starting can never trigger a cut. Income _ending_ (part-time work stops) raises `wr_t` and can trigger one, which is the correct direction too.

This was already simplification 1 of the engine's Guyton-Klinger ("year one spends the plan's budget; the rate is the reference the guardrails are measured against"), so the choice changes one term of one formula: `tentative / P` became `(tentative − N) / P`.

Known and unchanged: during a bridge the portfolio pays the whole budget, so a plan whose bridge rate is above `1.2 · r` is cut in those years. The guardrail is doing what it says. Whoever plans a deliberate bridge should set `r` to the rate they accept during it.

## 4. Invariants (all tested)

1. **No income, no change.** With `N_t = 0` each formula reduces to the old one term by term (`x + 0`, `(x − 0) / P`, `max(x, 0)`). For a plan without pensions or recurring income, all four rules reproduce asset percentiles captured before the change bit for bit (`fixtures/preIncomeRulesMaster.json`, captured at `f1beaf3`), with a one-off windfall and a care-cost window in the plan.
2. **Income floor.** `S_t ≥ min(B_t, N_t)` in every year of every sampled path, for all three rules.
3. **Displayed rate = rule rate.** The corridor tooltip shows `mean(max(0, S_t − N_t)) / mean(P_t)`, booked by the engine as `ruleWithdrawal` and `rulePortfolio` on the yearly ledger. Under percent of portfolio it reads `r` at every age.
4. **`fixedReal` unchanged**, with or without a pension, bit for bit.

## 5. What "spending" means

`spendingPercentiles` (and its real twin) are now **paid** spending:

```
paid_t = requested_t − shortfall_t
```

A path whose portfolio is gone shows what its income still covers. Before, it kept showing the budget it had asked for, so the P10 line of a plan in which four of ten paths run dry was a flat line at the budget. The corridor, the "spending spread" (P90 ÷ P10) and the four-strategy comparison read this series, so strategies are ranked on what they paid out.

The yearly ledger (`cashFlowMeans`) is unchanged: `expenses` is the request and `shortfall` the unpaid part, side by side.

## 6. What "success" means

A run **fails in the first year whose shortfall exceeds 1 % of the spending requested for that year** (`UNFUNDED_SPENDING_TOLERANCE = 0.01`). It succeeds if no year does and, when a bequest goal is set, real terminal assets reach it.

Before, a run failed when its balance was ≤ 0. Two things were wrong with that:

- A household with no assets whose indexed pension equals its budget failed in every run (0 %). With one euro less budget it succeeded in every run (100 %).
- "Balance is zero" and "could not pay" are different events as soon as there is income.

Why 1 %: it is small enough that nobody would call the year a failure (€50 a month on a €5,000 budget) and large enough to absorb rounding between an indexed pension and an indexed budget that are meant to be equal, and a final year that sells the last euro and comes up a few hundred short.

`depletionByAge` uses the same event (first unfunded year), so "Vermögen reicht bis" and `depletionSuccessRate` follow the same definition. In plans without income the old and new definitions name the same paths except for a path that empties in its final year with less than 1 % missing.

Before retirement only scheduled expenses are requested. A year fails there the same way: more than 1 % of that year's scheduled expenses could not be raised from savings and the portfolio.

## 7. The planned corridor

The floor and ceiling lines are the rule's bound on `S_t` **plus `E_t`** of that age (a fixed-euro scheduled expense is deflated with the plan's central inflation assumption). The band they are drawn over has always been total spending, so in every year with care costs the median sat above its own "ceiling". The "guaranteed floor" figure in the planner includes scheduled expenses at its reference age for the same reason.

The floor is a bound on what the rule _requests_. Paid spending drops below it once a path's portfolio is gone, which is what the caveat next to it says.

## 8. What moved

Same seed, 2,000 runs, this change alone (before → after). Monthly figures are real median / P10 spending in today's euros. The corrections listed in section 10 came afterwards and moved these figures by about one point of success more (default plan, Vanguard: 82.6 → 81.8).

**Default plan** (55, retire 60, €5,000 fixed pension from 67, €5,242 budget)

| Rule                 | Success       | Median at 67 / 80 / 90                        | P10 at 67 / 80 / 90                           | Median end assets, real |
| -------------------- | ------------- | --------------------------------------------- | --------------------------------------------- | ----------------------- |
| Fixed real           | 59.3 → 59.3   | 5,242 / 5,242 / 5,242 (unchanged)             | 5,242 → 5,242 / 5,242 → 2,330 / 5,242 → 1,720 | 226k → 226k             |
| Vanguard (default)   | 94.95 → 82.6  | 4,390 → 4,728 / 3,946 → 5,421 / 4,006 → 4,290 | 4,390 → 4,491 / 3,159 → 3,525 / 2,452 → 1,817 | 837k → 303k             |
| Guyton-Klinger       | 99.95 → 99.95 | 3,580 → 3,989 / 4,046 → 5,254 / 4,445 → 4,082 | 2,178 → 3,132 / 2,229 → 3,406 / 2,332 → 2,558 | 1,184k → 539k           |
| Percent of portfolio | 100 → 100     | 3,654 → 6,822 / 4,468 → 4,997 / 4,627 → 3,907 | 2,083 → 5,228 / 2,428 → 3,463 / 2,447 → 2,587 | 1,150k → 506k           |

How to read it:

- Fixed real: nothing about the rule changed. Its P10 now shows the pension-only years of the paths that ran dry.
- Vanguard: the household spends €1,475 a month more at 80 and leaves €534k less behind. Success falls 12 points because the −2.5 % floor keeps asking for last year's spending after a bad bridge, and the portfolio is no longer being refilled from the pension. The old 95 % measured under-spending.
- The fixed pension loses purchasing power every year. That is why median spending falls between 80 and 90 under every market-responsive rule: `N_t` shrinks in real terms.

**Demo plan** (52, retire 62, glide path to 40 % equity, €150k bequest goal, care costs from 82)

| Rule                 | Success       | Funded every year | Median end assets, real |
| -------------------- | ------------- | ----------------- | ----------------------- |
| Fixed real           | 77.65 → 77.65 | 84.85 → 84.85     | 732k → 732k             |
| Vanguard (default)   | 96.25 → 39.75 | 99.3 → 57.6       | 652k → 51k              |
| Guyton-Klinger       | 100 → 79.4    | 100 → 99.4        | 783k → 296k             |
| Percent of portfolio | 100 → 77.65   | 100 → 99.3        | 806k → 278k             |

The demo plan holds 40 % equity in retirement (about 2 % real return) and takes 5 % a year on top of the pension, then pays €26k a year of care costs from 82. Under the old rule the pension surplus was reinvested and paid for the care costs. Its `dsWithdrawalRate` of 5 % was tuned against that behaviour and needs re-tuning (`src/lib/plans/demoPlan.ts`). Measured after all corrections of this series, the demo plan under Vanguard reaches 39 % at a rate of 5 %, 68 % at 4 %, 83 % at 3.5 % and 93 % at 3 %; the default plan 82 %, 91 %, 93 % and 94 %.

## 9. For other consumers

- `SimulationResults.spendingPercentiles*` are paid spending. Copy that calls them a "budget" or "Bedarf" is no longer right.
- `successRate`, `depletionSuccessRate` and `depletionByAge` follow section 6. A derivation of "exhaustion" from `assetPercentiles.p10 ≤ 0` is a different event and disagrees for plans whose income covers the budget.
- `AnnualCashFlow.ruleWithdrawal` / `rulePortfolio` are new and optional; results persisted earlier lack them and the tooltip falls back to the gross rate under its old label.
- `dsWithdrawalRate` now means "share of the portfolio taken per year, on top of pensions and recurring income". 5 % of the portfolio on top of a pension is a higher draw than 5 % of the portfolio as the whole budget; the default may deserve a second look.

## 10. Corrections that came with it

Not about withdrawal rules, but from the same review and visible in the same numbers. Each is documented where it lives and tested in the file named.

**Horizon** (`buildCashFlowSeries`, `normalizeSimulationParams`; `engine-horizon.test.ts`). Nothing is pulled into `currentAge..endAge` any more. A recurring flow counts for the overlap of its window with the horizon; a single payment counts only if its age lies inside. Flows keep their ages as written, so a pension in payment keeps its start for the cohort year, its growth index and its frozen allowances. A one-off income booked for `endAge` is credited at the end of the final year instead of being dropped.

**Budget by shape** (`isLifetimeExpenseFlow`). Every recurring expense without an age window is retirement budget: charged from retirement on and handed to the rule, also when it has a growth rate or a fixed euro amount. `S_t` in section 2 starts from that budget:

```
B_t = ( Σ plain items + Σ linked items with growth · (1 + g)^t ) · priceLevel_t  +  Σ fixed items · (1 + g)^t
```

`t` counts from the plan's first year, so an item with growth has grown by the time retirement starts.

**Staleness** (`areSimulationParamsEqual`). Compares both sides as the engine reads them. `results.params` is the engine's normalised copy; a plan it had to repair no longer looks stale forever.

**Income tax on taxed flows** (`buildCashFlowSeries`; `incomeTaxAssessment.test.ts`). One assessment per year, in the year a flow is booked for (a one-off taxed as ordinary income was assessed in the year it is credited, one later). Everything under the one-fifth rule in a year is one sum. The year's base is put on one scale first:

```
base_y (today's €) = Σ linked amounts + Σ fixed amounts / (1 + π)^y
tax_y  (today's €) = tariff( base_y )
flow's share       = tax_y · amount_today / base_y           fixed flows: · (1 + π)^y back into the euros of year y
```

`π` is the plan's expected inflation and the tariff is assumed to be indexed. Approximation: the deflator is the expected price level, the same for every path, while linked flows are re-priced with each path's realised one. A fixed pension's own tax (taxable share × rate) is unit-free and unchanged.

**Real series** (`runMonteCarloSimulation`; `engine-real.test.ts`). An asset value is an end-of-year balance and is deflated by the end-of-year price level; it used to be divided by the opening level, which made a portfolio earning exactly inflation look 2.5 % richer. Spending and every other flow stay at the opening level they are priced at. `inflationIndexP50[i]` is the opening level of age `i`. In the real ledger `investmentReturn` is the real return, so each year closes where the next one opens. The bequest goal is measured on the corrected series and is therefore about one year of inflation harder to reach.

**Defaults** (`src/types/index.ts`). Abgeltungsteuer 26.25 → 26.375 (25 % × 1.055) and Besteuerungsanteil 0.83 → 0.90, the share of the default plan's own 2038 cohort. Stored plans keep what they have.

**Default withdrawal rate** (2026-11-10, `src/types/index.ts`). 5 % → 4 % for new plans. Under the rule of section 2 the rate is what the portfolio pays on top of pensions and other income; at 5 % the shipped default plan ended at 82 % (2,000 runs: 81.8 %), at 4 % it is 91 % (5,000 runs: 90.94 %, worst decile ends with 27,711 € instead of nothing). Stored plans keep their rate. The example plan (`demoPlan.ts`) sets 3.5 % so that, with its bequest goal, it stays in the "watch" band (83 %). The engine master in `engine-golden.test.ts` stays frozen at 5 % (`MASTER_WITHDRAWAL_RATE`), so its arrays keep documenting engine changes only.
