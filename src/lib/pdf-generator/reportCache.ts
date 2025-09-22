import type { ReportData } from '@/lib/pdf-generator/schema/reportData'

type ReportCache = Map<string, ReportData>

type GlobalWithCache = typeof globalThis & {
  __REPORT_CACHE__?: ReportCache
}

export function getReportCache(): ReportCache {
  const globalRef = globalThis as GlobalWithCache
  if (!globalRef.__REPORT_CACHE__) {
    globalRef.__REPORT_CACHE__ = new Map<string, ReportData>()
  }
  return globalRef.__REPORT_CACHE__
}

export function consumeReportFromCache(key: string): ReportData | undefined {
  const cache = getReportCache()
  const data = cache.get(key)
  if (data) {
    cache.delete(key)
  }
  return data
}
