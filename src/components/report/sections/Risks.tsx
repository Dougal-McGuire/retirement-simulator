import { ReportSection } from '@/components/report/ReportSection'
import styles from '@/components/report/ReportPrint.module.css'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'

interface RisksProps {
  content: ReportContent
}

export function Risks({ content }: RisksProps) {
  const { profile, scenarios } = content
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'
  const reasons = profile.success.reasons

  return (
    <ReportSection
      id="risiken"
      title={isGerman ? 'Risikoeinschätzung' : 'Risk assessment'}
      lead={
        isGerman
          ? 'Zentrale Sensitivitäten des Plans und empfohlene Kontrollen.'
          : 'Key plan sensitivities and suggested safeguards.'
      }
      breakBefore="page"
    >
      <div className={styles.gridTwo}>
        <div className={styles.surface}>
          <h3>{isGerman ? 'Wesentliche Einflussfaktoren' : 'Primary drivers'}</h3>
          <ul>
            {reasons.length
              ? reasons.map((reason) => <li key={reason}>{reason}</li>)
              : [
                  <li key="default">
                    {isGerman
                      ? 'Plan basiert auf ausgewogenem Verhältnis von Entnahme, Sparrate und Liquidität.'
                      : 'Plan balances withdrawals, savings rate, and liquidity.'}
                  </li>,
                ]}
          </ul>
        </div>
        <div className={styles.surface}>
          <h3>{isGerman ? 'Überbrückungsphase' : 'Bridge planning'}</h3>
          {profile.bridge ? (
            <>
              <p>
                {isGerman
                  ? `Zwischen ${fmtNumber(profile.person.retireAge, { locale: intlLocale })} und ${fmtNumber(profile.person.pensionAge, { locale: intlLocale })} Jahren entsteht ein Finanzierungsbedarf von ${fmtCurrency(profile.bridge.cashNeedEUR, intlLocale)}.`
                  : `Between ages ${fmtNumber(profile.person.retireAge, { locale: intlLocale })} and ${fmtNumber(profile.person.pensionAge, { locale: intlLocale })} a funding need of ${fmtCurrency(profile.bridge.cashNeedEUR, intlLocale)} arises.`}
              </p>
              <p>
                {isGerman
                  ? `Empfohlene Cash-Reserven sichern ${fmtNumber(profile.bridge.cashBucketYears ?? 0, { locale: intlLocale })} Jahre mit ${fmtPercent((profile.bridge.cashBucketSharePct ?? 0) / 100, 1, intlLocale)} Anteil der benötigten Mittel.`
                  : `Recommended cash reserves cover ${fmtNumber(profile.bridge.cashBucketYears ?? 0, { locale: intlLocale })} years, representing ${fmtPercent((profile.bridge.cashBucketSharePct ?? 0) / 100, 1, intlLocale)} of required funds.`}
              </p>
            </>
          ) : (
            <p>
              {isGerman
                ? 'Keine Liquiditätslücke zwischen geplantem Ruhestand und gesetzlicher Rente berechnet.'
                : 'No liquidity gap calculated between retirement and state pension.'}
            </p>
          )}
        </div>
      </div>
      {scenarios.length ? (
        <div className={styles.surface}>
          <h3>{isGerman ? 'Szenario-Überblick' : 'Scenario overview'}</h3>
          <ul>
            {scenarios.map((scenario) => (
              <li key={scenario.label}>
                <span className={styles.captionStrong}>{scenario.label}:</span> {scenario.description}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ReportSection>
  )
}
