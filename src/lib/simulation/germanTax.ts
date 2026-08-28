/**
 * German income-tax mechanics used by cash flows.
 *
 * Everything here is a pure function of euros and calendar years. Amounts are
 * quoted in today's euros, so the tariff is the current one and the brackets
 * are implicitly assumed to move with inflation.
 */

/** § 32a EStG, tariff 2025, for a single assessment. Rounded down to the euro. */
export function incomeTaxSingle(taxable: number): number {
  const x = Math.floor(Math.max(0, taxable))
  if (x <= 12_096) return 0
  if (x <= 17_443) {
    const y = (x - 12_096) / 10_000
    return Math.floor((932.3 * y + 1_400) * y)
  }
  if (x <= 68_480) {
    const z = (x - 17_443) / 10_000
    return Math.floor((176.64 * z + 2_397) * z + 1_015.13)
  }
  if (x <= 277_825) return Math.floor(0.42 * x - 10_911.92)
  return Math.floor(0.45 * x - 19_246.67)
}

/** The annual income tax on `taxable`, with splitting for a jointly assessed couple. */
export function incomeTax(taxable: number, splitting = false): number {
  return splitting ? 2 * incomeTaxSingle(taxable / 2) : incomeTaxSingle(taxable)
}

/**
 * Tax on `gross` received on top of `rest` (the year's other taxable income),
 * i.e. the marginal tax the extra income triggers.
 */
export function ordinaryIncomeTax(gross: number, rest: number, splitting = false): number {
  if (gross <= 0) return 0
  const base = Math.max(0, rest)
  return Math.max(0, incomeTax(base + gross, splitting) - incomeTax(base, splitting))
}

/**
 * § 34 Abs. 1 EStG, the one-fifth rule for extraordinary income (a severance
 * payment, a pension lump sum): one fifth of the sum is taxed on top of the
 * other income and the resulting extra tax counted five times. Negative other
 * income first eats into the sum.
 */
export function oneFifthRuleTax(gross: number, rest: number, splitting = false): number {
  if (gross <= 0) return 0
  if (rest < 0) {
    return 5 * incomeTax(Math.max(rest + gross, 0) / 5, splitting)
  }
  return Math.max(0, 5 * (incomeTax(rest + gross / 5, splitting) - incomeTax(rest, splitting)))
}

/**
 * § 22 Nr. 1 EStG: the taxable share of a statutory pension, by the year it
 * starts. 50 % for 2005, +2 pp a year to 80 % in 2020, +1 pp to 82 % in 2022,
 * then +0.5 pp a year (Wachstumschancengesetz) until 100 % from 2058.
 */
export function besteuerungsanteil(startYear: number): number {
  const year = Math.round(startYear)
  if (year <= 2005) return 0.5
  if (year <= 2020) return (50 + 2 * (year - 2005)) / 100
  if (year <= 2022) return (80 + (year - 2020)) / 100
  return Math.min(1, (82 + 0.5 * (year - 2022)) / 100)
}

export interface Versorgungsfreibetrag {
  /** Share of the annual Versorgungsbezug that is tax-free… */
  share: number
  /** …up to this cap, in euros a year. */
  cap: number
  /** Plus this fixed supplement, in euros a year. */
  supplement: number
}

/**
 * § 19 Abs. 2 EStG: the Versorgungsfreibetrag and its Zuschlag for company
 * pensions, by the year the pension starts. 40 % / €3,000 / €900 in 2005,
 * shrinking to nothing by 2058 — quickly until 2020 (1.6 pp / €120 / €36 a
 * year), slower to 2022 (0.8 pp / €60 / €18), then 0.4 pp / €30 / €9 a year.
 */
export function versorgungsfreibetrag(startYear: number): Versorgungsfreibetrag {
  const year = Math.round(startYear)
  let share = 40
  let cap = 3_000
  let supplement = 900
  if (year > 2005) {
    const fast = Math.min(year, 2020) - 2005
    share -= 1.6 * fast
    cap -= 120 * fast
    supplement -= 36 * fast
  }
  if (year > 2020) {
    const medium = Math.min(year, 2022) - 2020
    share -= 0.8 * medium
    cap -= 60 * medium
    supplement -= 18 * medium
  }
  if (year > 2022) {
    const slow = year - 2022
    share -= 0.4 * slow
    cap -= 30 * slow
    supplement -= 9 * slow
  }
  return {
    share: Math.max(0, Math.round(share * 10) / 10) / 100,
    cap: Math.max(0, Math.round(cap)),
    supplement: Math.max(0, Math.round(supplement)),
  }
}
