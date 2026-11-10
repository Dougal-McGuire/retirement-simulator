import { readFile } from 'node:fs/promises'
import type { Download, Locator, Page, Request } from '@playwright/test'
import {
  SECTIONS,
  enterCompare,
  expect,
  gotoWorkspace,
  isInViewport,
  openPanel,
  openSection,
  readStoredParams,
  sectionHeading,
  test,
  waitForLeversMeasured,
  waitForResults,
  waitForScrollSettled,
} from './helpers/workspace'

/**
 * The one-page workspace's result, levers and compare flows, plus the
 * assumption-editor flows that survive unchanged inside the edit panel
 * (spec §9.1, dashboard.spec). Default viewport: 1280×720 — rail and docked
 * panel.
 */

const QUICK_LEVERS = ['Retirement age', 'Annual savings', 'Monthly spending', 'Expected return']

test.describe('one-page workspace', () => {
  test('shows the result first and keeps the quick levers further down', async ({ page }) => {
    await gotoWorkspace(page)
    await expect(page.getByTestId('verdict')).toContainText('of simulated paths')
    await expect(page.getByTestId('fan-chart')).toBeVisible()
    expect(await isInViewport(page.getByTestId('quick-levers'))).toBe(false)

    await openSection(page, 'levers')
    const quick = page.getByTestId('quick-levers')
    for (const name of QUICK_LEVERS) {
      await expect(quick.getByRole('slider', { name, exact: true })).toBeVisible()
    }

    // Stellschrauben reads top to bottom: try quickly → what moves the needle
    // → recommendations.
    const levers = page.locator('#levers')
    let previous = -Infinity
    for (const block of ['quick-levers', 'lever-list', 'recommendations']) {
      const box = await levers.getByTestId(block).boundingBox()
      expect(box, `${block} rendered`).not.toBeNull()
      expect(box!.y, `${block} below the previous block`).toBeGreaterThan(previous)
      previous = box!.y
    }
  })

  test('section index scrolls and marks the current section', async ({ page }) => {
    await gotoWorkspace(page)
    await expect(page.getByTestId('section-link-result')).toHaveAttribute(
      'aria-current',
      'location'
    )

    for (const id of [...SECTIONS.slice(1), 'result' as const]) {
      const link = page.getByTestId(`section-link-${id}`)
      await link.click()
      const heading = sectionHeading(page, id)
      await expect(heading).toBeFocused()
      await expect(link).toHaveAttribute('aria-current', 'location')
      await expect(page).toHaveURL(new RegExp(`#${id}$`))
      await waitForScrollSettled(page)
      // Still current once the smooth scroll has landed and scroll-spy resumed.
      await expect(heading).toBeInViewport()
      await expect(link).toHaveAttribute('aria-current', 'location')
      await expect(page.locator('[aria-current="location"]')).toHaveCount(1)
    }
  })

  test('scrubbing the age slider recomputes live into the working copy', async ({ page }) => {
    await gotoWorkspace(page)
    await openSection(page, 'levers')

    const quick = page.getByTestId('quick-levers')
    const slider = quick.getByRole('slider', { name: 'Retirement age', exact: true })
    await slider.focus()
    await slider.press('ArrowRight')
    await slider.press('ArrowRight')

    // The lever's readout follows immediately…
    await expect(slider).toHaveAttribute('aria-valuenow', '62')
    await expect(quick).toContainText('62')

    // …and the debounced auto-run persists the edit into the working copy.
    await expect.poll(async () => (await readStoredParams(page))?.retirementAge).toBe(62)
  })

  test('toggles the more-sliders row', async ({ page }) => {
    await gotoWorkspace(page)
    await openSection(page, 'levers')

    const toggle = page.getByTestId('more-sliders-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('advanced-params')).toHaveCount(0)
    await toggle.click()

    const advanced = page.getByTestId('advanced-params')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(advanced).toBeVisible()
    await expect(advanced.getByRole('slider', { name: 'Return volatility' })).toBeVisible()
    await expect(advanced.getByRole('checkbox')).toBeVisible()
    // "Runs" is a precision setting: it stays in the Market & taxes panel only.
    await expect(advanced.getByRole('slider', { name: 'Simulation runs' })).toHaveCount(0)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('advanced-params')).toHaveCount(0)
  })

  test('measures lever effects and applies one as an undoable draft', async ({ page }) => {
    test.setTimeout(90000) // three extra scenario runs behind a settle delay
    await gotoWorkspace(page)
    await openSection(page, 'levers')

    // Each lever arrives with its measured delta once the extra runs settle.
    const list = await waitForLeversMeasured(page)
    await expect(list.getByTestId('stress-lever')).toHaveCount(3)
    const lever = list.locator('[data-testid="stress-lever"][data-lever="laterRetirement"]')
    await expect(lever).toContainText('Retire 2 years later')
    await expect(lever.getByTestId('stress-lever-delta')).toContainText('pts')

    await lever.getByTestId('stress-lever-apply').click()

    // The lever landed in the working copy (a draft), same as the slider.
    await expect.poll(async () => (await readStoredParams(page))?.retirementAge).toBe(62)
    await expect(page.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')

    // "Übernehmen" can be undone: only the lever's own keys go back.
    const applied = page.getByTestId('lever-applied-toast')
    await expect(applied).toContainText('Applied “Retire 2 years later” – not saved yet.')
    const before = await readStoredParams(page)
    await applied.getByTestId('lever-applied-toast-undo').click()
    await expect.poll(async () => (await readStoredParams(page))?.retirementAge).toBe(60)
    const after = await readStoredParams(page)
    expect(after?.annualSavings).toBe(before?.annualSavings)
    expect(after?.cashFlows).toEqual(before?.cashFlows)
  })

  test('switches every figure between nominal and real from the rail', async ({ page }) => {
    await gotoWorkspace(page)

    const chart = page.getByTestId('fan-chart')
    await expect(chart).toBeVisible({ timeout: 30000 })

    // At ≥1024 the one display switch sits in the rail footer.
    const toggle = page.getByTestId('display-toggle')
    await expect(toggle).toBeVisible()
    expect((await toggle.boundingBox())!.x).toBeLessThan(184)
    const real = toggle.getByRole('radio', { name: "Today's €" })
    const nominal = toggle.getByRole('radio', { name: 'Nominal' })
    await expect(nominal).toHaveAttribute('aria-checked', 'true')

    await real.click()
    await expect(real).toHaveAttribute('aria-checked', 'true')
    await expect(nominal).toHaveAttribute('aria-checked', 'false')
    // The chart legend follows the central setting.
    await expect(chart).toContainText('Real')

    await nominal.click()
    await expect(chart).toContainText('Nominal')
  })

  test('the bridge recommendation quotes its amount in the switch’s unit', async ({ page }) => {
    await gotoWorkspace(page)
    await openSection(page, 'levers')
    const bridge = page
      .getByTestId('recommendations')
      .locator('[data-recommendation="bridgeLiquidity"]')
    // The amount is what the simulation's ledger pays out of the portfolio in
    // the seven years 60–66 before the statutory pension starts — the mean of
    // all runs, tax on gains included — in the unit of the switch. That it is
    // exactly the ledger's sum is asserted where the ledger can be read
    // (`src/lib/transformers/__tests__/reportDisplayReal.test.ts`); here: it
    // is quoted, labelled with its unit, and follows the switch.
    const quoted = async (unit: string) =>
      Number(
        (await bridge.innerText())
          .match(new RegExp(`pays out €([\\d,]+) in ${unit}`))?.[1]
          .replace(/,/g, '')
      )

    await expect(bridge).toContainText(/pays out €[\d,]+ in nominal euros/)
    const nominal = await quoted('nominal euros')
    expect(nominal).toBeGreaterThan(0)

    await page.getByTestId('display-toggle').getByRole('radio', { name: "Today's €" }).click()
    await expect(bridge).toContainText(/pays out €[\d,]+ in today's euros/)
    await expect(bridge).not.toContainText('nominal euros')
    const real = await quoted("today's euros")
    // The same withdrawals at today's prices: less than at each year's prices.
    expect(real).toBeGreaterThan(0)
    expect(real).toBeLessThan(nominal)
  })

  test.describe('PDF report', () => {
    /**
     * Opens the Menu, clicks "Generate Report" and waits for `settled`.
     * Returns its value and every request the browser made meanwhile (page
     * and workers).
     */
    const generateReport = async <T>(
      page: Page,
      settled: (menu: Locator) => Promise<T>
    ): Promise<{ value: T; requests: Request[] }> => {
      const requests: Request[] = []
      const record = (request: Request) => requests.push(request)
      page.context().on('request', record)
      await page.getByTestId('dashboard-tools').click()
      const menu = page.getByRole('dialog', { name: 'Report and settings' })
      const button = menu.getByTestId('generate-report')
      await expect(button).toHaveText('Generate Report')
      await button.click()
      const value = await settled(menu)
      await expect(button).toHaveAttribute('aria-busy', 'false')
      page.context().off('request', record)
      if (await menu.isVisible()) await page.keyboard.press('Escape')
      return { value, requests }
    }

    const savedReport = async (download: Download) => ({
      filename: download.suggestedFilename(),
      bytes: await readFile((await download.path())!),
    })

    test('is built in this browser, in the unit of the € switch, and sends nothing', async ({
      page,
    }) => {
      test.setTimeout(120000) // two reports; the first loads the report chunk, worker and fonts
      await gotoWorkspace(page)
      await expect(page.getByTestId('fan-chart')).toBeVisible({ timeout: 30000 })
      const toggle = page.getByTestId('display-toggle')
      const appOrigin = new URL(page.url()).origin

      const generate = async () => {
        const downloadPromise = page.waitForEvent('download', { timeout: 90000 })
        const { value, requests } = await generateReport(page, async (menu) => {
          // The button says what it is doing while the file is built.
          await expect(menu.getByTestId('generate-report')).toHaveAttribute('aria-busy', 'true')
          await expect(menu.getByTestId('generate-report')).toHaveText('Creating report…')
          return savedReport(await downloadPromise)
        })
        return { ...value, requests }
      }

      const expectLocalPdf = (report: Awaited<ReturnType<typeof generate>>) => {
        expect(report.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
        expect(report.bytes.length).toBeGreaterThan(30_000)
        // The plan stays here: nothing is posted anywhere — not to the app's
        // own origin (there is no report endpoint any more) and not elsewhere.
        const sent = report.requests
          .filter((request) => request.method() !== 'GET')
          .map((request) => `${request.method()} ${request.url()}`)
        expect(sent.filter((entry) => entry.includes(appOrigin))).toEqual([])
        expect(sent).toEqual([])
        // What is fetched (report chunk, worker, fonts) comes from the app
        // itself, and none of it is an API route (the sign-in control's own
        // session check aside).
        const fetched = report.requests
          .map((request) => request.url())
          .filter((url) => !/^(blob|data):/.test(url))
        expect(fetched.filter((url) => new URL(url).origin !== appOrigin)).toEqual([])
        expect(fetched.filter((url) => /\/api\/(?!auth\/)/.test(url))).toEqual([])
        return fetched
      }

      // Today's €: the file name says so.
      await toggle.getByRole('radio', { name: "Today's €" }).click()
      const real = await generate()
      const firstFetches = expectLocalPdf(real)
      expect(real.filename).toMatch(
        /^retirement-report-base-plan-todays-euros-\d{4}-\d{2}-\d{2}\.pdf$/
      )
      // The first report brings its four fonts from the app's own origin.
      const fonts = firstFetches.filter((url) => url.endsWith('.ttf'))
      expect(fonts).toHaveLength(4)
      for (const url of fonts) expect(new URL(url).pathname).toMatch(/^\/_next\/static\/media\//)

      // Nominal: the same plan, no suffix — and a different document.
      await toggle.getByRole('radio', { name: 'Nominal' }).click()
      const nominal = await generate()
      expectLocalPdf(nominal)
      expect(nominal.filename).toMatch(/^retirement-report-base-plan-\d{4}-\d{2}-\d{2}\.pdf$/)
      expect(nominal.bytes.equals(real.bytes)).toBe(false)
    })

    test('says why a report failed, and the next click works', async ({ page }) => {
      test.setTimeout(120000)
      await gotoWorkspace(page)
      await expect(page.getByTestId('fan-chart')).toBeVisible({ timeout: 30000 })

      // The report's fonts cannot be fetched (offline, say).
      const fontFiles = '**/_next/static/media/Inter-*.ttf'
      await page.context().route(fontFiles, (route) => route.abort('internetdisconnected'))

      const failed = await generateReport(page, async (menu) => {
        const alert = menu.getByTestId('generate-report-error')
        await expect(alert).toBeVisible({ timeout: 90000 })
        return alert.innerText()
      })
      // A catalog sentence — not an exception's text.
      expect(failed.value).toBe(
        "The report's fonts could not be loaded. Check your connection and try again."
      )

      // Back online: the same button now delivers the file.
      await page.context().unroute(fontFiles)
      const downloadPromise = page.waitForEvent('download', { timeout: 90000 })
      const retried = await generateReport(page, async (menu) => {
        const report = await savedReport(await downloadPromise)
        await expect(menu.getByTestId('generate-report-error')).toHaveCount(0)
        return report
      })
      expect(retried.value.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    })
  })

  test('enters compare, gains a challenger plan and shows delta KPIs', async ({ page }) => {
    test.setTimeout(90000) // both compared plans re-run in full
    await gotoWorkspace(page)

    const compare = await enterCompare(page)

    // One plan only: "+ Add plan" forks the base so there is a challenger.
    await compare.getByRole('button', { name: /Add plan/ }).click()

    // Both plans re-run; the delta strip and the diff table arrive together.
    await expect(compare.getByText('Success rate')).toBeVisible({ timeout: 45000 })
    await expect(compare.getByText('Median end wealth')).toBeVisible()
    await expect(compare.getByRole('table')).toContainText('Retirement age')
    await expect(compare.getByRole('table')).toContainText('Withdrawal rule')

    await page.getByTestId('compare-exit').click()
    await expect(page.getByTestId('compare-view')).toHaveCount(0)
    await expect(page).not.toHaveURL(/#compare/)
    await expect(page.locator('#result')).toBeVisible()
    await expect(page.getByTestId('run-button')).toBeVisible()
  })

  test('runs on demand from the Run button', async ({ page }) => {
    await page.goto('/en/simulation')
    await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })

    // The header status says when results are current again.
    await page.getByTestId('run-button').click()
    await expect(page.getByTestId('run-button')).toBeEnabled({ timeout: 30000 })
    await expect(page.getByTestId('run-status')).toHaveText('Updated')
  })
})

test.describe('working copy', () => {
  test('keeps edits in a working copy until they are saved to the plan', async ({ page }) => {
    await gotoWorkspace(page)

    // Edit through the savings panel.
    await openPanel(page, 'savings')
    const assets = page.locator('#editor-currentAssets')
    await assets.fill('900000')
    await assets.blur()
    await expect(page.getByTestId('command-discard')).toBeVisible()

    // The result bar's Discard throws the working copy away and restores the
    // stored plan (the panel's own "Revert" is gone: one discard path).
    await page.getByTestId('command-discard').click()
    await expect(assets).toHaveValue(/630/)
    await expect(page.getByTestId('edit-panel')).toBeVisible()

    // Saving writes the working copy into the plan.
    await assets.fill('700000')
    await assets.blur()
    await page.getByTestId('command-save').click()

    await expect(async () => {
      const stored = await page.evaluate(() => {
        const raw = window.localStorage.getItem('retirement-simulator-store')
        const parsed = JSON.parse(raw as string)
        return {
          planAssets: parsed.state.plans[0].params.currentAssets,
          draft: parsed.state.draftParams,
        }
      })
      expect(stored.planAssets).toBe(700000)
      expect(stored.draft).toBeNull()
    }).toPass({ timeout: 10000 })
  })

  test('does not touch a plan when the wizard session is abandoned', async ({ page }) => {
    await page.goto('/en/setup')
    await expect(page.getByTestId('wizard-plan-context')).toContainText('Base plan')

    const age = page.getByRole('spinbutton', { name: 'Current Age' })
    await age.fill('44')
    await age.blur()

    // Walk away without finishing the wizard.
    await page.goto('/en/simulation')

    const state = await page.evaluate(() => {
      const parsed = JSON.parse(window.localStorage.getItem('retirement-simulator-store') as string)
      return {
        planAge: parsed.state.plans[0].params.currentAge,
        draftAge: parsed.state.draftParams?.currentAge ?? null,
      }
    })
    expect(state.planAge).toBe(55)
    expect(state.draftAge).toBe(44)
  })
})

test.describe('market model and glide path', () => {
  test('switches to a historical backtest and freezes the inputs it ignores', async ({ page }) => {
    await gotoWorkspace(page)
    const monteCarlo = {
      endAssets: await page.getByTestId('end-assets').getAttribute('data-value'),
    }
    await openPanel(page, 'market')

    await page.getByTestId('market-model-historical').click()
    await expect(page.getByTestId('market-model-historical-notice')).toContainText(
      '125 start years'
    )

    // The assumptions the record supplies are visible but inert.
    await expect(page.locator('#editor-averageROI')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.locator('#editor-simulationRuns')).toBeDisabled()

    // Deterministic: the same plan replayed gives exactly the same numbers.
    // Results are not stored, so the reload below computes them again.
    const shown = async () => ({
      rate: await page.getByTestId('success-pill').getAttribute('data-value'),
      endAssets: await page.getByTestId('end-assets').getAttribute('data-value'),
    })

    // Anchor on the *historical* result, not merely the numbers on screen —
    // those are the Monte Carlo run's until the backtest lands.
    await expect
      .poll(async () => (await shown()).endAssets, { timeout: 15000 })
      .not.toBe(monteCarlo.endAssets)
    await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
    const first = await shown()
    expect(first.rate).toMatch(/\d/)

    await page.reload()
    await waitForResults(page)
    await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
    expect(await shown()).toEqual(first)
  })

  test('narrows the outcome band when the glide path is switched on', async ({ page }) => {
    await gotoWorkspace(page)
    await openPanel(page, 'market')

    // P90 − P10 at the last age, read from the fan chart's data table (the
    // results themselves are not stored anywhere a test could read them).
    const spread = () =>
      page.evaluate(() => {
        const row = document.querySelector(
          '[data-testid="fan-chart"] details table tbody tr:last-child'
        )
        if (!row || row.children.length < 6) return null
        const euros = (cell: Element) => Number((cell.textContent ?? '').replace(/[^\d-]/g, ''))
        return euros(row.children[5]) - euros(row.children[1])
      })

    await expect.poll(spread).not.toBeNull()
    const allEquity = (await spread()) as number

    await page.getByTestId('glide-path-toggle').click()
    await expect(page.getByTestId('equity-glide-sparkline')).toBeVisible()
    await expect.poll(spread).toBeLessThan(allEquity)
  })
})

test.describe('unified cash flows', () => {
  test('adds a windowed income and a one-off expense, and moves the plan', async ({ page }) => {
    await gotoWorkspace(page)
    await openPanel(page, 'flows')

    const card = page.locator('#plan-editor-expenses')
    await expect(card.getByTestId('cashflow-timeline')).toBeVisible()

    // A rental income that runs from 62 to 70 — the thing the old expenses-only
    // editor could not express at all.
    await card.getByTestId('cashflow-kind-income').click()
    await card.locator('#cashflow-name-new').fill('Rental income')
    await card.locator('#cashflow-amount-new').fill('900')
    await card.locator('#cashflow-start-new').fill('62')
    await card.locator('#cashflow-end-new').fill('70')
    await card.getByTestId('cashflow-add').click()

    await expect(card.getByRole('cell', { name: /Income Rental income/i })).toBeVisible()
    // Uppercased by CSS, so match case-insensitively.
    await expect(card.getByRole('cell', { name: /age 62.70/i })).toBeVisible()

    // ...and a single roof repair at 64.
    await card.getByTestId('cashflow-kind-expense').click()
    await card.locator('#cashflow-name-new').fill('Roof renovation')
    await card.locator('#cashflow-amount-new').fill('30000')
    await card.locator('#cashflow-frequency-new').click()
    await page.getByRole('option', { name: 'One-off' }).click()
    await card.locator('#cashflow-start-new').fill('64')
    await card.getByTestId('cashflow-add').click()

    await expect(card.getByRole('cell', { name: /at age 64/i })).toBeVisible()

    const stored = () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('retirement-simulator-store')
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const params = parsed.state?.draftParams ?? parsed.state?.params
        if (!params) return null
        return {
          version: parsed.version,
          flows: params.cashFlows?.length ?? 0,
          // The legacy projections must stay in sync — every older consumer
          // (report, insights, saved plans) still reads them.
          expenses: params.customExpenses?.length ?? 0,
          windowed: (params.cashFlows ?? []).filter(
            (flow: { startAge?: number }) => flow.startAge !== undefined
          ).length,
        }
      })

    await expect.poll(stored).toEqual({ version: 3, flows: 11, expenses: 8, windowed: 2 })
  })
})

test.describe('German taxes', () => {
  test('edits German tax assumptions and reports the resulting tax drag', async ({ page }) => {
    await gotoWorkspace(page)
    await openPanel(page, 'market')

    const tax = page.getByTestId('tax-block')
    await expect(tax).toBeVisible()
    // The real terms, not a generic "tax rate" euphemism.
    await expect(tax).toContainText('Sparerpauschbetrag')
    await expect(tax).toContainText('Teilfreistellung')
    await expect(tax).toContainText('Abgeltungsteuer')

    // The allowance readout follows the assessment switch.
    await expect(tax).toContainText('€1,000 per year')
    await page.getByTestId('household-type-couple').click()
    await expect(tax).toContainText('€2,000 per year')

    // The drag is measured by the engine, so it has to be a real percentage.
    await expect(page.getByTestId('tax-drag-readout')).toContainText(/≈\d/)
  })
})

test.describe('cash-flow ergonomics', () => {
  test('adds a second pension with its own start age next to the statutory one', async ({
    page,
  }) => {
    await gotoWorkspace(page)
    await openPanel(page, 'flows')

    const card = page.locator('#plan-editor-expenses')
    const list = card.getByTestId('cashflow-list')
    // The seeded pension is an income row like any other, incomes first.
    await expect(list).toContainText('Statutory pension')
    await expect(list.getByTestId('cashflow-group-income')).toContainText('Income · 1')
    await expect(list.getByTestId('cashflow-group-expense')).toContainText('Expenses · 8')
    await expect(list).toContainText('From age 67')

    await card.getByTestId('cashflow-kind-pension').click()
    // A pension cannot be a one-off payment, so that option is gone.
    await card.locator('#cashflow-frequency-new').click()
    await expect(page.getByRole('option', { name: 'One-off' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    // Escape closed only the select, not the panel.
    await expect(page.getByTestId('edit-panel')).toBeVisible()

    await card.locator('#cashflow-name-new').fill('Company pension')
    await card.locator('#cashflow-amount-new').fill('400')
    await card.locator('#cashflow-start-new').fill('70')
    await card.getByTestId('cashflow-add').click()

    await expect(list).toContainText('Company pension')
    await expect(list).toContainText('From age 70')
    await expect(list.getByTestId('cashflow-group-income')).toContainText('Income · 2')
    // Two pensions in the plan; at 67 only the statutory one pays out yet.
    await expect(card).toContainText('2 pensions')
    await expect(card).toContainText('€5,000')
  })

  test('taxes a lump sum under the one-fifth rule and shows the net amount', async ({ page }) => {
    await gotoWorkspace(page)
    await openPanel(page, 'flows')

    const card = page.locator('#plan-editor-expenses')
    await card.getByTestId('cashflow-kind-income').click()
    await card.locator('#cashflow-name-new').fill('Kapitaloption')
    await card.locator('#cashflow-amount-new').fill('300000')
    await card.locator('#cashflow-frequency-new').click()
    await page.getByRole('option', { name: 'One-off' }).click()
    // A calendar month pins the payment to a plan year; age 55 today → eight
    // years out, so the row lands at 63.
    const year = new Date().getFullYear() + 8
    await card.locator('#cashflow-date-new').selectOption('01')
    await card.locator('#cashflow-date-year-new').selectOption(String(year))
    await card.getByRole('button', { name: 'Advanced options' }).click()
    await card.locator('#cashflow-tax-new').click()
    await page.getByRole('option', { name: /One-fifth rule/ }).click()
    await card.locator('#cashflow-note-new').fill('source: company pension, gross')
    await card.getByTestId('cashflow-add').click()

    const list = card.getByTestId('cashflow-list')
    await expect(list).toContainText('Kapitaloption')
    await expect(list).toContainText(`Jan ${year} · age 63`)
    await expect(list).toContainText(/tax €[\d,]+ · net €[\d,]+/)
    await expect(list).toContainText('source: company pension, gross')
  })

  test('opens a cash-flow template in edit mode and lets the add be undone', async ({ page }) => {
    await gotoWorkspace(page)
    await openPanel(page, 'flows')

    const list = page.getByTestId('cashflow-list')
    const rowsBefore = await list.locator('tbody tr').count()

    await list.getByRole('button', { name: /Care costs/ }).click()

    // The new row opens straight into its form with the age window focused —
    // "80–90" is a guess about this person, not an answer.
    // The edit row's field is keyed by the new flow's id; `cashflow-start-new`
    // belongs to the always-present add form further down.
    const startField = page.locator('input[id^="cashflow-start-flow-"]')
    await expect(startField).toBeFocused()
    await expect(startField).toHaveValue(/\d+/)

    const toast = page.getByTestId('cashflow-template-toast')
    await expect(toast).toBeVisible()
    await toast.getByTestId('cashflow-template-undo').click()

    await expect(list.locator('tbody tr')).toHaveCount(rowsBefore)
  })
})

test.describe('scenario levers', () => {
  test('renders toasts as a fixed overlay rather than inside the page flow', async ({ page }) => {
    test.setTimeout(90000) // the levers are measured before they can be saved
    await gotoWorkspace(page)
    await openSection(page, 'levers')

    const list = await waitForLeversMeasured(page)
    const lever = list.getByTestId('stress-lever').first()
    await expect(lever.getByTestId('stress-lever-delta')).toBeVisible()
    await lever.getByTestId('stress-lever-save').click()
    await page.getByTestId('scenario-plan-dialog').getByTestId('scenario-plan-confirm').click()

    const toast = page.getByTestId('plan-created-toast')
    await expect(toast).toBeVisible()

    // Bottom-right of the viewport, out of the reading column.
    const box = (await toast.boundingBox())!
    const viewport = page.viewportSize()!
    expect(box.y).toBeGreaterThan(viewport.height / 2)
    expect(box.x + box.width).toBeGreaterThan(viewport.width * 0.6)

    // And it is inside a `position: fixed` container, so scrolling cannot move
    // it into the content.
    const positioned = await toast.evaluate((node) => {
      let el: HTMLElement | null = node as HTMLElement
      while (el) {
        if (getComputedStyle(el).position === 'fixed') return true
        el = el.parentElement
      }
      return false
    })
    expect(positioned).toBe(true)

    // Optional compare entry (§4): the toast lines the new plan up against the
    // active one.
    await toast.getByTestId('plan-created-toast-compare').click()
    await expect(page).toHaveURL(/#compare$/)
    const compare = page.getByTestId('compare-view')
    await expect(compare).toBeVisible()
    await expect(compare.locator('[aria-pressed="true"]')).toHaveCount(2)
  })
})

// Dropped with the one-page redesign (spec §1.6 #44, §1.4 #32/#34): the
// Varianten tab's measured recommendation chips ("Retire 62", the glide-path
// chip — now "Übernehmen" on each lever row and the one glide-path
// recommendation), the editor's own "Revert" (now the result bar's Discard)
// and the tab bar itself (now the section index, tested above).
