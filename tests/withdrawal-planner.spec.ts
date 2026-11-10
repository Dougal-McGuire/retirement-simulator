import { expect, gotoWorkspace, groupHeader, sectionHeading, test } from './helpers/workspace'

/**
 * Entnahme, split along its seam: the rule and its sliders are a group of the
 * control column (`#plan-editor-withdrawal`, group `rule`); what the rule does
 * — four readouts, the spending corridor and the comparison of all four rules
 * — is the canvas section `#withdrawal` (`withdrawal-planner`).
 *
 * Every test lands on the section through its URL hash, which also opens the
 * rule's group beside it. Strategy comparison runs four full simulations and
 * is given a generous timeout for the same reason the plan comparison is.
 */
test.describe('withdrawal planner', () => {
  test('offers four strategies and reacts to the withdrawal rate', async ({ page }) => {
    await gotoWorkspace(page, '/en/simulation#withdrawal')

    const planner = page.getByTestId('withdrawal-planner')
    await expect(planner).toBeVisible()
    // The hash shows the outcome and opens its rule next to it.
    await expect(groupHeader(page, 'rule')).toHaveAttribute('aria-expanded', 'true')
    const rule = page.locator('#plan-editor-withdrawal')
    await expect(rule).toBeVisible()

    // All four rules, with the shipped plan on the Vanguard guardrails — in
    // the column only, never a second picker on the canvas.
    for (const strategy of [
      'fixedReal',
      'vanguardDynamic',
      'guytonKlinger',
      'percentOfPortfolio',
    ]) {
      await expect(rule.getByTestId(`withdrawal-strategy-${strategy}`)).toBeVisible()
      await expect(page.getByTestId(`withdrawal-strategy-${strategy}`)).toHaveCount(1)
    }
    await expect(rule.getByTestId('withdrawal-strategy-vanguardDynamic')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(planner.getByTestId('withdrawal-strategy-picker')).toHaveCount(0)

    // The corridor and the four readouts are there from the start.
    await expect(planner.getByTestId('spending-corridor-chart')).toBeVisible()

    // Age-marker labels overlap neither each other nor the axis ticks.
    const markerLabels = planner.getByTestId('corridor-marker-label')
    await expect(markerLabels.first()).toBeVisible()
    const collisions = await planner.getByTestId('spending-corridor-chart').evaluate((chart) => {
      const boxes = (selector: string) =>
        [...chart.querySelectorAll(selector)].map((el) => el.getBoundingClientRect())
      const labels = boxes('[data-testid="corridor-marker-label"]')
      const ticks = boxes('.recharts-cartesian-axis-tick-value')
      const hit = (a: DOMRect, b: DOMRect) =>
        a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      return labels.flatMap((label, i) => [
        ...ticks.filter((tick) => hit(label, tick)).map(() => `label ${i} / tick`),
        ...labels
          .slice(i + 1)
          .filter((other) => hit(label, other))
          .map(() => `label ${i} / label`),
      ])
    })
    expect(collisions).toEqual([])
    await expect(planner.getByTestId('withdrawal-stat-floor')).toBeVisible()
    await expect(planner.getByTestId('withdrawal-stat-volatility')).toBeVisible()

    const successBefore = await planner.getByTestId('withdrawal-stat-success').innerText()

    // Scrub the withdrawal rate in the column: the readouts beside it follow
    // the re-run, and the page has not moved away from them.
    const slider = rule.locator('#planner-dsWithdrawalRate [role="slider"]').first()
    await slider.focus()
    for (let i = 0; i < 8; i++) await slider.press('ArrowRight')

    await expect
      .poll(async () => planner.getByTestId('withdrawal-stat-success').innerText(), {
        timeout: 15000,
      })
      .not.toBe(successBefore)
    await expect(planner.getByTestId('withdrawal-stat-success')).toBeInViewport()
    await expect(slider).toBeInViewport()
    // The group's header says the rule and its rate.
    await expect(page.getByTestId('assumption-card-rule')).toContainText('6%')
  })

  test('swaps the strategy parameters when the rule changes', async ({ page }) => {
    await gotoWorkspace(page, '/en/simulation#withdrawal')

    const planner = page.getByTestId('withdrawal-planner')
    const rule = page.locator('#plan-editor-withdrawal')
    await expect(rule.locator('#planner-dsCeilingRate')).toBeVisible()

    // Fixed real reads no parameters at all.
    await rule.getByTestId('withdrawal-strategy-fixedReal').click()
    await expect(rule.locator('#planner-dsWithdrawalRate')).toHaveCount(0)
    await expect(rule).toContainText('no settings')

    // The percentage rule swaps the guardrails for a euro floor.
    await rule.getByTestId('withdrawal-strategy-percentOfPortfolio').click()
    await expect(rule.locator('#planner-dsCeilingRate')).toHaveCount(0)
    const floor = rule.locator('#planner-spendingFloorReal')
    await expect(floor).toBeVisible()

    await floor.fill('36000')
    await floor.blur()
    await expect
      .poll(async () => planner.getByTestId('withdrawal-stat-floor').innerText(), {
        timeout: 15000,
      })
      .toContain('3,000')
  })

  test('compares all four strategies over the same market paths', async ({ page }) => {
    await gotoWorkspace(page, '/en/simulation#withdrawal')

    const planner = page.getByTestId('withdrawal-planner')
    const rule = page.locator('#plan-editor-withdrawal')
    await planner.getByTestId('strategy-compare-run').click()

    await expect(planner.getByTestId('strategy-compare-row')).toHaveCount(4, { timeout: 60000 })
    await expect(planner.getByTestId('strategy-compare-table')).toContainText('Success rate')
    // Best-per-column marking: at least one winner is called out.
    await expect(planner.getByTestId('strategy-compare-table')).toContainText('Best')

    // The table can drive the plan: the column's picker follows.
    await planner.getByTestId('strategy-compare-apply-guytonKlinger').click()
    await expect(rule.getByTestId('withdrawal-strategy-guytonKlinger')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(planner.getByTestId('strategy-compare-stale')).toBeVisible()
  })

  test('renders the planner in German', async ({ page }) => {
    await gotoWorkspace(page, '/de/simulation#withdrawal')

    // The section heading replaces the planner's own "Entnahmeplaner" card title.
    await expect(sectionHeading(page, 'withdrawal')).toHaveText('Entnahme')
    await expect(groupHeader(page, 'rule')).toContainText('Entnahme')
    const rule = page.locator('#plan-editor-withdrawal')
    await expect(rule).toContainText('Prozent vom Depot')
    await expect(rule).toContainText('Guyton-Klinger-Leitplanken')
    await expect(page.getByTestId('withdrawal-planner').getByTestId('spending-corridor-chart')).toBeVisible()
  })

  test('one chart for spending; the rule is explained with its settings and named on the canvas', async ({
    page,
  }) => {
    await gotoWorkspace(page, '/en/simulation#withdrawal')
    const section = page.locator('#withdrawal')
    const planner = section.getByTestId('withdrawal-planner')
    await expect(planner).toBeVisible()

    // "How your rule behaves" sits under the rule's settings, in the column.
    const effect = page.locator('#plan-editor-withdrawal').getByTestId('withdrawal-rule-effect')
    await expect(effect).toBeVisible()
    await expect(effect).not.toBeEmpty()

    // The canvas names the rule in force and leads to it.
    const pointer = section.getByTestId('withdrawal-rule-link')
    await expect(pointer).toContainText('Vanguard')
    await pointer.click()
    await expect(groupHeader(page, 'rule')).toBeFocused()

    // One spending chart on the page: the corridor. The old spending chart
    // (and its "Ausgabenstrategie im Detail" disclosure) is gone.
    const corridor = section.getByTestId('spending-corridor-chart')
    await expect(corridor).toHaveCount(1)
    await expect(corridor).toBeVisible()
    await expect(page.locator('#spending-chart-title')).toHaveCount(0)

    // The corridor's tooltip carries a withdrawal-rate row: the rate the rule
    // itself used (portfolio-funded spending ÷ the portfolio it measured), no
    // longer the realised gross draw the old chart showed.
    await corridor.scrollIntoViewIfNeeded()
    const box = (await corridor.boundingBox())!
    await expect(async () => {
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5)
      await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5, { steps: 4 })
      await expect(page.getByText('Rule withdrawal rate')).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 10000 })
  })
})
