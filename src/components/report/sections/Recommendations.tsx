import { ReportSection } from '@/components/report/ReportSection'
import styles from '@/components/report/ReportPrint.module.css'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'

interface RecommendationsProps {
  content: ReportContent
}

export function Recommendations({ content }: RecommendationsProps) {
  const recs = content.recommendations.primary
  const locale = content.locale ?? 'de'
  const isGerman = locale === 'de'

  return (
    <ReportSection
      id="empfehlungen"
      title={isGerman ? 'Empfohlene Maßnahmen' : 'Recommended actions'}
      lead={
        isGerman
          ? 'Priorisierte Schritte zur Erhöhung der Planrobustheit. Reihenfolge berücksichtigt Wirkung, Umsetzbarkeit und zeitlichen Horizont.'
          : 'Prioritised steps to strengthen plan resilience, ordered by impact, feasibility, and timing.'
      }
      breakBefore="page"
    >
      {recs.length ? (
        <div className={styles.gridTwo}>
          {recs.map((rec, index) => (
            <article className={styles.surface} key={`${rec.title}-${index}`}>
              <h3>{rec.title}</h3>
              <p className={styles.muted}>{rec.category}</p>
              <p>{rec.body}</p>
              {rec.impact ? (
                <p className={styles.callout}>
                  {isGerman ? 'Wirkungsstärke' : 'Impact'}: {rec.impact}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p>
          {isGerman
            ? 'Keine Empfehlungen erforderlich. Alle Annahmen liegen innerhalb der definierten Zielbandbreiten.'
            : 'No recommendations required. All assumptions sit within the defined target bands.'}
        </p>
      )}
    </ReportSection>
  )
}
