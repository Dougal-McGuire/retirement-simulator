import type { Page } from '@playwright/test'
import {
  expect,
  gotoWorkspace,
  leverSlider,
  nudgeLever,
  openPlanMenu,
  openSection,
  test,
  waitForResults,
} from './helpers/workspace'

/**
 * Switching plans drops the working copy, so every path that switches has to
 * ask first when there are unsaved edits. Two paths did not: the landing page's
 * example button, and "Undo" on the plan-deleted toast — both activated another
 * plan straight away and the edits were gone.
 */

const STORE_KEY = 'retirement-simulator-store'

/** What storage says about the working copy. */
const storedSession = (page: Page) =>
  page.evaluate((key) => {
    const state = JSON.parse(window.localStorage.getItem(key)!).state
    const active = state.plans.find((plan: { id: string }) => plan.id === state.activePlanId)
    return {
      activePlan: active?.name as string | undefined,
      plans: state.plans.map((plan: { name: string }) => plan.name) as string[],
      draftRetirementAge: (state.draftParams?.retirementAge ?? null) as number | null,
      savedRetirementAge: active?.params.retirementAge as number | undefined,
    }
  }, STORE_KEY)

test.describe('the example plan button with unsaved edits', () => {
  test('asks before switching, and cancelling keeps the edits', async ({ page }) => {
    await gotoWorkspace(page)
    const slider = await nudgeLever(page)
    const edited = Number(await slider.getAttribute('aria-valuenow'))

    await page.goto('/en')
    await page.getByTestId('explore-example-plan').first().click()

    // The example is added, but nothing is switched or dropped without a choice.
    const guard = page.getByTestId('plan-switch-guard')
    await expect(guard).toBeVisible()
    await expect(guard).toContainText('Base plan')
    await expect(page).toHaveURL(/\/en$/)
    await guard.getByRole('button', { name: 'Stay here' }).click()
    await expect(guard).toHaveCount(0)

    await expect(page).toHaveURL(/\/en$/)
    expect(await storedSession(page)).toEqual({
      activePlan: 'Base plan',
      plans: ['Base plan', 'Example plan'],
      draftRetirementAge: edited,
      savedRetirementAge: edited - 1,
    })

    // Back in the workspace the edit is still there, unsaved.
    await gotoWorkspace(page)
    await expect(page.getByTestId('plan-menu-trigger')).toContainText('Base plan')
    await expect(page.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')
    await openSection(page, 'levers')
    await expect(leverSlider(page, 'Retirement age')).toHaveAttribute(
      'aria-valuenow',
      String(edited)
    )
  })

  test('"save and switch" stores the edits, then opens the example', async ({ page }) => {
    await gotoWorkspace(page)
    const slider = await nudgeLever(page)
    const edited = Number(await slider.getAttribute('aria-valuenow'))

    await page.goto('/en')
    await page.getByTestId('explore-example-plan').first().click()
    await page.getByTestId('plan-switch-save').click()

    await page.waitForURL(/\/en\/simulation/)
    await waitForResults(page)
    await expect(page.getByTestId('plan-menu-trigger')).toContainText('Example plan')
    await expect(page.getByTestId('result-bar')).not.toHaveAttribute('data-dirty', 'true')

    const state = await page.evaluate((key) => {
      const plans = JSON.parse(window.localStorage.getItem(key)!).state.plans as Array<{
        name: string
        params: { retirementAge: number }
      }>
      return plans.find((plan) => plan.name === 'Base plan')?.params.retirementAge
    }, STORE_KEY)
    expect(state).toBe(edited)
  })

  test('with nothing unsaved it opens the example at once, as before', async ({ page }) => {
    await page.goto('/en')
    await page.getByTestId('explore-example-plan').first().click()

    await page.waitForURL(/\/en\/simulation/)
    await waitForResults(page)
    await expect(page.getByTestId('plan-menu-trigger')).toContainText('Example plan')
    await expect(page.getByTestId('plan-switch-guard')).toHaveCount(0)
  })
})

test.describe('undoing a plan delete with unsaved edits', () => {
  /** Creates a second plan, then deletes it from the plan manager. */
  async function createAndDeletePlan(page: Page, name: string) {
    await openPlanMenu(page)
    await page.getByTestId('plan-menu-new').click()
    const input = page.locator('#plan-menu-new-name')
    await input.fill(name)
    await input.press('Enter')
    await expect(page.getByTestId('plan-menu-trigger')).toContainText(name)
    await waitForResults(page)

    await openPlanMenu(page)
    await page.getByTestId('plan-menu-manage').click()
    const manager = page.getByTestId('plan-manager')
    await manager.getByTestId('plan-delete').click()
    await page.getByTestId('plan-delete-confirm').click()
    await expect(page.getByTestId('plan-deleted-toast')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(manager).toHaveCount(0)
    await expect(page.getByTestId('plan-menu-trigger')).toContainText('Base plan')
  }

  test('restores the plan next to the one being edited instead of switching to it', async ({
    page,
  }) => {
    await gotoWorkspace(page)
    await createAndDeletePlan(page, 'Second plan')

    // The user carries on working before reaching for "Undo".
    const slider = await nudgeLever(page)
    const edited = await slider.getAttribute('aria-valuenow')
    await page.getByTestId('plan-deleted-toast-undo').click()

    await expect(
      page.getByText('Restored “Second plan”. Your unsaved changes to “Base plan” stay open.')
    ).toBeVisible()
    await expect(page.getByTestId('plan-menu-trigger')).toContainText('Base plan')
    await expect(page.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')
    await expect(slider).toHaveAttribute('aria-valuenow', edited!)
    const menu = await openPlanMenu(page)
    await expect(menu).toContainText('Second plan')
  })

  test('with nothing unsaved it goes back to the restored plan, as before', async ({ page }) => {
    await gotoWorkspace(page)
    await createAndDeletePlan(page, 'Second plan')

    await page.getByTestId('plan-deleted-toast-undo').click()

    await expect(page.getByText('Restored “Second plan”', { exact: true })).toBeVisible()
    await expect(page.getByTestId('plan-menu-trigger')).toContainText('Second plan')
  })
})
