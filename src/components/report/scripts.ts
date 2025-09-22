const script = `(() => {
  const ready = () => document.readyState === 'complete' || document.readyState === 'interactive'

  function waitForFonts() {
    if (document.fonts && document.fonts.ready) {
      return document.fonts.ready
    }
    return Promise.resolve()
  }

  function runQaChecks() {
    const locale = document.body.getAttribute('data-locale') || 'de'
    const errors = []
    const bodyText = document.body.textContent || ''
    if (locale === 'de' && /Page\s+\d+/i.test(bodyText)) {
      errors.push('Englischer String "Page" gefunden')
    }

    const successNodes = Array.from(document.querySelectorAll('[data-success-metric]'))
    successNodes.forEach((node) => {
      const dataset = node.dataset || {}
      const count = Number(dataset.successCount)
      const trials = Number(dataset.successTrials)
      const rate = Number(dataset.successRate)
      const normalizedRate = rate > 1 ? rate / 100 : rate
      const expected = Math.round(normalizedRate * trials)
      if (!Number.isFinite(count) || !Number.isFinite(trials)) {
        errors.push('Erfolgskennzahlen unvollständig')
      } else if (expected !== count) {
        errors.push('Erfolgskennzahl inkonsistent (' + count + ' ≠ ' + expected + ')')
      }
    })

    const expense = document.querySelector('[data-expense-check]')
    if (expense instanceof HTMLElement) {
      const years = Number(expense.dataset.expenseYears)
      const annual = Number(expense.dataset.expenseAnnual)
      const total = Number(expense.dataset.expenseTotal)
      const computed = Math.round(annual * years)
      const roundedTotal = Math.round(total)
      if (computed !== roundedTotal) {
        errors.push('Ausgabensumme weicht vom Planungshorizont ab')
      }
    }

    const headings = Array.from(document.querySelectorAll('h2[data-toc-heading]'))
    headings.forEach((heading) => {
      let next = heading.nextElementSibling
      while (next && next.tagName === 'SCRIPT') {
        next = next.nextElementSibling
      }
      if (!next) {
        const title = heading.textContent ? heading.textContent.trim() : ''
        errors.push('Überschrift ohne nachfolgenden Inhalt: ' + title)
      }
    })

    const tocLinks = Array.from(document.querySelectorAll('[data-toc-list] a'))
    tocLinks.forEach((link) => {
      if (!(link instanceof HTMLAnchorElement)) return
      const target = link.getAttribute('href')
      if (!target) return
      if (!document.querySelector(target)) {
        errors.push('Inhaltsverzeichnis-Ziel fehlt: ' + target)
      }
    })

    if (errors.length) {
      throw new Error(errors.join(' | '))
    }
  }

  async function populateTocPages() {
    const getTocPages = () => Array.from(document.querySelectorAll('[data-toc-page]'))
    let tocPages = getTocPages()
    if (!tocPages.length) {
      return 0
    }

    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))

    const MM_TO_PX = 3.7795275591
    const PAGE_HEIGHT = 297 * MM_TO_PX
    const FIRST_TOP_MARGIN = 30 * MM_TO_PX
    const TOP_MARGIN = 20 * MM_TO_PX
    const BOTTOM_MARGIN = 24 * MM_TO_PX
    const FIRST_CONTENT_HEIGHT = PAGE_HEIGHT - FIRST_TOP_MARGIN - BOTTOM_MARGIN
    const CONTENT_HEIGHT = PAGE_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN
    const scrollTop = window.scrollY || window.pageYOffset || 0

    const tocList = document.querySelector('[data-toc-list]')

    const applyValues = () => {
      let updated = 0
      tocPages = getTocPages()
      tocPages.forEach((span) => {
        const targetSelector = span.getAttribute('data-target')
        if (!targetSelector) return
        const target = document.querySelector(targetSelector)
        if (!target) return

        const rect = target.getBoundingClientRect()
        const docTop = scrollTop + rect.top

        let pageNumber = 1
        if (docTop > FIRST_CONTENT_HEIGHT) {
          const remaining = docTop - FIRST_CONTENT_HEIGHT
          pageNumber = 2 + Math.max(0, Math.floor(remaining / CONTENT_HEIGHT))
        }

        const value = String(pageNumber)
        span.setAttribute('data-page-number', value)
        span.dataset.tocComputed = value
        span.textContent = value
        updated += 1
      })
      return updated
    }

    let updated = applyValues()

    if (updated < tocPages.length) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      updated = Math.max(updated, applyValues())
    }

    const freshPages = getTocPages()
    const debugEntries = freshPages.map((span) => ({
      selector: span.getAttribute('data-target') || '',
      text: span.textContent || '',
      number: span.getAttribute('data-page-number') || '',
    }))
    window.__APPLY_TOC__ = () => {
      tocPages = getTocPages()
      return applyValues()
    }
    window.__TOC_DEBUG__ = { updated, total: tocPages.length, entries: debugEntries }

    if (tocList && !window.__TOC_OBSERVER__) {
      const observer = new MutationObserver(() => {
        tocPages = getTocPages()
        applyValues()
      })
      observer.observe(tocList, { childList: true, subtree: true, characterData: true })
      window.__TOC_OBSERVER__ = observer
    }

    return updated
  }

  async function init() {
    if (!ready()) {
      await new Promise((resolve) => {
        document.addEventListener('DOMContentLoaded', () => resolve(undefined), { once: true })
      })
    }
    const main = document.querySelector('main[data-locale]')
    if (main && !document.body.getAttribute('data-locale')) {
      document.body.setAttribute('data-locale', main.getAttribute('data-locale') || 'de')
    }
    await waitForFonts()
    await populateTocPages()
    runQaChecks()
    window.__REPORT_READY__ = true
  }

  init().catch((error) => {
    console.error('Report initialisation failed', error)
    window.__REPORT_READY__ = false
  })
})()`

export function inlineReportScript(): string {
  return script
}
