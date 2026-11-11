import type { BrowserContext, Page } from '@playwright/test'
import {
  expect,
  gotoWorkspace,
  hideDevOverlay,
  leverSlider,
  nudgeLever,
  openPlanMenu,
  openSection,
  test,
  waitForResults,
} from './helpers/workspace'

/**
 * Two tabs of one browser share one localStorage entry. Each tab used to keep
 * the plan list it had loaded and write it back whole on its next change, so
 * the last tab to do anything erased what the other had saved — pressing
 * "Recalculate" in a stale tab was enough.
 *
 * Two pages of one browser context are two tabs: same storage, and `storage`
 * events between them.
 */

const STORE_KEY = 'retirement-simulator-store'

async function openTab(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()
  await hideDevOverlay(page)
  await gotoWorkspace(page)
  return page
}

const storedPlanNames = (page: Page): Promise<string[] | null> =>
  page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const plans = JSON.parse(raw).state.plans as Array<{ name: string }>
    return plans.map((plan) => plan.name)
  }, STORE_KEY)

async function createPlan(page: Page, name: string) {
  await openPlanMenu(page)
  await page.getByTestId('plan-menu-new').click()
  const input = page.locator('#plan-menu-new-name')
  await input.fill(name)
  await input.press('Enter')
  await expect(page.getByTestId('plan-menu-trigger')).toContainText(name)
  await waitForResults(page)
}

/**
 * Presses "Recalculate" and waits for the run to have come and gone. The
 * "running" state lasts well under a second, so it is recorded in the page
 * rather than polled for from here.
 */
async function recalculate(page: Page) {
  // Adopting the other tab's plan starts a run of its own: let it finish.
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
  await page.evaluate(() => {
    const status = document.querySelector('[data-testid="run-status"]')!
    const seen = window as unknown as { __sawRunning?: boolean }
    seen.__sawRunning = false
    new MutationObserver(() => {
      if (status.getAttribute('data-state') === 'running') seen.__sawRunning = true
    }).observe(status, { attributes: true, attributeFilter: ['data-state'] })
  })
  await page.getByTestId('run-button').click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __sawRunning?: boolean }).__sawRunning))
    .toBe(true)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
}

test.describe('two tabs of one browser', () => {
  test('a plan made in one tab survives the other tab recalculating and editing', async ({
    context,
  }) => {
    const tabA = await openTab(context)
    const tabB = await openTab(context)

    await createPlan(tabB, 'Made in tab B')
    await expect.poll(() => storedPlanNames(tabB)).toEqual(['Base plan', 'Made in tab B'])

    // Tab A: the user only presses "Recalculate" — no plan change at all.
    await tabA.bringToFront()
    await recalculate(tabA)
    expect(await storedPlanNames(tabA)).toEqual(['Base plan', 'Made in tab B'])

    // … and then really changes something, which does write the entry.
    await nudgeLever(tabA)
    await expect(tabA.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')
    await expect.poll(() => storedPlanNames(tabA)).toEqual(['Base plan', 'Made in tab B'])

    // Tab B is reloaded: its plan is still there.
    await tabB.bringToFront()
    await tabB.reload()
    await waitForResults(tabB)
    const menu = await openPlanMenu(tabB)
    await expect(menu).toContainText('Made in tab B')
    await expect(menu).toContainText('Base plan')
  })

  test("a tab shows the other tab's new plan without a reload", async ({ context }) => {
    const tabA = await openTab(context)
    const tabB = await openTab(context)

    await createPlan(tabB, 'Made in tab B')

    await tabA.bringToFront()
    // Tab A stays on its own plan …
    await expect(tabA.getByTestId('plan-menu-trigger')).toContainText('Base plan')
    // … and lists the new one.
    const menu = await openPlanMenu(tabA)
    await expect(menu).toContainText('Made in tab B')
  })

  // The entry holds the plans, which every tab shares, and one session: the
  // open plan with its unsaved edits. A tab that changes a plan must not take
  // the session of the tab being edited with it.
  test('an unsaved edit survives the other tab renaming the plan, reload included', async ({
    context,
  }) => {
    const tabA = await openTab(context)
    const tabB = await openTab(context)

    // Tab A: an unsaved edit on the base plan.
    await tabA.bringToFront()
    const sliderA = await nudgeLever(tabA)
    const edited = await sliderA.getAttribute('aria-valuenow')

    // Tab B renames that plan.
    await tabB.bringToFront()
    await openPlanMenu(tabB)
    await tabB.getByTestId('plan-menu-rename').click()
    const input = tabB.locator('#plan-menu-rename-name')
    await input.fill('Renamed in tab B')
    await input.press('Enter')
    await expect(tabB.getByTestId('plan-menu-trigger')).toContainText('Renamed in tab B')

    // Tab A takes the name, and still shows its edit as unsaved …
    await tabA.bringToFront()
    await expect(tabA.getByTestId('plan-menu-trigger')).toContainText('Renamed in tab B')
    await expect(sliderA).toHaveAttribute('aria-valuenow', edited!)
    await expect(tabA.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')

    // … and gets both back after a reload: tab B's write left the edit in storage.
    await tabA.reload()
    await waitForResults(tabA)
    await expect(tabA.getByTestId('plan-menu-trigger')).toContainText('Renamed in tab B')
    await expect(tabA.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')
    await openSection(tabA, 'levers')
    await expect(leverSlider(tabA)).toHaveAttribute('aria-valuenow', edited!)
  })
})
