# UI and cash-flow consolidation

Goal: retain existing capabilities, simplify dashboard controls, and make simulated taxes and funding inspectable.

Design: keep the five existing destinations, use accessible tabs, show quick levers only alongside results, and restore account/language/report tools in one menu. Replace the reconstructed gross-pension cash-flow table with annual engine-booked averages. Means preserve the cash and portfolio identities across stochastic paths; label them explicitly and keep spending percentiles separate. Retain saved-plan compatibility and the existing one-off income timing convention.

## Implementation

- [x] Add deterministic regression tests for the tax ledger, depletion shortfall, and pension cohort timing.
- [x] Extend the engine with annual nominal/real cash-flow means, reporting the actual sales and taxes. Test both balance identities, path-wise inflation, and insufficient funds.
- [x] Correct pension start-year handling and update the explicitly fixed income-tax tariff to 2026 using §32a EStG. Preserve the existing effective-rate pension approximation.
- [x] Replace CashflowCard with an annual breakdown and all-years table. Remove synthetic portfolio draw/available cash columns from SpendingSection; use the engine-backed first-year withdrawal KPI.
- [x] Consolidate navigation, hide duplicate quick controls while editing, restore secondary actions, disable ignored historical-model controls, show loading/error/stale-result state, and support mobile layouts.
- [x] Run full Jest, lint, typecheck, build and targeted/full Playwright checks. Document scope, evidence, and remaining model limits in docs/reviews/2026-09-06-review.md; create a reviewable PR.

Constraints: Next.js 16 / React 19 / Node 24; use existing Radix and translation patterns; no dependency upgrades, plan-format reset, direct main changes, or production deployment.
