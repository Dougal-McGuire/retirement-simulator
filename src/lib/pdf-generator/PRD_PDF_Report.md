# PRD — Redesigned Retirement Projection PDF (for mass-affluent end clients, age 50–70)

## 1) Background & problem

Your current PDF already contains the right inputs and analytics (Monte-Carlo with 5,000 runs, success probability, percentile curves, spending breakdown, risk & recommendations). But it reads like an internal analysis, not a client-facing deliverable. Information appears out of order (e.g., the “Executive Summary” shows as section 3; the TOC lists 7 sections while the document actually goes through section 9), key questions (“Am I ok?” “What should I do next?”) are not answered on page one, and visuals feel generic.&#x20;

### Who this is for

- **Primary audience:** non-expert individuals aged 50–70 planning retirement in the EU (DACH conventions: decimal comma, day–month–year dates, EUR currency). They want a clear “am I on track?” and 2–3 concrete actions.
- **Secondary audience:** financial advisers who use the PDF with clients; they need defensible numbers, assumptions, and an appendix.

### Goals

- Deliver a **one-glance answer** within 10 seconds.
- Make **actions** unmistakable and prioritized.
- Preserve rigor (methodology & assumptions) without derailing the story.

### Non-goals

- Building a fully interactive report inside the PDF (that lives in-app); the PDF is a **polished snapshot** of the current plan.

---

## 2) Success metrics (measurable)

1. **Comprehension**: ≥80% of test readers correctly answer 3 questions after page 1: (a) plan health score, (b) retirement funding gap (if any), (c) top action.
2. **Time-to-insight**: median <10s to find plan health and top action.
3. **Advisor usability**: ≥80% rate the structure “clear/very clear”.
4. **Reduction in support**: −30% “what does this mean?” tickets within 60 days.

---

## 3) Content architecture (new order)

### Page 1 — **Cover + Plan Health at a glance**

- **Header:** “Retirement Plan Snapshot — \[Client first name], \[Age] — Generated \[DD.MM.YYYY]”
- **Plan Health Score (big dial)**: e.g., **74/100** with textual label (Solid / Needs Attention).
  - Derived from **Success Probability** + **bridge-years liquidity** + **spending rate**.

- **Green/amber/red** callouts (4 tiles):
  1. **Success probability** (e.g., 73,6 %) with plain-language verdict. _(Your current doc shows this but not on page 1; put it here.)_&#x20;
  2. **Earliest fully funded retirement age** and **gap at target age** (€, if retiring earlier than pension).
  3. **Bridge years 60–66**: cash needed before pension starts (clearly labeled as “gap years”). _(Your doc notes no pension 60–66 on p.9 — elevate to page 1.)_&#x20;
  4. **Top 2 actions** (e.g., “Increase savings +€800/mo” and “Shift 10% to equities”).

- **Small print**: concise disclaimer & methodology pointer.

### Page 2 — **Your situation & key assumptions**

- Demographics (age 55, retire at 60, pension at 67), starting assets (630.000 €), savings (48.000 €/yr), expected pension (5.000 €/mo). _(Now spread across pp.3–5; consolidate here.)_&#x20;
- Market & inflation assumptions (7,0 % / 15,0 % σ, 3,0 % inflation), tax highlights. One-line “what this means”.&#x20;

### Page 3 — **Cash-flow timeline (with “bridge” focus)**

- **Ribbon chart** year-by-year: contributions (pre-60), withdrawals (60–66), pension inflows (from 67), spending (inflation-adjusted).
- **Bridge-years panel**: “You need €X total between 60–66; funded by Y% portfolio / Z% cash reserve.”
- **Withdrawal rule** noted (e.g., fixed real spending vs guardrails).

### Page 4 — **Will the money last? (probabilistic view)**

- Percentile chart **P10/P50/P90** re-styled (thicker median line, shaded bands, clear legend) + table for milestone ages (60, 67, 75, 85). _(You already show P10/P50/P90 and a milestone table on pp.6–8; keep, simplify, and move here.)_&#x20;
- **Plain-language readout**: “In 9 of 10 tough markets (P10), assets last to \~age 82; in typical markets (P50), to 90+.”

### Page 5 — **Spending plan**

- Stacked bar (“needs” vs “wants” vs “luxuries”) with categories beneath. _(You have category bars on p.10 and a table on p.11; reframe into needs/wants/luxuries to support flexible spending.)_&#x20;
- Inflation impact mini-callouts (10- and 20-year projections).&#x20;

### Page 6 — **Risks & sensitivities**

- **Tornado chart**: which variables move success rate most (returns, inflation, retirement age, savings rate).
- **Stress tests** (3 cards): high inflation, low returns, extra longevity, each with delta to success rate. _(You show a table on p.13 — visualize and summarize.)_&#x20;
- **Early-warning indicators** (keep your list but tighter): “Spending >5% of portfolio”, “Below P10 path”, etc.&#x20;

### Page 7 — **Recommendations (prioritized)**

- **Priority matrix** (Impact × Effort) with 3–5 items, each with quantified effect on score (e.g., “+6 points if savings +€800/mo”). _(You already have a matrix and next steps on pp.14–15; keep but quantify uplift.)_&#x20;
- Clear **Next 30/90 days** checklist.

### Pages 8–10 — **Appendix & disclosures**

- **Methodology** (Monte-Carlo, parameters, success definition) & formulae, but condensed; link to long-form. _(You have a good appendix on pp.16–17 — keep, tighten, and move.)_&#x20;
- **Glossary**, **tax notes**, **limitations** (e.g., normal distribution may understate tails).&#x20;

---

## 4) Component specifications

### 4.1 Plan Health Score

- **Inputs:** success probability; 1-year liquidity coverage for bridge years; sustainable withdrawal rate; concentration risk.
- **Scale:** 0–100 with 3 bands (0–59 Red, 60–79 Amber, 80–100 Green).
- **Copy rule:** Always pair the number with a short verdict + one “do this next”.

### 4.2 Success probability

- Display as **big number** on p.1; show small explainer: “% of 5,000 simulations where assets last to age 90”. _(Matches your definition.)_&#x20;

### 4.3 Bridge-years card

- **Definition:** years between retirement and pension start (e.g., 60–66). _(From your distribution phase description.)_&#x20;
- **Data:** cumulative net withdrawals required; recommended cash bucket size (e.g., 2–3 years of spending).

### 4.4 Charts (visual language)

- Median line bold; P10–P90 band shaded.
- Axes formatted with **European numerals** (thousand separators, decimal comma).
- Annotations at key ages (60, 67).
- Every chart has a **one-sentence takeaway** beneath it.

### 4.5 Recommendations matrix

- Each item includes **“Why this?”** and **expected uplift** to the Plan Health Score or success probability (based on quick sensitivity deltas you already compute in stress tests).&#x20;

---

## 5) Visual design & layout

- **Grid:** 12-column; 24px baseline; generous white space.
- **Typography:** Headings 16–24pt (PDF), body 11–12pt for print readability.
- **Color:** Neutral canvas; 1 brand accent; accessibility contrast ≥4.5:1.
- **Iconography:** Simple line icons for “pension,” “bridge years,” “actions.”
- **Tables:** Zebra striping; highlight rows for milestone ages (you already bold ‘60 (Retirement)’ — keep).&#x20;
- **Number formatting:** EUR with non-breaking space before symbol if you standardize “1 120 414 €” or keep current “1.120.414 €” consistently; date as DD.MM.YYYY.

---

## 6) Copy & tone guidelines

- **Plain language first**, finance terms second (tooltip in app; short footnotes in PDF).
- Avoid passive voice; prefer “You can…” “This would…”
- **Explain uncertainty** without math-heavy jargon (e.g., “9 in 10 tough markets…”).
- Keep **disclaimers** brief on p.1; move legal text to appendix. _(You currently open with multiple caveats — reduce on p.1.)_&#x20;

---

## 7) Data & calculation requirements (source of truth)

- Inputs: age, target retirement age, pension start, current portfolio (€), savings (€/yr), spending plan (monthly + annual categories), tax rates, return & volatility, inflation. _(All already present across pp.3–5, 10–11.)_&#x20;
- Engine: Monte-Carlo (5,000 runs), annual returns with inflation and tax; success defined as positive balance to age 90. _(Matches your methodology.)_&#x20;
- Derived: Plan Health Score, bridge-years cash need, sensitivity deltas, earliest funded retirement age.

---

## 8) Accessibility, localization, and PDF quality

- **PDF/UA**: tagged headings, alt text for charts, reading order set.
- **Fonts embedded**, no bitmap text.
- **Localization**: language bundle for labels; currency & number format by locale (DE/AT/CH as default based on your current formatting); allow English export.
- **Hyperlinks**: table-of-contents links; “Learn more about assumptions” link to help center.

---

## 9) Acceptance criteria (examples)

### Structure & navigation

- [ ] Page 1 shows **Plan Health**, success probability, bridge-years need, and two actions.
- [ ] Table of contents page numbers and section numbers **match** actual sections (no “Section 3” as first content page). _(Fix current mismatch.)_&#x20;
- [ ] Every chart has a one-sentence takeaway.

### Numbers & consistency

- [ ] Success probability equals simulated share of runs with assets >0 at age 90.
- [ ] Milestone table shows ages 60/67/75/85/90 with P10/P50/P90; values match the chart within rounding. _(You currently present a long table; we’ll subset.)_&#x20;
- [ ] Spending totals reconcile to the stated annual spend; inflation projections (10y/20y) match formula on p.11’s assumptions.&#x20;
- [ ] All numbers obey locale formatting; date on cover matches the metadata date.

### Readability & compliance

- [ ] Minimum body text ≥11pt; contrast AA.
- [ ] PDF contains alt text for every chart; passes PAC 2021 (or similar) check.

---

## 10) Delivery scope

### MVP (4–6 pages)

- Page 1 “Plan Health”, Page 2 “Assumptions”, Page 3 “Cash-flow & bridge years”, Page 4 “P10–P90 projection”, Page 5 “Spending plan”, Page 6 “Recommendations”.
- Single locale (DE) + EUR; success probability & bridge need computed.

### V1.1 (polish)

- Sensitivity tornado, quantified uplift per action, glossary.

### V1.2 (localization & advisor)

- Multilingual labels (EN, DE), advisor branding area, optional “Advisor notes” section.

---

## 11) Specific improvements grounded in your current report (quick audit)

- **Move** success probability (73,6 %) from deep content to page 1 with a verdict. _(Currently appears after several pages.)_&#x20;
- **Elevate** “gap years 60–66” from distribution phase notes to a prominent card with cash need and funding source.&#x20;
- **Tighten** the percentile chart (p.6) and milestone table (pp.7–8) into one page with a takeaway sentence; keep bold highlight for “60 (Retirement)”.&#x20;
- **Refactor** spending (pp.10–11) into Needs/Wants/Luxuries with inflation callouts; keep category details in a collapsible appendix or smaller table.&#x20;
- **Turn** the stress-test table (p.13) into three simple cards showing the delta to success rate and a plain-language note (“If inflation averages +2 pp higher, your plan health drops \~10 points”).&#x20;
- **Fix** TOC and section numbering inconsistencies (TOC lists 7 sections; document goes to section 9).&#x20;
- **Consolidate** methodology (pp.16–17) and keep the Box-Muller and formulae, but push into appendix; replace with a one-liner in the main flow.&#x20;

---

## 12) Example copy (Page 1 tiles)

- **Plan health: 74/100 (Solid)** — You’re broadly on track.
- **Success probability: 73,6 %** — In 5,000 market paths, your money lasts to age 90 in \~74% of cases.&#x20;
- **Bridge years (60–66): €XXX needed** — Before pension begins at 67, you’ll fund spending from the portfolio; we recommend a two-year cash bucket.&#x20;
- **Do next:** Increase savings by €800/mo and raise equity share by 10 pp; expected lift +6–10 points to plan health. _(Quantify via sensitivity deltas.)_&#x20;
