import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtDate, fmtNumber, nbsp } from '@/lib/pdf-generator/formatters'
import styles from '@/components/report/ReportPrint.module.css'

interface CoverProps {
  content: ReportContent
}

export function Cover({ content }: CoverProps) {
  const { metadata, profile, expenses } = content
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'
  const horizonLabel = `${profile.person.currentAge}-${profile.person.horizonAge}`
  const averageAnnualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal

  return (
    <section aria-labelledby="deckblatt" className={styles.cover} data-section="cover" id="deckblatt">
      <h1 id="deckblatt">{isGerman ? 'Rentenplan' : 'Retirement Plan'}</h1>
      <p className={styles.lead}>
        {isGerman
          ? `Individuelle Monte-Carlo-Analyse für ${profile.householdName ?? 'Ihre Haushaltsplanung'} mit Fokus auf nachhaltigem Ruhestandseinkommen.`
          : `Personalised Monte Carlo analysis for ${profile.householdName ?? 'your household plan'} with a focus on sustainable retirement income.`}
      </p>
      <div className={styles.metaList}>
        <div>
          <span className={styles.smallCaps}>{isGerman ? 'Berichts-ID' : 'Report ID'}</span>
          <p className={styles.muted}>{metadata.id}</p>
        </div>
        <div>
          <span className={styles.smallCaps}>{isGerman ? 'Erstellt am' : 'Generated on'}</span>
          <p className={styles.muted}>{fmtDate(metadata.generatedAt, intlLocale)}</p>
        </div>
        <div>
          <span className={styles.smallCaps}>{isGerman ? 'Planungshorizont' : 'Planning horizon'}</span>
          <p className={styles.muted}>{horizonLabel + nbsp + (isGerman ? 'Jahre' : 'years')}</p>
        </div>
        <div>
          <span className={styles.smallCaps}>{isGerman ? 'Ø Jahresbudget' : 'Avg annual budget'}</span>
          <p className={styles.muted}>{fmtCurrency(averageAnnualSpend, intlLocale)}</p>
        </div>
      </div>
      {profile.success.score !== null ? (
        <div className={styles.badgeRow}>
          <span className={styles.badge}>
            {isGerman ? 'Planungs-Score' : 'Planning score'}: {fmtNumber(profile.success.score, { locale: intlLocale })}
          </span>
        </div>
      ) : null}
    </section>
  )
}
