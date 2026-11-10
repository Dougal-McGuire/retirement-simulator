import type { ReportFontSources } from './fonts'

/**
 * URLs of the report's font files as static assets of this app.
 *
 * `new URL(<file>, import.meta.url)` is the bundler's asset pattern: the build
 * copies each TTF to `/_next/static/media/<name>.<hash>.ttf` and puts that URL
 * here. They are therefore served from the app's own origin, and — being
 * content-hashed — with an immutable cache lifetime, so a report can be
 * generated offline once the files have been fetched.
 *
 * Browser-only, and isolated in its own module: `import.meta` cannot be parsed
 * by the CommonJS test transform, so nothing that Jest loads may import this
 * file (compare `createSimulationWorker.ts`).
 */
export const REPORT_FONT_URLS: ReportFontSources = {
  regular: new URL('./fonts/Inter-Regular.ttf', import.meta.url).href,
  medium: new URL('./fonts/Inter-Medium.ttf', import.meta.url).href,
  semibold: new URL('./fonts/Inter-SemiBold.ttf', import.meta.url).href,
  bold: new URL('./fonts/Inter-Bold.ttf', import.meta.url).href,
}
