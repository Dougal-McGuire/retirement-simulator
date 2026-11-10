import type { SimulationParams, SimulationResults } from '@/types'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { REPORT_FONT_URLS } from '@/lib/pdf-generator/react-pdf/fontAssets'
import type { ReportFontSources } from '@/lib/pdf-generator/react-pdf/fonts'
import { measureLeverEffects, type LeverEffects } from '@/lib/insights/leverEffects'
import { runSimulationInClient } from '@/lib/simulation/workerClient'
import { ReportGenerationError } from './reportErrors'
import { renderReportOffThread } from './reportWorkerClient'

/**
 * The whole PDF pipeline, in the browser.
 *
 * This module is the report's lazy chunk: `GenerateReportButton` imports it on
 * click, so nothing here costs anything until a report is asked for. It
 *
 *  1. measures the three stress levers on the simulation worker (the same
 *     scenarios, paths and run count as the workspace's lever list — reused
 *     from this page's cache when the plan was measured before),
 *  2. builds the report's content on the main thread (a few milliseconds),
 *  3. hands it to the report worker, where react-pdf lays the pages out and
 *     encodes the file.
 *
 * Nothing in here talks to a server — the plan, its results and its name
 * never leave the tab. The only requests are GETs for this chunk, the worker
 * bundle and the four font files, all from the app's own origin.
 */

export type ReportLocale = 'de' | 'en'

export interface GenerateReportInput {
  params: SimulationParams
  results: SimulationResults
  locale: ReportLocale
  /** Printed on the cover; defaults to no plan line. */
  planName?: string
  /** The dashboard's Nominal / Heutige € switch at the time of export. */
  displayReal: boolean
}

/**
 * How long the lever measurement may hold the report up. Three simulations at
 * the plan's own run count take well under a second for the default plan; a
 * plan with a very large run count on a slow device gets its report without
 * the lever table rather than after a minute.
 */
const LEVER_MEASUREMENT_TIMEOUT_MS = 20_000

/**
 * The measured levers, or `null` — never an estimate. A failed or slow
 * measurement costs the report its lever table, nothing else.
 */
async function measuredLevers(results: SimulationResults): Promise<LeverEffects | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LEVER_MEASUREMENT_TIMEOUT_MS)
  })
  try {
    return await Promise.race([measureLeverEffects(results, runSimulationInClient), timeout])
  } catch (error) {
    console.warn('Report: the levers could not be measured; the table is left out.', error)
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function generateReportPdf(input: GenerateReportInput): Promise<Blob> {
  const { params, results, locale, planName, displayReal } = input

  const leverEffects = await measuredLevers(results)

  let content: ReturnType<typeof mapReportDataToContent>
  try {
    const data = transformToReportData(params, results, planName, locale, {
      displayReal,
      leverEffects,
    })
    content = mapReportDataToContent({ ...data, locale })
  } catch (error) {
    throw new ReportGenerationError('render', error)
  }

  return renderReportOffThread(content, absoluteFontUrls())
}

/**
 * The bundler hands out root-relative asset URLs. The worker runs from a
 * `blob:` URL, which has no origin to resolve them against, so they are made
 * absolute here, on the page.
 */
function absoluteFontUrls(): ReportFontSources {
  const base = globalThis.location?.href
  const absolute = (url: string) => (base ? new URL(url, base).href : url)
  return {
    regular: absolute(REPORT_FONT_URLS.regular),
    medium: absolute(REPORT_FONT_URLS.medium),
    semibold: absolute(REPORT_FONT_URLS.semibold),
    bold: absolute(REPORT_FONT_URLS.bold),
  }
}
