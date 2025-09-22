import { ReportSection } from '@/components/report/ReportSection'
import styles from '@/components/report/ReportPrint.module.css'
import { fmtCurrency, fmtPercent, fmtNumber } from '@/lib/pdf-generator/formatters'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'

interface SpendingProps {
  content: ReportContent
  breakdownSvg: string
}

export function Spending({ content, breakdownSvg }: SpendingProps) {
  const { expenses } = content
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'
  const totalAnnual = expenses.monthlyTotal * 12 + expenses.annualTotal
  const totalHorizon = expenses.totalHorizonAmount

  return (
    <ReportSection
      id="ausgaben"
      title={isGerman ? 'Ausgabenstruktur' : 'Spending structure'}
      lead={
        isGerman
          ? 'Verteilung der geplanten Ausgaben auf Monatsbudgets und jährliche Sonderposten.'
          : 'Distribution of planned spending across monthly budgets and annual items.'
      }
      breakBefore="page"
    >
      <figure aria-label="Ausgaben nach Kategorien" className={styles.surface} role="group">
        <div aria-hidden dangerouslySetInnerHTML={{ __html: breakdownSvg }} />
        <figcaption>
          <span className={styles.captionStrong}>{isGerman ? 'Jahresbudget:' : 'Annual budget:'}</span>{' '}
          {isGerman
            ? 'Summe der monatlichen Budgets (hochgerechnet) plus Sonderausgaben. Prozentangaben beziehen sich auf das Jahresbudget.'
            : 'Annualised monthly budgets plus one-off expenses. Percentages reference the annual budget.'}
        </figcaption>
      </figure>

      <div
        className={styles.surface}
        data-expense-check
        data-expense-years={expenses.horizonYears}
        data-expense-total={totalHorizon}
        data-expense-annual={totalAnnual}
      >
        <h3>{isGerman ? 'Kategorienübersicht' : 'Category overview'}</h3>
        <table aria-label="Ausgabenübersicht">
          <thead>
            <tr>
              <th scope="col">{isGerman ? 'Kategorie' : 'Category'}</th>
              <th scope="col">{isGerman ? 'Betrag p.a.' : 'Amount p.a.'}</th>
              <th scope="col">{isGerman ? 'Anteil' : 'Share'}</th>
            </tr>
          </thead>
          <tbody>
            {expenses.monthlyCategories.map((item) => (
              <tr key={item.label}>
                <th scope="row">{item.label}</th>
                <td>{fmtCurrency(item.annualAmount, intlLocale)}</td>
                <td>{fmtPercent(item.share, 1, intlLocale)}</td>
              </tr>
            ))}
            {expenses.annualCategories.map((item) => (
              <tr key={`annual-${item.label}`}>
                <th scope="row">{item.label}</th>
                <td>{fmtCurrency(item.annualAmount, intlLocale)}</td>
                <td>{fmtPercent(item.share, 1, intlLocale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          {isGerman
            ? `Summe über ${fmtNumber(expenses.horizonYears, { locale: intlLocale })} Jahre: ${fmtCurrency(totalHorizon, intlLocale)}. Grundlagen: Jahresbudget ${fmtCurrency(totalAnnual, intlLocale)}.`
            : `Total over ${fmtNumber(expenses.horizonYears, { locale: intlLocale })} years: ${fmtCurrency(totalHorizon, intlLocale)}. Based on an annual budget of ${fmtCurrency(totalAnnual, intlLocale)}.`}
        </p>
      </div>
    </ReportSection>
  )
}
