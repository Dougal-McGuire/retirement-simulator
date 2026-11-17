import { expect, gotoWorkspace, test } from './helpers/workspace'

test('compares retirement ages and clears outdated results when a target changes', async ({
  page,
}) => {
  await gotoWorkspace(page, '/en/simulation#withdrawal')
  const planner = page.getByTestId('retirement-age-planner')
  const budget = planner.getByRole('spinbutton', { name: 'Living costs (€/month)' })
  await budget.fill('0')
  await planner.getByRole('button', { name: 'Compare ages' }).click()
  await expect(planner.getByRole('table')).toBeVisible({ timeout: 30000 })
  await expect(planner.getByRole('status')).toContainText('Earliest age')
  await expect(planner.getByRole('columnheader', { name: 'Affordable per month' })).toBeVisible()
  await budget.fill('100000000')
  await expect(planner.getByRole('table')).toHaveCount(0)
  await planner.getByRole('button', { name: 'Compare ages' }).click()
  await expect(planner.getByRole('status')).toContainText('No age', { timeout: 30000 })
})
