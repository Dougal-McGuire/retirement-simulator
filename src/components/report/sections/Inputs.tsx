import { ReportSection } from '@/components/report/ReportSection'
import styles from '@/components/report/ReportPrint.module.css'
import { fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'

interface InputsProps {
  content: ReportContent
}

export function Inputs({ content }: InputsProps) {
  const { profile, assumptions } = content
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'

  return (
    <ReportSection
      id="eingaben"
      title={isGerman ? 'Eingaben und Annahmen' : 'Inputs and assumptions'}
      lead={
        isGerman
          ? 'Überblick über die von Ihnen bereitgestellten Parameter und die getroffenen Modellannahmen.'
          : 'Overview of the parameters you provided and the modelling assumptions applied.'
      }
      breakBefore="page"
    >
      <div className={styles.gridTwo}>
        <div className={styles.surface}>
          <h3>{isGerman ? 'Profil' : 'Profile'}</h3>
          <table aria-label="Profilannahmen">
            <tbody>
              <tr>
                <th scope="row">{isGerman ? 'Aktuelles Alter' : 'Current age'}</th>
                <td>
                  {fmtNumber(profile.person.currentAge, { locale: intlLocale })}{' '}
                  {isGerman ? 'Jahre' : 'years'}
                </td>
              </tr>
              <tr>
                <th scope="row">{isGerman ? 'Geplanter Ruhestand' : 'Planned retirement'}</th>
                <td>
                  {fmtNumber(profile.person.retireAge, { locale: intlLocale })}{' '}
                  {isGerman ? 'Jahre' : 'years'}
                </td>
              </tr>
              <tr>
                <th scope="row">{isGerman ? 'Beginn gesetzliche Rente' : 'State pension start'}</th>
                <td>
                  {fmtNumber(profile.person.pensionAge, { locale: intlLocale })}{' '}
                  {isGerman ? 'Jahre' : 'years'}
                </td>
              </tr>
              <tr>
                <th scope="row">{isGerman ? 'Planungshorizont' : 'Planning horizon'}</th>
                <td>
                  {fmtNumber(profile.person.horizonAge, { locale: intlLocale })}{' '}
                  {isGerman ? 'Jahre' : 'years'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className={styles.surface}>
          <h3>{isGerman ? 'Marktannahmen' : 'Market assumptions'}</h3>
          <table aria-label="Marktannahmen">
            <tbody>
              <tr>
                <th scope="row">{isGerman ? 'Erwartete Rendite (p.a.)' : 'Expected return (p.a.)'}</th>
                <td>{fmtPercent(assumptions.expectedReturn, 1, intlLocale)}</td>
              </tr>
              <tr>
                <th scope="row">{isGerman ? 'Volatilität (p.a.)' : 'Volatility (p.a.)'}</th>
                <td>{fmtPercent(assumptions.returnVolatility, 1, intlLocale)}</td>
              </tr>
              <tr>
                <th scope="row">{isGerman ? 'Inflation' : 'Inflation'}</th>
                <td>{fmtPercent(assumptions.inflation, 1, intlLocale)}</td>
              </tr>
              <tr>
                <th scope="row">{isGerman ? 'Inflations-Streuung' : 'Inflation volatility'}</th>
                <td>{fmtPercent(assumptions.inflationVolatility, 1, intlLocale)}</td>
              </tr>
              <tr>
                <th scope="row">{isGerman ? 'Kapitalertragsteuer' : 'Capital gains tax'}</th>
                <td>{fmtPercent(assumptions.capitalGainsTax, 1, intlLocale)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className={styles.surface}>
        <h3>{isGerman ? 'Simulation' : 'Simulation'}</h3>
        <p>
          {isGerman
            ? `Monte-Carlo mit ${fmtNumber(assumptions.simulationRuns, { locale: intlLocale })} Läufen. Risiken berücksichtigen Ertragsschwankungen, Inflation sowie Steuerbelastung auf Kapitalerträge.`
            : `Monte Carlo with ${fmtNumber(assumptions.simulationRuns, { locale: intlLocale })} runs. Risk drivers include return volatility, inflation, and taxes on capital gains.`}
        </p>
      </div>
    </ReportSection>
  )
}
