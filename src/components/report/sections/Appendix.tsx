import { ReportSection } from '@/components/report/ReportSection'
import styles from '@/components/report/ReportPrint.module.css'
import { fmtNumber } from '@/lib/pdf-generator/formatters'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'

interface AppendixProps {
  content: ReportContent
}

export function Appendix({ content }: AppendixProps) {
  const { assumptions } = content
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'

  return (
    <ReportSection
      id="anhang"
      title={isGerman ? 'Anhang' : 'Appendix'}
      lead={
        isGerman
          ? 'Methodische Hinweise, Definitionen und weitere Kennzahlen.'
          : 'Methodology notes, definitions, and additional metrics.'
      }
      breakBefore="page"
    >
      <div className={styles.surface}>
        <h3>{isGerman ? 'Methodik' : 'Methodology'}</h3>
        <ul>
          <li>
            {isGerman
              ? `Monte-Carlo-Simulation mit ${fmtNumber(assumptions.simulationRuns, { locale: intlLocale })} Durchläufen, Lognormalverteilung für Kapitalmarktpfade.`
              : `Monte Carlo simulation with ${fmtNumber(assumptions.simulationRuns, { locale: intlLocale })} runs using log-normal market paths.`}
          </li>
          <li>
            {isGerman
              ? 'Inflations- und Renditeannahmen werden pro Lauf zufällig gezogen und jährlich neu skaliert.'
              : 'Inflation and return assumptions are randomised per run and rescaled annually.'}
          </li>
          <li>
            {isGerman
              ? 'Entnahmen erfolgen monatlich; Steuern auf Kapitalerträge werden am Jahresende gemäß Annahmen berücksichtigt.'
              : 'Withdrawals occur monthly; capital-gains taxes are applied at year-end per assumptions.'}
          </li>
        </ul>
      </div>
      <div className={styles.surface}>
        <h3>{isGerman ? 'Definitionen' : 'Definitions'}</h3>
        <ul>
          <li>
            {isGerman
              ? 'Erfolgswahrscheinlichkeit: Anteil der Simulationen mit positivem Vermögen am Planungshorizont.'
              : 'Success probability: share of runs ending with positive wealth at the planning horizon.'}
          </li>
          <li>
            {isGerman
              ? 'Planungs-Score: gewichtete Kombination aus Erfolgsquote, Entnahmerate und Liquidität.'
              : 'Planning score: weighted blend of success rate, withdrawal rate, and liquidity.'}
          </li>
          <li>
            {isGerman
              ? 'Überbrückungsphase: Zeitraum zwischen geplantem Ruhestand und erstem gesetzlichen Rentenzufluss.'
              : 'Bridge phase: period between planned retirement and first state pension payment.'}
          </li>
        </ul>
      </div>
      <div className={styles.surface}>
        <h3>{isGerman ? 'Haftungsausschluss' : 'Disclaimer'}</h3>
        <p>
          {isGerman
            ? 'Dieser Bericht ersetzt keine individuelle Beratung. Vergangene Wertentwicklungen sind kein verlässlicher Indikator für zukünftige Ergebnisse. Alle Angaben ohne Gewähr.'
            : 'This report does not replace personalised advice. Past performance is no guarantee of future results. All information provided without warranty.'}
        </p>
      </div>
    </ReportSection>
  )
}
