import { expect, gotoWorkspace, sectionHeading, test } from './helpers/workspace'

/**
 * The Entnahme section (`#withdrawal`): the Dynamic Spending Planner merged
 * with the spending analysis into one chart, edited inline on the page.
 *
 * Every test lands on the section through its URL hash. Strategy comparison
 * runs four full simulations and is given a generous timeout for the same
 * reason the plan comparison is.
 */
test.describe('withdrawal planner', () => {
  test('offers four strategies and reacts to the withdrawal rate', async ({ page }) => {
    await gotoWorkspace(page, '/en/simulation#withdrawal')

    const planner = page.getByTestId('withdrawal-planner')
    await expect(planner).toBeVisible()

    // All four rules, with the shipped plan on the Vanguard guardrails.
    for (const strategy of [
      'fixedReal',
      'vanguardDynamic',
      'guytonKlinger',
      'percentOfPortfolio',
    ]) {
      await expect(planner.getByTestId(`withdrawal-strategy-${strategy}`)).toBeVisible()
    }
    await expect(planner.getByTestId('withdrawal-strategy-vanguardDynamic')).toHaveAttribute(
      'aria-pressed',
      'true'
    )

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

    // Scrub the withdrawal rate: the readouts follow the re-run.
    const slider = planner.locator('#planner-dsWithdrawalRate [role="slider"]').first()
    await slider.focus()
    for (let i = 0; i < 8; i++) await slider.press('ArrowRight')

    await expect
      .poll(async () => planner.getByTestId('withdrawal-stat-success').innerText(), {
        timeout: 15000,
      })
      .not.toBe(successBefore)
  })

  test('swaps the strategy parameters when the rule changes', async ({ page }) => {
    await gotoWorkspace(page, '/en/simulation#withdrawal')

    const planner = page.getByTestId('withdrawal-planner')
    await expect(planner.locator('#planner-dsCeilingRate')).toBeVisible()

    // Fixed real reads no parameters at all.
    await planner.getByTestId('withdrawal-strategy-fixedReal').click()
    await expect(planner.locator('#planner-dsWithdrawalRate')).toHaveCount(0)
    await expect(planner).toContainText('no settings')

    // The percentage rule swaps the guardrails for a euro floor.
    await planner.getByTestId('withdrawal-strategy-percentOfPortfolio').click()
    await expect(planner.locator('#planner-dsCeilingRate')).toHaveCount(0)
    const floor = planner.locator('#planner-spendingFloorReal')
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
    await planner.getByTestId('strategy-compare-run').click()

    await expect(planner.getByTestId('strategy-compare-row')).toHaveCount(4, { timeout: 60000 })
    await expect(planner.getByTestId('strategy-compare-table')).toContainText('Success rate')
    // Best-per-column marking: at least one winner is called out.
    await expect(planner.getByTestId('strategy-compare-table')).toContainText('Best')

    // The table can drive the plan.
    await planner.getByTestId('strategy-compare-apply-guytonKlinger').click()
    await expect(planner.getByTestId('withdrawal-strategy-guytonKlinger')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(planner.getByTestId('strategy-compare-stale')).toBeVisible()
  })

  test('renders the planner in German', async ({ page }) => {
    await gotoWorkspace(page, '/de/simulation#withdrawal')

    // The section heading replaces the planner's own "Entnahmeplaner" card title.
    await expect(sectionHeading(page, 'withdrawal')).toHaveText('Entnahme')
    const planner = page.getByTestId('withdrawal-planner')
    await expect(planner).toContainText('Prozent vom Depot')
    await expect(planner).toContainText('Guyton-Klinger-Leitplanken')
    await expect(planner.getByTestId('spending-corridor-chart')).toBeVisible()
  })

  test('merges the spending analysis into the corridor: one chart, the rule explained', async ({
    page,
  }) => {
    await gotoWorkspace(page, '/en/simulation#withdrawal')
    const section = page.locator('#withdrawal')
    const planner = section.getByTestId('withdrawal-planner')
    await expect(planner).toBeVisible()

    // "How your rule behaves" sits under the rule's settings.
    await expect(planner.getByTestId('withdrawal-rule-effect')).toBeVisible()
    await expect(planner.getByTestId('withdrawal-rule-effect')).not.toBeEmpty()

    // One spending chart on the page: the corridor. The old spending chart
    // (and its "Ausgabenstrategie im Detail" disclosure) is gone.
    const corridor = section.getByTestId('spending-corridor-chart')
    await expect(corridor).toHaveCount(1)
    await expect(corridor).toBeVisible()
    await expect(page.locator('#spending-chart-title')).toHaveCount(0)

    // The corridor's tooltip carries the old chart's withdrawal-rate row.
    await corridor.scrollIntoViewIfNeeded()
    const box = (await corridor.boundingBox())!
    await expect(async () => {
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5)
      await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5, { steps: 4 })
      await expect(page.getByText('Mean gross draw / mean opening portfolio')).toBeVisible({
        timeout: 1000,
      })
    }).toPass({ timeout: 10000 })
  })
})
