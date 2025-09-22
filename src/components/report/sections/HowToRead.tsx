import { ReportSection } from '@/components/report/ReportSection'
import styles from '@/components/report/ReportPrint.module.css'

interface HowToReadProps {
  locale: string
}

export function HowToRead({ locale }: HowToReadProps) {
  const isGerman = locale === 'de'
  return (
    <ReportSection
      id="lesehinweise"
      title={isGerman ? 'So lesen Sie diesen Bericht' : 'How to read this report'}
      lead={
        isGerman
          ? 'Die folgenden Leitplanken helfen dabei, Simulationsergebnisse richtig einzuordnen und nächste Schritte abzuleiten.'
          : 'Use these guidelines to interpret simulation outcomes and prioritise your next steps.'
      }
    >
      <div className={styles.gridTwo}>
        <div className={styles.surface}>
          <h3>{isGerman ? 'Monte-Carlo-Methodik' : 'Monte Carlo methodology'}</h3>
          <p>
            {isGerman
              ? 'Die Simulation bewertet Ihren Ruhestandsplan über viele zufällige Kapitalmarktpfade. Jedes Ergebnis spiegelt ein mögliches Szenario wider; der Median repräsentiert den erwarteten Verlauf.'
              : 'The simulation projects your retirement plan across many random market paths. Each run reflects a plausible scenario; the median represents the expected trajectory.'}
          </p>
          <p>
            {isGerman
              ? 'Bandbreiten (Perzentile) zeigen Stress- sowie Komfortzonen. Die Erfolgswahrscheinlichkeit beschreibt, wie viele der Läufe das Zielvermögen bis zum Planungshorizont sichern konnten.'
              : 'Percentile bands illustrate stress and comfort zones. The success probability shows how many simulations preserve wealth through the full planning horizon.'}
          </p>
        </div>
        <div className={styles.surface}>
          <h3>{isGerman ? 'Interpretation' : 'Interpretation'}</h3>
          <ul>
            <li>
              {isGerman
                ? 'Nutzen Sie den Median (P50) als Referenzpfad für die Planung.'
                : 'Use the median path (P50) as the planning baseline.'}
            </li>
            <li>
              {isGerman
                ? 'P10 illustriert Stressszenarien; prüfen Sie Rücklagen und Versicherungen.'
                : 'P10 highlights stress scenarios—review reserves and protection.'}
            </li>
            <li>
              {isGerman
                ? 'P90 zeigt Chancen bei positiven Marktphasen – geeignet für Upside-Strategien.'
                : 'P90 reveals upside potential in favourable markets.'}
            </li>
            <li>
              {isGerman
                ? 'Empfehlungen priorisieren Maßnahmen nach Wirkung und Umsetzbarkeit.'
                : 'Recommendations rank actions by impact and ease of implementation.'}
            </li>
          </ul>
        </div>
      </div>
    </ReportSection>
  )
}
