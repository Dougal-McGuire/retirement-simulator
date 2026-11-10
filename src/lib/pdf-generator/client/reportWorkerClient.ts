import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import type { ReportFontSources } from '@/lib/pdf-generator/react-pdf/fonts'
import { ReportGenerationError } from './reportErrors'
import type { ReportWorkerRequest, ReportWorkerResponse } from './report.worker'

/**
 * Main-thread side of the report worker.
 *
 * The worker is created on the first report and kept while reports are being
 * made (its parsed fonts make the next one fast), then released after a
 * minute of idleness — react-pdf plus four fonts is memory a page should not
 * hold for a feature used once or twice per visit.
 */
const IDLE_RELEASE_MS = 60_000

let worker: Worker | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
let nextRequestId = 0

const canUseWorker = () => typeof Worker !== 'undefined'

function release() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  worker?.terminate()
  worker = null
}

function scheduleRelease() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(release, IDLE_RELEASE_MS)
}

async function getWorker(): Promise<Worker> {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  if (worker) return worker
  try {
    const { createReportWorker } = await import('./createReportWorker')
    worker = createReportWorker()
  } catch (error) {
    throw new ReportGenerationError('chunkLoad', error)
  }
  return worker
}

function renderInWorker(
  target: Worker,
  content: ReportContent,
  fontUrls: ReportFontSources
): Promise<Blob> {
  const id = nextRequestId++
  return new Promise<Blob>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener('message', onMessage)
      target.removeEventListener('error', onError)
      target.removeEventListener('messageerror', onError)
    }
    const onMessage = (event: MessageEvent<ReportWorkerResponse>) => {
      if (event.data.id !== id) return
      cleanup()
      if (event.data.ok) resolve(event.data.blob)
      else reject(new ReportGenerationError(event.data.code, new Error(event.data.detail)))
    }
    // The worker script could not be fetched or evaluated (offline, or a
    // deploy replaced it), or it died. Either way this worker is unusable:
    // drop it so the next report starts a fresh one.
    const onError = (event: Event) => {
      cleanup()
      release()
      const message = (event as { message?: unknown }).message
      const detail = typeof message === 'string' && message ? message : 'worker error'
      reject(new ReportGenerationError('chunkLoad', new Error(detail)))
    }
    target.addEventListener('message', onMessage)
    target.addEventListener('error', onError)
    target.addEventListener('messageerror', onError)
    target.postMessage({ id, content, fontUrls } satisfies ReportWorkerRequest)
  })
}

/**
 * Resolves once the browser has had the chance to paint — a frame, or 100 ms
 * where frames are not being produced (a hidden tab).
 */
function afterNextPaint(): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 100)
    if (typeof requestAnimationFrame !== 'function') return
    requestAnimationFrame(() => {
      clearTimeout(timer)
      setTimeout(resolve, 0)
    })
  })
}

/**
 * Renders `content` to a PDF blob without blocking the page: in the report
 * worker. Where there are no workers it renders on the calling thread, which
 * blocks it for the duration (react-pdf lays out and writes the document in
 * one go) — so the button's busy state is painted first.
 */
export async function renderReportOffThread(
  content: ReportContent,
  fontUrls: ReportFontSources
): Promise<Blob> {
  if (!canUseWorker()) {
    let inThread: typeof import('./renderReportPdf')
    try {
      inThread = await import('./renderReportPdf')
    } catch (error) {
      throw new ReportGenerationError('chunkLoad', error)
    }
    await afterNextPaint()
    return inThread.renderReportPdf(content, fontUrls)
  }

  const target = await getWorker()
  try {
    return await renderInWorker(target, content, fontUrls)
  } finally {
    if (worker) scheduleRelease()
  }
}
