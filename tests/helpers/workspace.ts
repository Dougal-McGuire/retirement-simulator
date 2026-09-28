import { test as base, expect, type Locator, type Page } from '@playwright/test'

/**
 * Shared steps for the one-page workspace (`/[locale]/simulation`), written
 * against the frozen contract of docs/specs/2026-09-28-one-page-workspace.md:
 * section ids, the §9.4 testids and the `useWorkspace()` behaviour — never
 * against class names or transient markup.
 *
 * Specs import `test` and `expect` from here: the extended `test` hides the
 * Next.js dev-tools badge on every page, which otherwise sits on top of the
 * phone bottom bar's first item and swallows clicks.
 */

export type SectionId = 'result' | 'assumptions' | 'cashflow' | 'withdrawal' | 'levers'
export type PanelId = 'person' | 'savings' | 'flows' | 'market'

export const SECTIONS: readonly SectionId[] = [
  'result',
  'assumptions',
  'cashflow',
  'withdrawal',
  'levers',
]

/** Panel id → the `id` / testid of the group body it renders (§3.3). */
export const PANEL_BODY: Record<PanelId, string> = {
  person: 'plan-editor-personal',
  savings: 'plan-editor-income',
  flows: 'plan-editor-expenses',
  market: 'plan-editor-market',
}

const STORE_KEY = 'retirement-simulator-store'

/** Hides the Next.js dev-tools badge ("N") for every document the page loads. */
export async function hideDevOverlay(page: Page) {
  await page.addInitScript(() => {
    const add = () => {
      if (document.querySelector('style[data-e2e-hide-dev-overlay]')) return
      const style = document.createElement('style')
      style.setAttribute('data-e2e-hide-dev-overlay', '')
      style.textContent = 'nextjs-portal { display: none !important; }'
      document.head.appendChild(style)
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', add, { once: true })
    } else add()
  })
}

export const test = base.extend<{ hideDevBadge: void }>({
  hideDevBadge: [
    async ({ page }, use) => {
      await hideDevOverlay(page)
      await use()
    },
    { auto: true },
  ],
})

export { expect }

// ---- Results ---------------------------------------------------------------

/** Waits until the result bar shows a computed success rate. */
export async function waitForResults(page: Page) {
  const pill = page.getByTestId('success-pill')
  await expect(pill).toBeVisible({ timeout: 30000 })
  await expect(pill).toHaveAttribute('data-value', /\d/, { timeout: 30000 })
}

/** Opens a workspace URL and waits for the first result. */
export async function gotoWorkspace(page: Page, path = '/en/simulation') {
  await page.goto(path)
  await waitForResults(page)
}

/** The result bar's success rate (`data-value`, unaffected by number tweens). */
export async function successRate(page: Page): Promise<string | null> {
  return page.getByTestId('success-pill').getAttribute('data-value')
}

// ---- Scrolling -------------------------------------------------------------

/**
 * Resolves once the window has not scrolled for `stableFrames` consecutive
 * animation frames — the end of a smooth index jump (~700 ms) or of an
 * instant one. Observes the scroll position instead of sleeping.
 */
export async function waitForScrollSettled(
  page: Page,
  { stableFrames = 10, timeout = 5000 }: { stableFrames?: number; timeout?: number } = {}
) {
  await page.evaluate(
    ({ stableFrames, timeout }) =>
      new Promise<void>((resolve, reject) => {
        const started = performance.now()
        let last = window.scrollY
        let stable = 0
        const tick = () => {
          const y = window.scrollY
          if (Math.abs(y - last) < 0.5) stable += 1
          else {
            stable = 0
            last = y
          }
          if (stable >= stableFrames) resolve()
          else if (performance.now() - started > timeout)
            reject(new Error(`scroll still moving after ${timeout} ms`))
          else window.requestAnimationFrame(tick)
        }
        window.requestAnimationFrame(tick)
      }),
    { stableFrames, timeout }
  )
}

/** The element's viewport `y` once the window has stopped scrolling. */
export async function settledTop(page: Page, locator: Locator): Promise<number> {
  await waitForScrollSettled(page)
  return (await locator.boundingBox())!.y
}

/** Instant scroll to the top (the phone plan row scrolls away with the page). */
export async function scrollToTop(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await waitForScrollSettled(page, { stableFrames: 3 })
}

/** Whether any part of the element is inside the viewport (false when absent). */
export async function isInViewport(locator: Locator): Promise<boolean> {
  if ((await locator.count()) === 0) return false
  return locator.first().evaluate((el) => {
    const box = el.getBoundingClientRect()
    return (
      box.width > 0 &&
      box.height > 0 &&
      box.bottom > 0 &&
      box.right > 0 &&
      box.top < window.innerHeight &&
      box.left < window.innerWidth
    )
  })
}

/**
 * Whether the element (its icon, if it has one) is actually painted where it
 * sits: a hit test at its centre lands on it. False for visually hidden
 * (sr-only / clipped) content, which keeps a box but paints nothing.
 */
export async function isPainted(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const target = element.querySelector('svg') ?? element
    const box = target.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return false
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return hit !== null && element.contains(hit)
  })
}

/** No sideways page scroll at the current width. */
export async function expectNoHorizontalOverflow(page: Page) {
  const { content, viewport } = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }))
  expect(content, `no horizontal overflow at ${viewport}px`).toBeLessThanOrEqual(viewport)
}

// ---- Section index ---------------------------------------------------------

/**
 * A section's own heading: the focusable `h2#<id>-title` its WorkspaceSection
 * renders (§2.5). Matched on `tabindex="-1"` too, so a nested card heading that
 * happens to reuse the id cannot stand in for it.
 */
export function sectionHeading(page: Page, id: SectionId): Locator {
  return page.locator(`h2[id="${id}-title"][tabindex="-1"]`)
}

/**
 * Jumps to a section through the index, the way a reader does: the heading
 * takes focus, the link becomes current and the smooth scroll comes to rest.
 */
export async function openSection(page: Page, id: SectionId) {
  const link = page.getByTestId(`section-link-${id}`)
  await link.click()
  await expect(sectionHeading(page, id)).toBeFocused()
  await expect(link).toHaveAttribute('aria-current', 'location')
  await waitForScrollSettled(page)
}

// ---- Edit panel ------------------------------------------------------------

/**
 * Opens an assumption panel from its Annahmen card and waits for its
 * (code-split) body; returns the panel.
 */
export async function openPanel(page: Page, panel: PanelId): Promise<Locator> {
  await page.getByTestId(`edit-${panel}`).click()
  const element = page.getByTestId('edit-panel')
  await expect(element).toHaveAttribute('data-panel', panel)
  await expect(page.getByTestId('edit-panel-title')).toBeFocused()
  await expect(page.locator(`#${PANEL_BODY[panel]}`)).toBeVisible()
  return element
}

// ---- Plan menu and compare -------------------------------------------------

/** Opens the plan menu; on phones its row scrolls away, so go to the top first. */
export async function openPlanMenu(page: Page): Promise<Locator> {
  const trigger = page.getByTestId('plan-menu-trigger')
  if (!(await isInViewport(trigger))) await scrollToTop(page)
  await trigger.click()
  const menu = page.getByTestId('plan-menu')
  await expect(menu).toBeVisible()
  return menu
}

/** Plan menu → "Compare plans": the page switches into compare mode. */
export async function enterCompare(page: Page): Promise<Locator> {
  await openPlanMenu(page)
  await page.getByTestId('plan-menu-compare').click()
  await expect(page).toHaveURL(/#compare$/)
  const view = page.getByTestId('compare-view')
  await expect(view).toBeVisible()
  await expect(page.locator('#compare-title')).toBeFocused()
  return view
}

/** Duplicates the active plan from the Ergebnis compare entry (one plan → two). */
export async function duplicateFromResult(page: Page) {
  await page.locator('#result').getByTestId('overview-duplicate').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Duplicate plan' }).click()
  await expect(page.locator('#result').getByTestId('overview-compare')).toBeVisible()
}

// ---- Drafts ----------------------------------------------------------------

/**
 * A quick lever in Stellschrauben, by its accessible name (the names are the
 * same in the interim and the final lever section).
 */
export function leverSlider(page: Page, name: string): Locator {
  return page.locator('#levers').getByRole('slider', { name, exact: true })
}

/**
 * Makes the working copy dirty the way the spec's migrated tests do: scroll to
 * `#levers` and nudge a quick lever one step. Returns the slider.
 */
export async function nudgeLever(
  page: Page,
  name = 'Retirement age',
  key: 'ArrowRight' | 'ArrowLeft' = 'ArrowRight'
): Promise<Locator> {
  await openSection(page, 'levers')
  const slider = leverSlider(page, name)
  await slider.focus()
  await page.keyboard.press(key)
  await expect(page.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')
  return slider
}

/**
 * Stellschrauben › "Was am meisten bewirkt": brings the lever list into view
 * (it only measures near the viewport, with no panel open) and waits until
 * its background runs are fresh — `data-measure="ready"`; while pending or
 * stale the rows are inert. Returns the list.
 */
export async function waitForLeversMeasured(page: Page): Promise<Locator> {
  const list = page.locator('#levers').getByTestId('lever-list')
  await list.scrollIntoViewIfNeeded()
  await expect(list).toHaveAttribute('data-measure', 'ready', { timeout: 45000 })
  return list
}

// ---- Persisted store -------------------------------------------------------

export type StoredParams = Record<string, unknown>

/** The persisted working copy (`state.params`). */
export async function readStoredParams(page: Page): Promise<StoredParams | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw).state.params as Record<string, unknown>) : null
  }, STORE_KEY)
}

/** The working copy next to the active plan's saved params. */
export async function readPersistedState(page: Page): Promise<{
  working: StoredParams | undefined
  storedPlan: StoredParams | undefined
  draft: StoredParams | null
} | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const state = JSON.parse(raw).state
    const plan = state.plans?.find(
      (candidate: { id: string }) => candidate.id === state.activePlanId
    )
    return {
      working: state.draftParams ?? state.params,
      storedPlan: plan?.params,
      draft: state.draftParams ?? null,
    }
  }, STORE_KEY)
}
