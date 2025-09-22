import { ReportSection } from '@/components/report/ReportSection'
import styles from '@/components/report/ReportPrint.module.css'
import { fmtCurrency, fmtNumber } from '@/lib/pdf-generator/formatters'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'

interface ResultsProps {
  content: ReportContent
  projectionSvg: string
}

export function Results({ content, projectionSvg }: ResultsProps) {
  const { projections } = content
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'
  const lastPoint = projections.milestones[projections.milestones.length - 1]
  const exhaustion = projections.exhaustionAge

  return (
    <ReportSection
      id="ergebnisse"
      title={isGerman ? 'Simulationsergebnisse' : 'Simulation results'}
      lead={
        isGerman
          ? 'Vermögensentwicklung über den Planungshorizont. Der Medianpfad (P50) dient als Referenz, das Perzentilband P10–P90 markiert Stress- und Komfortbereiche.'
          : 'Asset development across the planning horizon. The median path (P50) is the reference; the P10–P90 band highlights stress and comfort zones.'
      }
      breakBefore="page"
    >
      <figure aria-label="Vermögensprojektion" className={styles.surface} role="group">
        <div
          aria-hidden
          dangerouslySetInnerHTML={{ __html: projectionSvg }}
        />
        <figcaption>
          <span className={styles.captionStrong}>{isGerman ? 'Vermögenspfad:' : 'Asset path:'}</span>{' '}
          {isGerman
            ? 'Median (P50) fett markiert, grauer Bereich entspricht P10 bis P90.'
            : 'Median (P50) in bold, shaded band shows P10 to P90.'}
          {exhaustion
            ? isGerman
              ? ` Vermögen im Stressfall erschöpft sich ab Alter ${fmtNumber(exhaustion, { locale: intlLocale })}.`
              : ` Assets run out in the stress path at age ${fmtNumber(exhaustion, { locale: intlLocale })}.`
            : ''}
        </figcaption>
      </figure>
      {lastPoint ? (
        <p>
          {isGerman
            ? `Am Ende des Planungshorizonts (Alter ${fmtNumber(lastPoint.age, { locale: intlLocale })}) verbleibt im Median ein Vermögen von ${fmtCurrency(lastPoint.p50, intlLocale)}.`
            : `By the end of the planning horizon (age ${fmtNumber(lastPoint.age, { locale: intlLocale })}) the median path retains ${fmtCurrency(lastPoint.p50, intlLocale)}.`}
        </p>
      ) : null}
    </ReportSection>
  )
}
