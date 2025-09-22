import { ReportSection } from '@/components/report/ReportSection'
import styles from '@/components/report/ReportPrint.module.css'
import { fmtCurrency, fmtNumber, fmtPercent, fmtSuccessMetric, nnbsp } from '@/lib/pdf-generator/formatters'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'

interface ExecutiveSummaryProps {
  content: ReportContent
}

export function ExecutiveSummary({ content }: ExecutiveSummaryProps) {
  const { profile, expenses } = content
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'
  const success = profile.success
  const bridge = profile.bridge
  const highlights = profile.highlights.length
    ? profile.highlights
    : [
        isGerman
          ? 'Plan durch Risiko- und Liquiditätsanalyse abgesichert'
          : 'Plan covered by risk and liquidity review',
      ]

  const horizonYears = expenses.horizonYears
  const totalSpend = expenses.totalHorizonAmount

  return (
    <ReportSection
      id="zusammenfassung"
      title={isGerman ? 'Zusammenfassung' : 'Executive Summary'}
      lead={
        isGerman
          ? 'Ergebnisse der Monte-Carlo-Simulation mit Fokus auf Erfolgswahrscheinlichkeit, Liquiditätsbedarf und priorisierte Maßnahmen.'
          : 'Results of the Monte Carlo simulation, focusing on success probability, liquidity needs, and prioritised actions.'
      }
      breakBefore="page"
    >
      <div
        className={styles.gridThree}
        data-success-metric
        data-success-count={success.successCount}
        data-success-rate={success.successRate}
        data-success-trials={success.trials}
      >
        <div className={styles.surface}>
          <span className={styles.smallCaps}>
            {isGerman ? 'Erfolgswahrscheinlichkeit' : 'Success probability'}
          </span>
          <span className={styles.kpiValue}>
            {fmtSuccessMetric(success.successCount, success.trials, success.successRate, intlLocale)}
          </span>
          <span className={styles.kpiLabel}>
            {isGerman
              ? 'Simulationen mit ausreichend Vermögen zum Ende des Planungshorizonts'
              : 'Simulations with sufficient wealth at the planning horizon'}
          </span>
        </div>
        <div className={styles.surface}>
          <span className={styles.smallCaps}>{isGerman ? 'Planungs-Score' : 'Planning score'}</span>
          <span className={styles.kpiValue}>
            {success.score !== null ? fmtNumber(success.score, { locale: intlLocale }) : '–'}
          </span>
          <span className={styles.kpiLabel}>
            {success.label
              ? `${isGerman ? 'Einstufung' : 'Rating'}: ${success.label}`
              : isGerman
                ? 'Score in Vorbereitung'
                : 'Score in preparation'}
          </span>
        </div>
        <div className={styles.surface}>
          <span className={styles.smallCaps}>
            {isGerman ? 'Ausgaben über ' : 'Spending over '}
            {fmtNumber(horizonYears, { locale: intlLocale })}
            {nnbsp}
            {isGerman ? 'Jahre' : 'years'}
          </span>
          <span className={styles.kpiValue}>{fmtCurrency(totalSpend, intlLocale)}</span>
          <span className={styles.kpiLabel}>
            {isGerman
              ? 'Enthält fixe und variable Lebenshaltungskosten gemäß Annahmen'
              : 'Includes fixed and variable living costs according to assumptions'}
          </span>
        </div>
      </div>

      <div className={styles.gridTwo}>
        <div className={styles.surface}>
          <h3>{isGerman ? 'Priorisierte Erkenntnisse' : 'Prioritised insights'}</h3>
          <ul>
            {highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className={styles.surface}>
          <h3>{isGerman ? 'Liquiditätsbedarf bis Rente' : 'Liquidity needs until pension'}</h3>
          {bridge ? (
            <>
              <p>
                {isGerman
                  ? `Zwischen dem geplanten Ruhestand mit ${fmtNumber(profile.person.retireAge, { locale: intlLocale })} Jahren und dem Rentenbeginn mit ${fmtNumber(profile.person.pensionAge, { locale: intlLocale })} Jahren entsteht ein Liquiditätsbedarf von ${fmtCurrency(bridge.cashNeedEUR, intlLocale)}.`
                  : `Between retirement at age ${fmtNumber(profile.person.retireAge, { locale: intlLocale })} and the state pension at ${fmtNumber(profile.person.pensionAge, { locale: intlLocale })}, liquidity of ${fmtCurrency(bridge.cashNeedEUR, intlLocale)} is required.`}
              </p>
              <p>
                {isGerman
                  ? `Empfohlene Cash-Quote für die ersten ${fmtNumber(bridge.cashBucketYears ?? 0, { locale: intlLocale })} Jahre: ${fmtPercent((bridge.cashBucketSharePct ?? 0) / 100, 1, intlLocale)}. Portfolioanteil: ${fmtPercent((bridge.portfolioSharePct ?? 0) / 100, 1, intlLocale)}.`
                  : `Suggested cash share for the first ${fmtNumber(bridge.cashBucketYears ?? 0, { locale: intlLocale })} years: ${fmtPercent((bridge.cashBucketSharePct ?? 0) / 100, 1, intlLocale)}. Portfolio share: ${fmtPercent((bridge.portfolioSharePct ?? 0) / 100, 1, intlLocale)}.`}
              </p>
            </>
          ) : (
            <p>
              {isGerman
                ? 'Kein zusätzlicher Liquiditätsbedarf zwischen Ruhestand und gesetzlicher Rente identifiziert.'
                : 'No additional liquidity requirement identified between retirement and state pension.'}
            </p>
          )}
        </div>
      </div>
    </ReportSection>
  )
}
