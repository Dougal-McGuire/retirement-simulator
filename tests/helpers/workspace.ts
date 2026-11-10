import { test as base, expect, type Locator, type Page } from '@playwright/test'

/**
 * Shared steps for the one-page workspace (`/[locale]/simulation`), written
 * against the contract of docs/specs/2026-11-10-result-in-view.md: the
 * canvas sections, the control column's groups, the test ids and the
 * `useWorkspace()` behaviour — never against class names or transient markup.
 *
 * Specs import `test` and `expect` from here: the extended `test` hides the
 * Next.js dev-tools badge on every page, which otherwise sits on top of the
 * phone bottom bar's first item and swallows clicks.
 */

/** The canvas, top to bottom: the result head, Geldfluss, Entnahme, Wirkung. */
export type SectionId = 'result' | 'cashflow' | 'withdrawal' | 'levers'
/** The control column's groups: the four assumption panels and the Entnahme rule. */
export type PanelId = 'person' | 'savings' | 'flows' | 'rule' | 'market'

export const SECTIONS: readonly SectionId[] = ['result', 'cashflow', 'withdrawal', 'levers']
export const PANELS: readonly PanelId[] = ['person', 'savings', 'flows', 'rule', 'market']

/** Group id → the `id` / testid of the body it renders. */
export const PANEL_BODY: Record<PanelId, string> = {
  person: 'plan-editor-personal',
  savings: 'plan-editor-income',
  flows: 'plan-editor-expenses',
  rule: 'plan-editor-withdrawal',
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
 * Resolves once the window has stayed put (within 1 px) for `stableFrames`
 * animation frames AND at least `stableMs` — the end of a smooth index jump
 * (~700 ms) or of an instant one. Observes the scroll position instead of
 * sleeping, so it returns as soon as the page is still.
 *
 * Both conditions matter on a loaded machine (CI, WebKit): frames get slow
 * and irregular, so a frame count alone can mistake a stall for rest, and
 * sub-pixel jitter (fractional `scrollY` while lazy sections mount) must not
 * restart the count. `timeout` only bounds a page that never settles; it is
 * generous because waiting longer costs nothing when the scroll does stop.
 */
export async function waitForScrollSettled(
  page: Page,
  {
    stableFrames = 10,
    stableMs = 150,
    timeout = 15_000,
  }: { stableFrames?: number; stableMs?: number; timeout?: number } = {}
) {
  await page.evaluate(
    ({ stableFrames, stableMs, timeout }) =>
      new Promise<void>((resolve, reject) => {
        const started = performance.now()
        let anchor = window.scrollY
        let anchorSince = started
        let stable = 0
        const tick = (now: number) => {
          const y = window.scrollY
          if (Math.abs(y - anchor) <= 1) stable += 1
          else {
            stable = 0
            anchor = y
            anchorSince = now
          }
          if (stable >= stableFrames && now - anchorSince >= stableMs) resolve()
          else if (now - started > timeout)
            reject(new Error(`scroll still moving after ${timeout} ms (scrollY ${y})`))
          else window.requestAnimationFrame(tick)
        }
        window.requestAnimationFrame(tick)
      }),
    { stableFrames, stableMs, timeout }
  )
}

/**
 * The element's viewport `y` once the window has stopped scrolling and the
 * layout above it has come to rest (two readings 150 ms apart agree): a lazy
 * section or a chart that measures its frame can still settle after the
 * scroll has.
 */
export async function settledTop(page: Page, locator: Locator): Promise<number> {
  await waitForScrollSettled(page)
  let top = (await locator.boundingBox())!.y
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForTimeout(150)
    const next = (await locator.boundingBox())!.y
    if (Math.abs(next - top) < 0.5) return next
    top = next
  }
  return top
}

/** Instant scroll to the top (the phone plan row scrolls away with the page). */
export async function scrollToTop(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await waitForScrollSettled(page, { stableFrames: 3, stableMs: 50 })
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

/**
 * No sideways page scroll at the current width. Polled briefly: the Sankey
 * measures its frame and redraws one frame after a resize, so the page can
 * be too wide for that frame.
 */
export async function expectNoHorizontalOverflow(page: Page) {
  const viewport = await page.evaluate(() => window.innerWidth)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
      message: `no horizontal overflow at ${viewport}px`,
      timeout: 3000,
    })
    .toBeLessThanOrEqual(0)
}

// ---- The two panes ---------------------------------------------------------

/** How the control column presents at the page's width (`data-panel-mode`). */
export async function panelMode(page: Page): Promise<'docked' | 'drawer' | 'sheet'> {
  const mode = await page.locator('.ws-page').getAttribute('data-panel-mode')
  return mode as 'docked' | 'drawer' | 'sheet'
}

/**
 * Brings the whole result canvas on screen: on phones the mode "Ansehen" (the
 * column takes its place under "Stellen"); at 761–1179 it folds the drawer,
 * which lies over the canvas's right side. A no-op from 1180 px, where the
 * canvas has its own pane.
 */
export async function showCanvas(page: Page) {
  const view = page.getByTestId('mode-view')
  if (await view.isVisible()) {
    if ((await view.getAttribute('aria-pressed')) !== 'true') await view.click()
    await expect(view).toHaveAttribute('aria-pressed', 'true')
    return
  }
  const toggle = page.getByTestId('edit-panel-toggle')
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'true') {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  }
}

/**
 * Brings the control column on screen: nothing to do from 1180 px (a
 * permanent pane); unfolds the drawer at 761–1179; switches a phone to
 * "Stellen". Returns the column.
 */
export async function showColumn(page: Page): Promise<Locator> {
  const column = page.getByTestId('edit-panel')
  const edit = page.getByTestId('mode-edit')
  if (await edit.isVisible()) {
    if ((await edit.getAttribute('aria-pressed')) !== 'true') await edit.click()
    await expect(edit).toHaveAttribute('aria-pressed', 'true')
  } else {
    const toggle = page.getByTestId('edit-panel-toggle')
    if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    }
  }
  await expect(column).toBeVisible()
  return column
}

// ---- Canvas sections -------------------------------------------------------

/**
 * A section's own heading: the focusable `h2#<id>-title` (visually hidden for
 * the head, which opens with its figures). Matched on `tabindex="-1"` too, so
 * a nested card heading that happens to reuse the id cannot stand in for it.
 */
export function sectionHeading(page: Page, id: SectionId): Locator {
  return page.locator(`h2[id="${id}-title"][tabindex="-1"]`)
}

/**
 * Jumps to a section the way a reader does. Geldfluss, Entnahme and Wirkung
 * have an anchor under the head: the heading takes focus, the link becomes
 * current and the smooth scroll comes to rest. The head is the top of the
 * page: the dock's mini chart leads back to it when the dock is pinned,
 * otherwise the page is already there.
 */
export async function openSection(page: Page, id: SectionId) {
  await showCanvas(page)
  if (id === 'result') {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await waitForScrollSettled(page)
    return
  }
  const link = page.getByTestId(`section-link-${id}`)
  await link.click()
  await expect(sectionHeading(page, id)).toBeFocused()
  await expect(link).toHaveAttribute('aria-current', 'location')
  await waitForScrollSettled(page)
}

// ---- Control column ----------------------------------------------------------

/** A group's header button in the column (`aria-expanded` says whether it is open). */
export function groupHeader(page: Page, panel: PanelId): Locator {
  return page.getByTestId(`edit-${panel}`)
}

/**
 * Opens a group of the control column — bringing the column on screen first
 * where it is folded away — and waits for its (code-split) body. An open
 * group is left open. Returns the column.
 */
export async function openPanel(page: Page, panel: PanelId): Promise<Locator> {
  const column = await showColumn(page)
  const header = groupHeader(page, panel)
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator(`#${PANEL_BODY[panel]}`)).toBeVisible()
  return column
}

/** Closes a group of the column (leaves a closed one closed). */
export async function closePanel(page: Page, panel: PanelId) {
  const header = groupHeader(page, panel)
  if ((await header.getAttribute('aria-expanded')) === 'true') await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'false')
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

/**
 * Duplicates the active plan from the plan menu (one plan → two). The copy
 * becomes the active plan ("Base plan 2").
 */
export async function duplicateActivePlan(page: Page) {
  await openPlanMenu(page)
  await page.getByTestId('plan-menu-duplicate').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Duplicate plan' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

// ---- Drafts ----------------------------------------------------------------

/**
 * The column's retirement-age slider (group "Zeit"): the one control the
 * specs nudge to make a draft. It is there once its group is open.
 */
export function leverSlider(page: Page): Locator {
  return page.locator('#editor-retirementAge [role="slider"]')
}

/**
 * Makes the working copy dirty through a control of the column: opens the
 * group "Zeit" and nudges the retirement age one step. Returns the slider.
 */
export async function nudgeLever(
  page: Page,
  key: 'ArrowRight' | 'ArrowLeft' = 'ArrowRight'
): Promise<Locator> {
  await openPanel(page, 'person')
  const slider = leverSlider(page)
  await slider.focus()
  await page.keyboard.press(key)
  await expect(page.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')
  return slider
}

/**
 * Wirkung › "Was am meisten bewirkt": brings the lever list into view (it
 * only measures near the viewport, while nothing is running or held) and
 * waits until its background runs are fresh — `data-measure="ready"`; while
 * pending or stale the rows are inert. Returns the list.
 */
export async function waitForLeversMeasured(page: Page): Promise<Locator> {
  await showCanvas(page)
  const list = page.locator('#levers').getByTestId('lever-list')
  await list.scrollIntoViewIfNeeded()
  await expect(list).toHaveAttribute('data-measure', 'ready', { timeout: 45000 })
  return list
}

/**
 * "Speichern ▾" in the bar → "Als Variante speichern …": opens the dialog
 * that keeps the draft as a plan of its own.
 */
export async function openSaveAsVariant(page: Page): Promise<Locator> {
  await page.getByTestId('command-save-more').click()
  await page.getByTestId('command-save-as-new').click()
  const dialog = page.getByTestId('save-draft-dialog')
  await expect(dialog).toBeVisible()
  return dialog
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
