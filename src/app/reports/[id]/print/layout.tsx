import type { ReactNode } from 'react'
import { COLOR_SCHEME_ATTRIBUTE } from '@/lib/colorScheme'
import { ForceLightColorScheme } from '@/components/report/ForceLightColorScheme'

/**
 * The legacy print report hardcodes light colours, so the page around it must
 * not follow a dark OS or a stored "dark" preference. This runs right after
 * the root layout's colour-scheme script and before the report paints, pinning
 * `<html data-color-scheme="light">` (which also switches off the
 * prefers-color-scheme media query in interface.css). `ForceLightColorScheme`
 * keeps it pinned if React re-renders the root on the client.
 */
const FORCE_LIGHT_SCRIPT = `document.documentElement.setAttribute(${JSON.stringify(
  COLOR_SCHEME_ATTRIBUTE
)},"light")`

export default function ReportPrintLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: FORCE_LIGHT_SCRIPT }} />
      <ForceLightColorScheme />
      {children}
    </>
  )
}
