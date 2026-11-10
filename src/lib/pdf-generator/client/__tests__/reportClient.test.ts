/**
 * The browser-side report pipeline, without a browser: file naming, the
 * mapping from "what went wrong" to a catalog message, font loading (including
 * the retry after a failure) and the worker client.
 *
 * react-pdf itself is not loaded here — its packages are ES modules Jest
 * cannot import; `renderReport.test.ts` renders the real thing in Node.
 */
import en from '@/i18n/messages/en.json'
import de from '@/i18n/messages/de.json'
import { planFilenameSlug, reportErrorKey, reportFilename } from '../reportFile'
import { ReportGenerationError, reportFailureOf } from '../reportErrors'
import { euroUnitFilenameSuffix } from '@/lib/pdf-generator/euroUnit'

const registerReportFonts = jest.fn()
jest.mock('@/lib/pdf-generator/react-pdf/fonts', () => ({
  registerReportFonts: (sources: unknown) => registerReportFonts(sources),
}))

describe('report file name', () => {
  const date = new Date('2026-11-09T10:00:00Z')

  it('names the plan and the date', () => {
    expect(reportFilename('Retire 2 years later', '', date)).toBe(
      'retirement-report-retire-2-years-later-2026-11-09.pdf'
    )
    expect(reportFilename(undefined, '', date)).toBe('retirement-report-2026-11-09.pdf')
  })

  it('carries the unit suffix of a today’s-euro report, per language', () => {
    const real = { requested: 'real', applied: 'real', realMethod: 'perPath' } as const
    expect(reportFilename('Basisplan', euroUnitFilenameSuffix(real, 'de'), date)).toBe(
      'retirement-report-basisplan-heutige-euro-2026-11-09.pdf'
    )
    expect(reportFilename('Base plan', euroUnitFilenameSuffix(real, 'en'), date)).toBe(
      'retirement-report-base-plan-todays-euros-2026-11-09.pdf'
    )
    // A report that had to stay nominal is not named as today's euros.
    const fallback = { requested: 'real', applied: 'nominal' } as const
    expect(reportFilename('Basisplan', euroUnitFilenameSuffix(fallback, 'de'), date)).toBe(
      'retirement-report-basisplan-2026-11-09.pdf'
    )
  })

  it('makes any plan name safe for a file name', () => {
    expect(planFilenameSlug('Früher Ruhestand: 60 / 67 (Übergang)')).toBe(
      'fruher-ruhestand-60-67-ubergang'
    )
    expect(planFilenameSlug('  ../../etc/passwd  ')).toBe('etc-passwd')
    expect(planFilenameSlug('x'.repeat(200))).toHaveLength(40)
    expect(planFilenameSlug('€€€')).toBe('')
    expect(planFilenameSlug(null)).toBe('')
  })
})

describe('error → catalog message', () => {
  it('maps every failure to a key that exists in both catalogs', () => {
    const cases: Array<[unknown, string]> = [
      [new ReportGenerationError('chunkLoad'), 'chunkLoad'],
      [new ReportGenerationError('fonts'), 'fonts'],
      [new ReportGenerationError('render'), 'generic'],
      [new Error('yoga exploded at 0x7f'), 'generic'],
      [new TypeError('Failed to fetch dynamically imported module'), 'generic'],
      [{ some: 'object' }, 'generic'],
      ['a string', 'generic'],
      [undefined, 'generic'],
      [null, 'generic'],
    ]
    for (const [error, key] of cases) {
      expect(reportErrorKey(error)).toBe(key)
      expect(typeof (en.report.errors as Record<string, string>)[key]).toBe('string')
      expect(typeof (de.report.errors as Record<string, string>)[key]).toBe('string')
    }
  })

  it('never lets raw exception text or "[object Object]" through', () => {
    const messages = [...Object.values(en.report.errors), ...Object.values(de.report.errors)]
    for (const message of messages) {
      // No interpolation slot an exception text could be put into.
      expect(message).not.toMatch(/[{}]/)
      expect(message).not.toMatch(/\[object|undefined|Error:/)
      expect(message.length).toBeGreaterThan(20)
    }
    // What the button shows for an arbitrary throw is a catalog sentence.
    const thrown = { toString: () => '[object Object]' }
    expect(en.report.errors[reportErrorKey(thrown)]).toBe(
      'The report could not be created. Please try again.'
    )
  })

  it('reads the code off errors that crossed the worker boundary', () => {
    expect(reportFailureOf({ code: 'fonts' })).toBe('fonts')
    expect(reportFailureOf({ code: 'chunkLoad' })).toBe('chunkLoad')
    expect(reportFailureOf({ code: 'somethingElse' })).toBe('render')
  })

  it('uses the informal "du" register in the German UI messages', () => {
    const german = Object.values(de.report.errors).join(' ')
    expect(german).toMatch(/\b(versuch|Prüfe|deine)\b/)
    expect(german).not.toMatch(/\b(Sie|Ihre|Ihr)\b/)
  })
})

describe('loadReportFonts', () => {
  const urls = {
    regular: 'https://app.test/_next/static/media/Inter-Regular.aaaa.ttf',
    medium: 'https://app.test/_next/static/media/Inter-Medium.bbbb.ttf',
    semibold: 'https://app.test/_next/static/media/Inter-SemiBold.cccc.ttf',
    bold: 'https://app.test/_next/static/media/Inter-Bold.dddd.ttf',
  }
  const fontBytes = new Uint8Array(4096).buffer
  const ok = () => ({ ok: true, status: 200, arrayBuffer: async () => fontBytes })

  const realFetch = globalThis.fetch
  const realCreate = URL.createObjectURL
  const realRevoke = URL.revokeObjectURL
  let blobCount = 0

  beforeEach(() => {
    jest.resetModules()
    registerReportFonts.mockClear()
    blobCount = 0
    URL.createObjectURL = jest.fn(() => `blob:app.test/${++blobCount}`)
    URL.revokeObjectURL = jest.fn()
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    URL.createObjectURL = realCreate
    URL.revokeObjectURL = realRevoke
  })

  const load = () =>
    (jest.requireActual('../loadReportFonts') as typeof import('../loadReportFonts'))

  it('fetches the four files from the given URLs and registers them as blob URLs', async () => {
    const fetchMock = jest.fn(async () => ok())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const { loadReportFonts } = load()
    await loadReportFonts(urls)

    expect(fetchMock.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      urls.regular,
      urls.medium,
      urls.semibold,
      urls.bold,
    ])
    // GET, same-origin: nothing but the file is asked for.
    for (const call of fetchMock.mock.calls) {
      expect((call as unknown[])[1]).toEqual({ credentials: 'same-origin' })
    }
    expect(registerReportFonts).toHaveBeenCalledWith({
      regular: 'blob:app.test/1',
      medium: 'blob:app.test/2',
      semibold: 'blob:app.test/3',
      bold: 'blob:app.test/4',
    })
  })

  it('needs no network for the second report of a page', async () => {
    const fetchMock = jest.fn(async () => ok())
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const { loadReportFonts } = load()
    await loadReportFonts(urls)
    await loadReportFonts(urls)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it.each([
    ['an HTTP error', async () => ({ ok: false, status: 404, arrayBuffer: async () => fontBytes })],
    ['a network failure', async () => Promise.reject(new TypeError('Failed to fetch'))],
    [
      'an error page instead of a font',
      async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array(40).buffer }),
    ],
  ])('rejects with a font error on %s, registers nothing, and a retry works', async (_, bad) => {
    let failing = true
    const fetchMock = jest.fn(async (url: string) =>
      failing && url === urls.semibold ? bad() : ok()
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const { loadReportFonts, ReportFontError } = load()

    await expect(loadReportFonts(urls)).rejects.toBeInstanceOf(ReportFontError)
    expect(registerReportFonts).not.toHaveBeenCalled()
    // The three that did load are released again.
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3)

    // Back online: the same call succeeds — the failure was not cached.
    failing = false
    await expect(loadReportFonts(urls)).resolves.toBeUndefined()
    expect(registerReportFonts).toHaveBeenCalledTimes(1)
  })
})

describe('renderReportOffThread', () => {
  type Listener = (event: unknown) => void

  /** A scripted stand-in for the report worker. */
  class FakeWorker {
    static instances: FakeWorker[] = []
    static respond: (worker: FakeWorker, message: { id: number }) => void = () => undefined
    listeners = new Map<string, Set<Listener>>()
    terminated = false
    posted: unknown[] = []
    constructor() {
      FakeWorker.instances.push(this)
    }
    addEventListener(type: string, listener: Listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set())
      this.listeners.get(type)!.add(listener)
    }
    removeEventListener(type: string, listener: Listener) {
      this.listeners.get(type)?.delete(listener)
    }
    postMessage(message: { id: number }) {
      this.posted.push(message)
      // A promise job, not a timer: the fake clock below must not hold it back.
      void Promise.resolve().then(() => FakeWorker.respond(this, message))
    }
    emit(type: string, event: unknown) {
      for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event)
    }
    terminate() {
      this.terminated = true
    }
  }

  const content = { locale: 'de' } as never
  const fonts = { regular: 'r', medium: 'm', semibold: 's', bold: 'b' }
  const globals = globalThis as unknown as { Worker?: unknown }

  const client = () => {
    jest.doMock('../createReportWorker', () => ({ createReportWorker: () => new FakeWorker() }))
    return jest.requireActual('../reportWorkerClient') as typeof import('../reportWorkerClient')
  }

  beforeEach(() => {
    jest.resetModules()
    jest.useFakeTimers()
    FakeWorker.instances = []
    globals.Worker = FakeWorker
  })
  afterEach(() => {
    jest.useRealTimers()
    delete globals.Worker
  })

  it('sends the content to the worker and resolves with its blob', async () => {
    const blob = { size: 123 }
    FakeWorker.respond = (worker, message) =>
      worker.emit('message', { data: { id: message.id, ok: true, blob } })
    const { renderReportOffThread } = client()

    await expect(renderReportOffThread(content, fonts)).resolves.toBe(blob)
    expect(FakeWorker.instances).toHaveLength(1)
    expect(FakeWorker.instances[0].posted[0]).toMatchObject({ content, fontUrls: fonts })
  })

  it('reuses the worker for the next report and releases it after a minute idle', async () => {
    FakeWorker.respond = (worker, message) =>
      worker.emit('message', { data: { id: message.id, ok: true, blob: {} } })
    const { renderReportOffThread } = client()

    await renderReportOffThread(content, fonts)
    await renderReportOffThread(content, fonts)
    expect(FakeWorker.instances).toHaveLength(1)
    expect(FakeWorker.instances[0].terminated).toBe(false)

    jest.advanceTimersByTime(61_000)
    expect(FakeWorker.instances[0].terminated).toBe(true)

    await renderReportOffThread(content, fonts)
    expect(FakeWorker.instances).toHaveLength(2)
  })

  it('rejects with the worker’s failure code, never its raw message', async () => {
    FakeWorker.respond = (worker, message) =>
      worker.emit('message', {
        data: { id: message.id, ok: false, code: 'fonts', detail: 'ReportFontError: HTTP 503' },
      })
    const { renderReportOffThread } = client()

    const error = await renderReportOffThread(content, fonts).catch((thrown: unknown) => thrown)
    expect(reportFailureOf(error)).toBe('fonts')
    expect(reportErrorKey(error)).toBe('fonts')
    // The same worker serves the retry.
    FakeWorker.respond = (worker, message) =>
      worker.emit('message', { data: { id: message.id, ok: true, blob: {} } })
    await expect(renderReportOffThread(content, fonts)).resolves.toEqual({})
    expect(FakeWorker.instances).toHaveLength(1)
  })

  it('treats a worker that cannot load as a chunk-load failure and starts a fresh one next time', async () => {
    FakeWorker.respond = (worker) => worker.emit('error', { message: '' })
    const { renderReportOffThread } = client()

    const error = await renderReportOffThread(content, fonts).catch((thrown: unknown) => thrown)
    expect(reportErrorKey(error)).toBe('chunkLoad')
    expect(FakeWorker.instances[0].terminated).toBe(true)

    FakeWorker.respond = (worker, message) =>
      worker.emit('message', { data: { id: message.id, ok: true, blob: {} } })
    await expect(renderReportOffThread(content, fonts)).resolves.toEqual({})
    expect(FakeWorker.instances).toHaveLength(2)
  })

  it('reports a chunk-load failure when the worker bundle cannot be created', async () => {
    jest.doMock('../createReportWorker', () => {
      throw new Error('Loading chunk 42 failed')
    })
    const { renderReportOffThread } = jest.requireActual(
      '../reportWorkerClient'
    ) as typeof import('../reportWorkerClient')
    const error = await renderReportOffThread(content, fonts).catch((thrown: unknown) => thrown)
    expect(reportErrorKey(error)).toBe('chunkLoad')
  })

  it('without workers renders on the calling thread — after the busy state could paint', async () => {
    delete globals.Worker
    const blob = { size: 7 }
    const renderReportPdf = jest.fn(async () => blob)
    jest.doMock('../renderReportPdf', () => ({ renderReportPdf }))
    const { renderReportOffThread } = jest.requireActual(
      '../reportWorkerClient'
    ) as typeof import('../reportWorkerClient')

    const pending = renderReportOffThread(content, fonts)
    // Promise jobs alone do not start the (blocking) render…
    for (let turn = 0; turn < 20; turn++) await Promise.resolve()
    expect(renderReportPdf).not.toHaveBeenCalled()
    // …a turn of the event loop does (no frames here: the 100 ms fallback).
    await jest.advanceTimersByTimeAsync(100)
    await expect(pending).resolves.toBe(blob)
    expect(renderReportPdf).toHaveBeenCalledWith(content, fonts)
    expect(FakeWorker.instances).toHaveLength(0)
  })
})
