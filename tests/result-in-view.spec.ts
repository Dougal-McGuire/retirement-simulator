import { existsSync, readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import {
  expect,
  expectNoHorizontalOverflow,
  groupHeader,
  leverSlider,
  openPanel,
  openSection,
  readPersistedState,
  scrollToTop,
  showCanvas,
  showColumn,
  successRate,
  test,
  waitForLeversMeasured,
  waitForResults,
  waitForScrollSettled,
} from './helpers/workspace'

/**
 * The redesign's one promise (docs/specs/2026-11-10-result-in-view.md): the
 * result is in view while everything is edited. "In view" means one of its
 * two forms — the head's chart, or the dock pinned under the bar — is inside
 * the viewport and nothing lies over it, at the moment the figures change.
 *
 * Seven tasks, at the owner's iPad in landscape (1366×890), a small window or
 * an iPad in portrait (1024×768) and a phone (390×844). Then the parts the
 * promise rests on: the saved plan as a ghost, a change taken back by its
 * chip, every hash the page understands, no sideways scroll at eight widths
 * and no accessibility violations in the head, the dock and the column.
 */

const VIEWPORTS = [
  { width: 1366, height: 890 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
] as const

/** The furnished example plan: part-time income, inheritance, roof, care. */
async function openDemoPlan(page: Page) {
  await page.goto('/de')
  await page.getByTestId('explore-example-plan').first().click()
  await page.waitForURL(/\/de\/simulation/)
  await waitForResults(page)
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
}

interface Seen {
  /** Which form of the result area was in view, uncovered, when the figures changed. */
  surface: 'head' | 'dock' | null
  /** Why each form did or did not count. */
  dock: string
  head: string
  /** The focused control: 'ok', 'none' (nothing focused) or what hides it. */
  focus: string
}

declare global {
  interface Window {
    __resultSeen?: Seen | null
  }
}

/**
 * Arms a watcher in the page: the first DOM change that alters the result's
 * figures (success rate or end assets, read from the canonical test ids)
 * records — in the same task — which form of the result area is in view.
 */
async function watchResult(page: Page) {
  await page.evaluate(() => {
    const value = (id: string) =>
      document.querySelector(`[data-testid="${id}"]`)?.getAttribute('data-value') ?? ''
    const read = () => `${value('success-pill')}|${value('end-assets')}`

    /** 'ok' when at least `minRatio` of `el` is in the viewport and its visible centre is its own. */
    const inView = (el: Element | null, minRatio: number): string => {
      if (!el) return 'absent'
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') return 'hidden'
      if (Number(style.opacity) < 0.99) return `opacity ${style.opacity}`
      const box = el.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) return 'empty'
      const top = Math.max(box.top, 0)
      const bottom = Math.min(box.bottom, window.innerHeight)
      const left = Math.max(box.left, 0)
      const right = Math.min(box.right, window.innerWidth)
      const visible = Math.max(0, bottom - top) * Math.max(0, right - left)
      const ratio = visible / (box.width * box.height)
      if (ratio < minRatio) return `${Math.round(ratio * 100)} % inside the viewport`
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
      if (!hit || !el.contains(hit)) {
        const by = hit?.closest('[data-testid]')?.getAttribute('data-testid') ?? hit?.tagName
        return `covered by ${by ?? 'nothing'}`
      }
      return 'ok'
    }

    const focusState = (): string => {
      const active = document.activeElement
      if (!active || active === document.body) return 'none'
      const box = active.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) return 'none'
      const x = box.left + box.width / 2
      const y = box.top + box.height / 2
      if (y < 0 || y > window.innerHeight || x < 0 || x > window.innerWidth) {
        return `outside the viewport (${Math.round(x)}, ${Math.round(y)})`
      }
      const hit = document.elementFromPoint(x, y)
      if (hit && (active.contains(hit) || hit.contains(active))) return 'ok'
      const by = hit?.closest('[data-testid]')?.getAttribute('data-testid') ?? hit?.tagName
      return `covered by ${by ?? 'nothing'}`
    }

    const start = read()
    window.__resultSeen = null
    const observer = new MutationObserver(() => {
      if (read() === start) return
      observer.disconnect()
      const dock = inView(document.querySelector('[data-testid="result-dock"]'), 1)
      const head = inView(document.querySelector('[data-head-chart]'), 0.5)
      window.__resultSeen = {
        surface: dock === 'ok' ? 'dock' : head === 'ok' ? 'head' : null,
        dock,
        head,
        focus: focusState(),
      }
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })
  })
}

/** What the watcher saw when the figures changed. */
async function resultSeen(page: Page): Promise<Seen> {
  await expect
    .poll(() => page.evaluate(() => window.__resultSeen ?? null), {
      message: 'the result never changed',
      timeout: 30000,
    })
    .not.toBeNull()
  return (await page.evaluate(() => window.__resultSeen)) as Seen
}

/** Runs `act` and asserts the result was in view, uncovered, when it changed. */
async function expectResultInView(
  page: Page,
  act: () => Promise<void>,
  expected: 'head' | 'dock'
): Promise<void> {
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
  await watchResult(page)
  await act()
  const seen = await resultSeen(page)
  expect(seen, `result in view (dock: ${seen.dock}; head chart: ${seen.head})`).toMatchObject({
    surface: expected,
  })
  // Whatever has the keyboard focus is not under the bar or the dock either.
  expect(['ok', 'none'], `focused control: ${seen.focus}`).toContain(seen.focus)
}

for (const viewport of VIEWPORTS) {
  const size = `${viewport.width}×${viewport.height}`
  /** From 1180 px the head's chart is the result at the top of the page; below, the dock always is. */
  const atTop = viewport.width >= 1180 ? 'head' : 'dock'

  test.describe(`result in view at ${size}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport)
      await openDemoPlan(page)
    })

    test('1 · change Ruhestart', async ({ page }) => {
      await openPanel(page, 'person')
      const slider = leverSlider(page)
      await slider.focus()
      await expectResultInView(page, () => page.keyboard.press('ArrowRight'), atTop)
      await expect(slider).toHaveAttribute('aria-valuenow', '63')
      // Old and new future on one chart, wherever the full chart is.
      await expect(page.getByTestId('fan-ghost')).toHaveCount(1)
      await expect(page.getByTestId('success-delta')).toBeVisible()
    })

    test('2 · change one expense amount', async ({ page }) => {
      await openPanel(page, 'flows')
      const row = page.locator('#plan-editor-expenses [data-testid="cashflow-row-food"]')
      await row.getByRole('button', { name: /^Bearbeiten: / }).click()
      await page.locator('#cashflow-amount-food').fill('1400')
      await expectResultInView(page, () => page.getByTestId('cashflow-save-food').click(), atTop)
      await expect(row).toContainText('1.400')
      await expect(page.locator('[data-change="flow:food:terms"]').first()).toBeAttached()
    })

    test('3 · add a pension with a start age', async ({ page }) => {
      await openPanel(page, 'flows')
      await page.getByTestId('cashflow-add-open').click()
      const form = page.getByTestId('cashflow-composer')
      await form.getByTestId('cashflow-kind-pension').click()
      await form.locator('#cashflow-name-new').fill('Betriebsrente')
      await form.locator('#cashflow-amount-new').fill('600')
      await form.locator('#cashflow-start-new').fill('65')
      await expectResultInView(page, () => form.getByTestId('cashflow-add').click(), atTop)
      // The form folded away and the new row answers, in view in the column.
      const row = page.locator('#plan-editor-expenses tr[data-testid^="cashflow-row-"]', {
        hasText: 'Betriebsrente',
      })
      await expect(row).toBeInViewport()
      await expect(row).toContainText(/65/)
      await expect(row.getByRole('switch')).toBeFocused()
    })

    test('4 · switch an uncertain item off', async ({ page }) => {
      test.setTimeout(120000)
      await openSection(page, 'levers')
      const list = page.locator('#levers').getByTestId('uncertain-flows')
      await list.scrollIntoViewIfNeeded()
      await expect(list).toHaveAttribute('data-measure', 'ready', { timeout: 60000 })
      const item = list.locator('[data-flow-id="demo-inheritance"]')
      const toggle = item.getByTestId('uncertain-flow-switch')
      await toggle.scrollIntoViewIfNeeded()
      await waitForScrollSettled(page)
      await expectResultInView(page, () => toggle.click(), 'dock')
      await expect(item).toHaveAttribute('data-enabled', 'false')
    })

    test('5 · change the withdrawal rule', async ({ page }) => {
      await openPanel(page, 'rule')
      const option = page.locator('#plan-editor-withdrawal #withdrawal-strategy-guytonKlinger')
      await option.scrollIntoViewIfNeeded()
      await expectResultInView(page, () => option.click(), atTop)
      await expect(option).toHaveAttribute('aria-pressed', 'true')
    })

    test('6 · apply the top lever under Wirkung', async ({ page }) => {
      test.setTimeout(120000)
      await openSection(page, 'levers')
      const levers = await waitForLeversMeasured(page)
      const apply = levers.getByTestId('stress-lever').first().getByTestId('stress-lever-apply')
      await apply.scrollIntoViewIfNeeded()
      await waitForScrollSettled(page)
      await expectResultInView(page, () => apply.click(), 'dock')
      await expect(page.getByTestId('lever-applied-toast')).toBeVisible()
      await expect(page.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')
    })

    test('7 · switch nominal ↔ heutige €', async ({ page }) => {
      const radios = page.getByTestId('result-bar').getByTestId('display-toggle').getByRole('radio')
      // At the top of the page …
      await expectResultInView(page, () => radios.nth(1).click(), atTop)
      await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByTestId('fan-unit')).toHaveText('Heutige €')
      // … and down in Geldfluss, where the dock stands in for the head.
      await openSection(page, 'cashflow')
      await expectResultInView(page, () => radios.nth(0).click(), 'dock')
      await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'true')
      // The switch is not an edit.
      await expect(page.getByTestId('result-bar')).not.toHaveAttribute('data-dirty', 'true')
    })
  })
}

test.describe('the saved plan stays on the chart', () => {
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    test(`ghost while dirty, gone when clean; ✕ restores the value and the rate at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await openDemoPlan(page)
      const bar = page.getByTestId('result-bar')
      const chips = page.getByTestId('change-row').getByTestId('change-chip')

      // Clean: one median, no ghost, no legend entry for it, no chips.
      await expect(page.getByTestId('fan-ghost')).toHaveCount(0)
      await expect(page.getByTestId('fan-legend-saved')).toHaveCount(0)
      await expect(chips).toHaveCount(0)
      const savedRate = await successRate(page)
      const savedAge = (await readPersistedState(page))?.storedPlan?.retirementAge

      // Two edits: Ruhestart +1, and the inheritance switched off.
      await openPanel(page, 'person')
      await leverSlider(page).focus()
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => successRate(page)).not.toBe(savedRate)
      await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
      const rateWithAge = await successRate(page)
      await openPanel(page, 'flows')
      await page
        .locator('#plan-editor-expenses [data-testid="cashflow-switch-demo-inheritance"]')
        .click()
      await expect.poll(() => successRate(page)).not.toBe(rateWithAge)
      await expect(bar).toHaveAttribute('data-dirty', 'true')

      // Dirty: the saved plan is drawn under the draft and named in the legend.
      await showCanvas(page)
      await scrollToTop(page)
      await expect(page.getByTestId('fan-ghost')).toHaveCount(1)
      await expect(page.getByTestId('fan-ghost-median')).toHaveAttribute('d', /^M/)
      await expect(page.getByTestId('fan-legend')).toContainText('jetzt')
      await expect(page.getByTestId('fan-legend-saved')).toHaveText('gespeichert')
      // The chips name both changes; the dock counts them.
      const ageChip = page.getByTestId('change-row').locator('[data-change="field:retirementAge"]')
      await expect(ageChip).toHaveText(/Ruhestart 62 → 63/)
      await expect(bar.getByTestId('bar-dirty')).toHaveText('2 Änderungen')

      // ✕ on the inheritance: exactly that goes back — the flow is on again,
      // the retirement age stays, and the rate is the one that edit alone gave.
      const more = page.getByTestId('change-more')
      if (await more.isVisible()) await more.click()
      await page
        .getByTestId('change-row')
        .locator('[data-change="flow:demo-inheritance:switch"]')
        .getByTestId('change-revert')
        .click()
      await expect.poll(() => successRate(page)).toBe(rateWithAge)
      const state = await readPersistedState(page)
      expect(state?.working?.retirementAge).toBe(63)
      const flows = (state?.working?.cashFlows ?? []) as Array<{ id: string; enabled?: boolean }>
      expect(flows.find((flow) => flow.id === 'demo-inheritance')?.enabled).not.toBe(false)
      await expect(chips).toHaveCount(1)
      await expect(page.getByTestId('fan-ghost')).toHaveCount(1)

      // ✕ on the last chip: the saved value, the saved rate, a clean plan —
      // and the ghost has nothing left to stand apart from.
      await ageChip.getByTestId('change-revert').click()
      await expect.poll(() => successRate(page)).toBe(savedRate)
      expect((await readPersistedState(page))?.working?.retirementAge).toBe(savedAge)
      await expect(bar).not.toHaveAttribute('data-dirty', 'true')
      await expect(page.getByTestId('fan-ghost')).toHaveCount(0)
      await expect(page.getByTestId('fan-legend-saved')).toHaveCount(0)
      await expect(chips).toHaveCount(0)
      await expect(page.getByTestId('success-delta')).toHaveCount(0)
    })
  }

  test('the value axis holds still while the plan is dirty and re-fits on save', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS[0])
    await openDemoPlan(page)
    const axis = () =>
      page
        .getByTestId('fan-chart')
        .locator('.ws-chart-ylabel')
        .evaluateAll((labels) => labels.map((label) => label.textContent).join(' | '))
    await openPanel(page, 'person')
    await leverSlider(page).focus()

    // The first edit sets the scale so that it covers the draft and the ghost …
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByTestId('fan-ghost')).toHaveCount(1)
    await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
    const held = await axis()
    const rate = await successRate(page)

    // … and a further step that lowers the fan moves the fan, not the axis.
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => successRate(page)).not.toBe(rate)
    await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
    expect(await axis()).toBe(held)

    // Saved: no ghost, and the axis fits the plan again.
    await page.getByTestId('command-save').click()
    await expect(page.getByTestId('fan-ghost')).toHaveCount(0)
    await expect.poll(axis).not.toBe(held)
  })
})

test.describe('every hash resolves', () => {
  /** Whether a heading sits in the viewport under the pinned bar and dock. */
  async function expectLanded(page: Page, id: string) {
    const heading = page.locator(`#${id}-title`)
    await expect(heading).toBeInViewport()
    await waitForScrollSettled(page)
    const top = (await heading.boundingBox())!.y
    const chrome = await page.evaluate(() =>
      Math.max(
        ...[...document.querySelectorAll('[data-sticky-chrome="true"]')].map((node) => {
          const style = getComputedStyle(node)
          const box = node.getBoundingClientRect()
          return style.visibility === 'hidden' || box.height === 0 ? 0 : box.bottom
        })
      )
    )
    expect(top, `#${id} lands under the pinned chrome`).toBeGreaterThanOrEqual(chrome - 1)
  }

  const GROUPS = ['person', 'savings', 'flows', 'rule', 'market'] as const

  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    test(`fresh loads at ${viewport.width}px`, async ({ page }) => {
      test.setTimeout(240000)
      await page.setViewportSize(viewport)
      const phone = viewport.width <= 760
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      /** A fresh document for every hash (a changed hash alone is not a load). */
      const load = async (hash: string) => {
        await page.goto('about:blank')
        await page.goto(`/de/simulation${hash}`)
        await waitForResults(page)
      }
      const columnShown = async () => {
        await expect(page.getByTestId('edit-panel')).toBeVisible()
        if (phone) await expect(page.getByTestId('mode-edit')).toHaveAttribute('aria-pressed', 'true')
      }
      const canvasShown = async () => {
        if (phone) await expect(page.getByTestId('mode-view')).toHaveAttribute('aria-pressed', 'true')
      }

      // #result (and its alias): the head, at the top.
      for (const hash of ['#result', '#ergebnis']) {
        await load(hash)
        await canvasShown()
        expect(await page.evaluate(() => window.scrollY), hash).toBe(0)
        await expect(page.getByTestId('fan-chart')).toBeInViewport()
      }

      // #assumptions: the column, focused.
      for (const hash of ['#assumptions', '#annahmen']) {
        await load(hash)
        await columnShown()
        await expect(page.getByTestId('edit-panel-title')).toBeFocused()
      }

      // #assumptions:<group>: that group, open and focused, whatever the section named.
      for (const group of GROUPS) {
        await load(`#assumptions:${group}`)
        await columnShown()
        await expect(groupHeader(page, group)).toHaveAttribute('aria-expanded', 'true')
        await expect(groupHeader(page, group)).toBeFocused()
        await expect(groupHeader(page, group)).toBeInViewport()
      }
      for (const [hash, group] of [
        ['#annahmen:zeit', 'person'],
        ['#annahmen:regel', 'rule'],
        ['#annahmen:markt', 'market'],
        ['#cashflow:savings', 'savings'],
      ] as const) {
        await load(hash)
        await expect(groupHeader(page, group), hash).toHaveAttribute('aria-expanded', 'true')
        await expect(groupHeader(page, group), hash).toBeFocused()
      }

      // The canvas sections, under the pinned chrome.
      for (const [hash, id] of [
        ['#cashflow', 'cashflow'],
        ['#geldfluss', 'cashflow'],
        ['#levers', 'levers'],
        ['#wirkung', 'levers'],
        ['#stellschrauben', 'levers'],
      ] as const) {
        await load(hash)
        await canvasShown()
        await expectLanded(page, id)
      }

      // #withdrawal: the outcome on the canvas, and its rule open beside it.
      for (const hash of ['#withdrawal', '#entnahme']) {
        await load(hash)
        await canvasShown()
        await expectLanded(page, 'withdrawal')
        await expect(groupHeader(page, 'rule'), hash).toHaveAttribute('aria-expanded', 'true')
      }
      // #withdrawal:rule names the group: it takes the focus (and, on a phone, the screen).
      for (const hash of ['#withdrawal:rule', '#entnahme:regel']) {
        await load(hash)
        await columnShown()
        await expect(groupHeader(page, 'rule'), hash).toBeFocused()
        await expect(page.locator('#plan-editor-withdrawal')).toBeVisible()
      }

      // #compare: the comparison as a mode of the page.
      for (const hash of ['#compare', '#vergleich']) {
        await load(hash)
        await expect(page.getByTestId('compare-view')).toBeVisible()
        await expect(page.getByTestId('edit-panel')).toBeHidden()
        await expect(page.getByTestId('result-dock')).toBeInViewport()
      }

      // Anything else is not ours: the page opens as usual.
      await load('#main-content')
      await expect(page.getByTestId('compare-view')).toHaveCount(0)
      await expect(page.getByTestId('fan-chart')).toBeVisible()
      expect(errors).toEqual([])
    })
  }

  test('a hash changed in place moves the page the same way', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS[0])
    await page.goto('/de/simulation')
    await waitForResults(page)
    const go = (hash: string) =>
      page.evaluate((next) => {
        window.location.hash = next
      }, hash)

    await go('#assumptions:market')
    await expect(groupHeader(page, 'market')).toBeFocused()
    await go('#withdrawal')
    await expectLanded(page, 'withdrawal')
    await expect(groupHeader(page, 'rule')).toHaveAttribute('aria-expanded', 'true')
    await go('#levers')
    await expectLanded(page, 'levers')
    await go('#result')
    await waitForScrollSettled(page)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    await go('#compare')
    await expect(page.getByTestId('compare-view')).toBeVisible()
    await page.goBack()
    await expect(page.getByTestId('compare-view')).toHaveCount(0)
  })
})

test('no sideways scroll at eight widths, clean and dirty, on the canvas and in the column', async ({
  page,
}) => {
  test.setTimeout(180000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await openDemoPlan(page)
  // Everything mounted: walk the canvas once and open every group.
  for (const id of ['cashflow', 'withdrawal', 'levers'] as const) await openSection(page, id)
  for (const group of ['savings', 'rule', 'market'] as const) await openPanel(page, group)
  await scrollToTop(page)

  const sweep = async (state: string) => {
    for (const width of [320, 390, 800, 1024, 1180, 1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await scrollToTop(page)
      await expectNoHorizontalOverflow(page)
      // The bar never scrolls sideways either.
      const bar = await page
        .getByTestId('result-bar')
        .evaluate((element) => element.scrollWidth - element.clientWidth)
      expect(bar, `bar fits at ${width}px (${state})`).toBeLessThanOrEqual(0)
      // Down the canvas (the dock pinned), then in the column.
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }))
      await expectNoHorizontalOverflow(page)
      const dock = await page
        .getByTestId('result-dock')
        .evaluate((element) => element.scrollWidth - element.clientWidth)
      expect(dock, `dock fits at ${width}px (${state})`).toBeLessThanOrEqual(0)
      const column = await showColumn(page)
      await expectNoHorizontalOverflow(page)
      const body = await column
        .locator('#edit-panel-body')
        .evaluate((element) => element.scrollWidth - element.clientWidth)
      expect(body, `column fits at ${width}px (${state})`).toBeLessThanOrEqual(0)
      await showCanvas(page)
    }
  }

  await sweep('clean')

  await page.setViewportSize({ width: 1920, height: 1080 })
  await openPanel(page, 'person')
  await leverSlider(page).focus()
  await page.keyboard.press('ArrowRight')
  await openPanel(page, 'savings')
  const savings = page.locator('#editor-annualSavings')
  await savings.fill('30000')
  await savings.blur()
  await openPanel(page, 'flows')
  await page.locator('#plan-editor-expenses [data-testid="cashflow-switch-demo-roof"]').click()
  await page.locator('#plan-editor-expenses [data-testid="cashflow-switch-demo-care"]').click()
  await expect(page.getByTestId('bar-dirty')).toHaveText('4 Änderungen')
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')

  await sweep('dirty')
})

/**
 * axe-core is a devDependency; AXE_CORE_PATH can point at another
 * `axe.min.js` (axe-core ≥ 4.10) to check against a different version.
 */
const AXE_PATH = process.env.AXE_CORE_PATH ?? require.resolve('axe-core/axe.min.js')

test.describe('accessibility of the head, the dock and the column', () => {
  test.skip(!existsSync(AXE_PATH), `axe-core not found at ${AXE_PATH}`)

  async function axeViolations(page: Page, selector: string) {
    await page.addScriptTag({ content: readFileSync(AXE_PATH!, 'utf8') })
    return page.evaluate(async (context) => {
      const axe = (window as unknown as { axe: { run: (...args: unknown[]) => Promise<unknown> } })
        .axe
      const result = (await axe.run(context, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })) as {
        violations: Array<{ id: string; nodes: Array<{ target: unknown; failureSummary?: string }> }>
      }
      return result.violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target),
        why: violation.nodes[0]?.failureSummary?.split('\n').slice(0, 3).join(' '),
      }))
    }, selector)
  }

  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`no violations at ${viewport.width}px, ${scheme}`, async ({ page }) => {
        test.setTimeout(120000)
        await page.emulateMedia({ colorScheme: scheme })
        await page.setViewportSize(viewport)
        await openDemoPlan(page)

        // Dirty, so the deltas, the chips, the ghost's legend, the group dot
        // and the draft cluster are all on screen; every group open.
        await openPanel(page, 'person')
        await leverSlider(page).focus()
        await page.keyboard.press('ArrowRight')
        await expect(page.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')
        for (const group of ['savings', 'flows', 'rule', 'market'] as const) {
          await openPanel(page, group)
        }
        // Settled colours: the run has landed (figures dim while one is in
        // flight) and the fades are over.
        await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
        await page.waitForTimeout(400)
        expect(await axeViolations(page, '[data-testid="edit-panel"]'), 'column').toEqual([])

        // The head, at the top of the canvas.
        await showCanvas(page)
        await scrollToTop(page)
        await expect(page.getByTestId('fan-ghost')).toHaveCount(1)
        await page.waitForTimeout(400)
        expect(await axeViolations(page, '#result'), 'head').toEqual([])

        // The dock, pinned (down the canvas from 1180 px; always below), with
        // its list of changes open.
        await openSection(page, 'cashflow')
        const dock = page.getByTestId('result-dock')
        await expect(dock).toHaveAttribute('data-pinned', 'true')
        await page.getByTestId('change-menu-trigger').click()
        await expect(page.getByTestId('change-menu')).toBeVisible()
        await page.waitForTimeout(400)
        expect(await axeViolations(page, '[data-testid="result-dock"]'), 'dock').toEqual([])
        // The bar belongs to the same always-visible strip.
        await page.keyboard.press('Escape')
        expect(await axeViolations(page, '[data-testid="result-bar"]'), 'bar').toEqual([])
      })
    }
  }
})
