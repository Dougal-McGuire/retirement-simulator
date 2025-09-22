import styles from '@/components/report/ReportPrint.module.css'
import { fmtDate } from '@/lib/pdf-generator/formatters'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { Cover } from '@/components/report/sections/Cover'
import { ExecutiveSummary } from '@/components/report/sections/ExecutiveSummary'
import { HowToRead } from '@/components/report/sections/HowToRead'
import { TableOfContents } from '@/components/report/sections/TableOfContents'
import { Inputs } from '@/components/report/sections/Inputs'
import { Results } from '@/components/report/sections/Results'
import { Spending } from '@/components/report/sections/Spending'
import { Risks } from '@/components/report/sections/Risks'
import { Recommendations } from '@/components/report/sections/Recommendations'
import { Appendix } from '@/components/report/sections/Appendix'

interface ReportLayoutProps {
  content: ReportContent
  projectionSvg: string
  breakdownSvg: string
}

export function ReportLayout({ content, projectionSvg, breakdownSvg }: ReportLayoutProps) {
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'
  const reportDate = fmtDate(content.metadata.generatedAt, intlLocale)

  const tocItems = [
    { id: 'zusammenfassung', label: isGerman ? 'Zusammenfassung' : 'Executive Summary' },
    { id: 'lesehinweise', label: isGerman ? 'So lesen Sie diesen Bericht' : 'How to read this report' },
    { id: 'eingaben', label: isGerman ? 'Eingaben und Annahmen' : 'Inputs and assumptions' },
    { id: 'ergebnisse', label: isGerman ? 'Simulationsergebnisse' : 'Simulation results' },
    { id: 'ausgaben', label: isGerman ? 'Ausgabenstruktur' : 'Spending structure' },
    { id: 'risiken', label: isGerman ? 'Risikoeinschätzung' : 'Risk assessment' },
    { id: 'empfehlungen', label: isGerman ? 'Empfohlene Maßnahmen' : 'Recommended actions' },
    { id: 'anhang', label: isGerman ? 'Anhang' : 'Appendix' },
  ]

  return (
    <>
      <header
        aria-hidden
        data-print-visible
        data-date={reportDate}
        data-title={isGerman ? 'Rentenplan' : 'Retirement Plan'}
        data-page-label={isGerman ? 'Seite' : 'Page'}
        data-page-of={isGerman ? 'von' : 'of'}
      />
      <footer
        aria-hidden
        data-print-visible
        data-page-label={isGerman ? 'Seite' : 'Page'}
        data-page-of={isGerman ? 'von' : 'of'}
      />
      <main className={styles.reportMain} data-locale={locale}>
        <Cover content={content} />
        <ExecutiveSummary content={content} />
        <HowToRead locale={locale} />
        <TableOfContents
          title={isGerman ? 'Inhaltsverzeichnis' : 'Table of contents'}
          ariaLabel={isGerman ? 'Inhaltsverzeichnis' : 'Table of contents'}
          items={tocItems}
        />
        <Inputs content={content} />
        <Results content={content} projectionSvg={projectionSvg} />
        <Spending content={content} breakdownSvg={breakdownSvg} />
        <Risks content={content} />
        <Recommendations content={content} />
        <Appendix content={content} />
      </main>
    </>
  )
}
