import { ReportLayout } from '@/components/report/ReportLayout'
import { inlineReportScript } from '@/components/report/scripts'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'

interface ReportDocumentProps {
  content: ReportContent
  projectionSvg: string
  breakdownSvg: string
}

export function ReportDocument({ content, projectionSvg, breakdownSvg }: ReportDocumentProps) {
  const fontCss = `
    @font-face {
      font-family: 'Inter';
      src: url('/fonts/Inter-Regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Inter';
      src: url('/fonts/Inter-SemiBold.woff2') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
  `

  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Rentenplan</title>
        <link rel="preload" as="font" href="/fonts/Inter-Regular.woff2" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" as="font" href="/fonts/Inter-SemiBold.woff2" type="font/woff2" crossOrigin="anonymous" />
        <style dangerouslySetInnerHTML={{ __html: fontCss }} />
      </head>
      <body>
        <ReportLayout content={content} projectionSvg={projectionSvg} breakdownSvg={breakdownSvg} />
        <script dangerouslySetInnerHTML={{ __html: inlineReportScript() }} />
      </body>
    </html>
  )
}
