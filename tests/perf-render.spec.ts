import type { Page } from '@playwright/test'
import {
  expect,
  gotoWorkspace,
  openSection,
  test,
  waitForLeversMeasured,
} from './helpers/workspace'

/**
 * Render isolation (spec §7): an edit must not re-render the page shell, and
 * when a run lands the result bar commits on its own — the charts, the Sankey,
 * the withdrawal planner and the lever list follow in a later (deferred,
 * interruptible) commit. That split is what keeps edit → result bar inside
 * the 250 ms budget; a regression shows up here as a structural fact (which
 * components rendered in which commit), never as a timing, so it cannot
 * flake on a slow runner.
 *
 * Reads React's commits through the DevTools global hook, so it needs a
 * development build (component names); against a production build it skips.
 *
 * "Rendered in this commit" is read from the fiber tree's structure, not from
 * clocks: a fiber that rendered was cloned for this commit (it was not in its
 * root's tree at that root's previous commit) and carries React's
 * PerformedWork flag (cloning resets the flags). An earlier version compared
 * each fiber's render start time with the last commit of *any* root; the
 * development overlay is a second React root, and under CPU load its commits
 * landed in the middle of the time-sliced deferred render, so components that
 * had begun rendering before that commit were dropped from the deferred
 * commit ("Ergebnis never re-rendered") about one run in five.
 */

interface Commit {
  /** Which React root committed (the app, or e.g. the development overlay). */
  root: number
  /** Components (by name) whose render function ran in this commit. */
  rendered: string[]
  /** The result bar's success rate and end assets after the commit. */
  bar: string
}

/** Installs a minimal DevTools hook that records, per commit, which named components rendered. */
async function recordCommits(page: Page) {
  await page.addInitScript(() => {
    type Fiber = {
      tag: number
      type: unknown
      child: Fiber | null
      sibling: Fiber | null
      alternate: Fiber | null
      flags: number
    }
    const nameOf = (type: unknown): string | null => {
      if (typeof type === 'function') {
        const fn = type as { displayName?: string; name?: string }
        return fn.displayName || fn.name || null
      }
      if (type && typeof type === 'object') {
        const wrapper = type as { displayName?: string; render?: unknown; type?: unknown }
        if (wrapper.displayName) return wrapper.displayName
        if (wrapper.render) return nameOf(wrapper.render)
        if (wrapper.type) return nameOf(wrapper.type)
      }
      return null
    }
    // Function (0), class (1), forwardRef (11), memo (14) and simple memo (15).
    const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15])
    // React's `PerformedWork` fiber flag: the component's render ran.
    const PERFORMED_WORK = 1
    const commits: Array<{ root: number; rendered: string[]; bar: string }> = []
    // Per root: its id and how many commits it has made. Per fiber: the
    // root commit at which it was last part of that root's current tree.
    const rootIds = new WeakMap<object, number>()
    const rootCommits = new WeakMap<object, number>()
    const inTreeAt = new WeakMap<object, number>()
    let nextRootId = 0
    let rendererId = 0

    ;(window as unknown as Record<string, unknown>).__commits = commits
    ;(window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map(),
      supportsFiber: true,
      isDisabled: false,
      inject(renderer: unknown) {
        rendererId += 1
        ;(this as { renderers: Map<number, unknown> }).renderers.set(rendererId, renderer)
        return rendererId
      },
      checkDCE() {},
      setStrictMode() {},
      onScheduleFiberRoot() {},
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      onCommitFiberRoot(_id: number, root: { current: Fiber }) {
        if (!rootIds.has(root)) rootIds.set(root, (nextRootId += 1))
        const commit = (rootCommits.get(root) ?? 0) + 1
        rootCommits.set(root, commit)
        const rendered: string[] = []
        const stack: Fiber[] = [root.current]
        while (stack.length > 0) {
          const fiber = stack.pop()!
          // React leaves a subtree without work as it is: the same fiber
          // objects stay in the tree. Work clones a fiber (resetting its
          // flags), so a fiber that was not in this root's tree at its
          // previous commit is new to it, and its PerformedWork flag says
          // whether its render ran — this commit, never an earlier one.
          const cloned = inTreeAt.get(fiber) !== commit - 1
          inTreeAt.set(fiber, commit)
          if (
            cloned &&
            COMPONENT_TAGS.has(fiber.tag) &&
            (fiber.flags & PERFORMED_WORK) === PERFORMED_WORK
          ) {
            const name = nameOf(fiber.type)
            if (name) rendered.push(name)
          }
          if (fiber.sibling) stack.push(fiber.sibling)
          if (fiber.child) stack.push(fiber.child)
        }
        const value = (testId: string) =>
          document.querySelector(`[data-testid="${testId}"]`)?.getAttribute('data-value') ?? ''
        commits.push({
          root: rootIds.get(root)!,
          rendered,
          bar: `${value('success-pill')}|${value('end-assets')}`,
        })
      },
    }
  })
}

const readCommits = (page: Page) =>
  page.evaluate(() => (window as unknown as { __commits: Commit[] }).__commits.splice(0))

/** Rendered on a landing run, but only after the result bar has committed. */
const DEFERRED = [
  'ResultBody',
  'FanChartCard',
  'AssumptionsSection',
  'CashflowCard',
  'WithdrawalPlanner',
  'SpendingCorridorChart',
  'RecommendationList',
  'LeverImpactView',
  'PersonalGroup',
]

test('an edit re-renders the result bar first and never the page shell', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await recordCommits(page)
  await gotoWorkspace(page)

  const warmup = await readCommits(page)
  test.skip(
    !warmup.some((commit) => commit.rendered.includes('ResultBar')),
    'needs a development build (component names)'
  )

  // Everything lazy mounted: scroll through to the measured lever list, then
  // edit from the docked Person panel with the list still in view.
  await openSection(page, 'levers')
  await waitForLeversMeasured(page)
  await page.getByTestId('edit-person').dispatchEvent('click')
  const panel = page.getByTestId('edit-panel')
  await expect(panel).toHaveAttribute('data-panel', 'person')
  await page.locator('#levers').evaluate((levers) => levers.scrollIntoView())
  const slider = panel.locator('#editor-retirementAge [role="slider"]')
  await slider.focus()
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
  await readCommits(page)

  const before = await page.getByTestId('end-assets').getAttribute('data-value')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('end-assets')).not.toHaveAttribute('data-value', before ?? '')
  await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
  // Wait for the deferred pass itself rather than for a fixed time: on a
  // loaded machine it can take longer than any sleep. Then give chart
  // follow-ups a moment to commit too, so the shell check below sees them.
  // (Waiting longer can only reveal more renders, never hide one.)
  const commits: Commit[] = []
  await expect
    .poll(
      async () => {
        commits.push(...(await readCommits(page)))
        return commits.some((commit) => commit.rendered.includes('ResultBody'))
      },
      { timeout: 20000, message: 'Ergebnis never re-rendered for the new result' }
    )
    .toBe(true)
  await page.waitForTimeout(500)
  commits.push(...(await readCommits(page)))

  // The page shell never re-renders for an edit or a run.
  const shell = commits.filter((commit) => commit.rendered.includes('WorkspacePage'))
  expect(shell, 'WorkspacePage re-rendered').toHaveLength(0)

  // The commit that put the new result into the bar …
  const barIndex = commits.findIndex((commit) => commit.bar.split('|')[1] !== before)
  expect(barIndex, 'the bar never changed').toBeGreaterThanOrEqual(0)
  const barCommit = commits[barIndex]
  expect(barCommit.rendered).toContain('BarKpis')
  // … and none of the heavy sections rendered in it.
  expect(barCommit.rendered.filter((name) => DEFERRED.includes(name))).toEqual([])

  // The sections still follow the result — after the bar, not before it.
  const resultBody = commits.flatMap((commit, index) =>
    commit.rendered.includes('ResultBody') ? [index] : []
  )
  expect(resultBody.length, 'Ergebnis never re-rendered for the new result').toBeGreaterThan(0)
  expect(Math.min(...resultBody)).toBeGreaterThan(barIndex)
})
