import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import en from '../messages/en.json'
import de from '../messages/de.json'

/**
 * What the landing page promises about data, and whether the code keeps it.
 *
 * The promise used to be absolute ("your data never leaves this browser",
 * "0 bytes sent anywhere") while "Generate report" posted the whole plan to a
 * server route. The report is now built in the browser, and the copy says
 * exactly what is true: without sign-in no plan data is sent — only page views
 * are counted (Vercel Web Analytics: the page address and referrer) — and with
 * sign-in the plans are stored in the account.
 */

const SRC = path.resolve(__dirname, '..', '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' || entry === 'testing' ? [] : sourceFiles(full)
    }
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

describe('privacy claims', () => {
  const claims = (catalog: typeof en) => [
    catalog.landing.meta.description,
    catalog.landing.hero.note,
    catalog.landing.stats.privacy.label,
    catalog.landing.features.items.privacy.body,
    catalog.landing.footer.copyright,
  ]

  it('scopes the "nothing leaves the browser" promise to plan data without sign-in', () => {
    expect(en.landing.hero.note).toBe(
      'No sign-up needed. Without signing in, your plan data never leaves this browser — only page views are counted. If you sign in, your plans are stored in your account.'
    )
    expect(de.landing.hero.note).toBe(
      'Keine Registrierung nötig. Ohne Anmeldung verlassen deine Plandaten diesen Browser nicht – gezählt werden nur Seitenaufrufe. Meldest du dich an, werden deine Pläne in deinem Konto gespeichert.'
    )
    expect(en.landing.stats.privacy.label).toBe('Bytes of plan data sent — unless you sign in')
    expect(de.landing.stats.privacy.label).toBe(
      'Bytes Plandaten übertragen – solange du nicht angemeldet bist'
    )
  })

  it('says what is counted, and what sign-in changes', () => {
    for (const body of [
      en.landing.features.items.privacy.body,
      de.landing.features.items.privacy.body,
    ]) {
      expect(body).toMatch(/page views|Seitenaufrufe/)
      expect(body).toMatch(/stored in your account|in deinem Konto gespeichert/)
      expect(body).toMatch(/PDF/)
    }
  })

  it('makes no absolute claim any more', () => {
    const absolute =
      /never leaves this browser\.|sent anywhere|only in your browser|entirely (in your browser|on your device)|verlassen deine Daten nie|verlassen den Browser$|ausschließlich im lokalen Speicher|vollständig (im Browser|auf deinem Gerät)/
    for (const text of [...claims(en), ...claims(de)]) expect(text).not.toMatch(absolute)
  })

  it('keeps the German UI copy informal', () => {
    for (const text of claims(de)) expect(text).not.toMatch(/\b(Sie|Ihre|Ihr|Ihren|Ihrem)\b/)
    expect(claims(de).join(' ')).toMatch(/\b(du|deine|deinem|deinen)\b/)
  })
})

describe('the code behind the claim', () => {
  /**
   * Every place browser code can send something. If this list grows, the
   * copy above has to be re-read — that is the point of the test.
   */
  const ALLOWED: Record<string, string> = {
    // Account sync: only when signed in and a store is configured.
    'lib/stores/planSync.ts': 'signed-in plan sync (/api/plans)',
    // GETs the report's four font files from the app's own origin.
    'lib/pdf-generator/client/loadReportFonts.ts': 'report fonts (GET, same origin)',
    // Server side: talks to the plan store, never runs in the browser.
    'lib/server/planStore.ts': 'server-side store',
  }

  it('sends nothing from the browser except the account sync and font GETs', () => {
    const senders = sourceFiles(SRC)
      .filter((file) =>
        /\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|new EventSource/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
      .sort()
    expect(senders).toEqual(Object.keys(ALLOWED).sort())
  })

  it('has no report endpoint to send a plan to', () => {
    const routes = sourceFiles(path.join(SRC, 'app')).map((file) =>
      path.relative(SRC, file).split(path.sep).join('/')
    )
    expect(routes.filter((file) => file.includes('generate-pdf'))).toEqual([])
    const button = readFileSync(path.join(SRC, 'components', 'GenerateReportButton.tsx'), 'utf8')
    expect(button).not.toMatch(/fetch\(|\/api\//)
  })

  it('loads the report fonts with a plain same-origin GET', () => {
    const loader = readFileSync(
      path.join(SRC, 'lib', 'pdf-generator', 'client', 'loadReportFonts.ts'),
      'utf8'
    )
    expect(loader).toContain("fetch(url, { credentials: 'same-origin' })")
    expect(loader).not.toMatch(/method:|body:/)
  })
})
