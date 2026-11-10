import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { SectionHeader } from '../primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { deriveKeyFindings, type FindingTone } from '@/lib/pdf-generator/insights/keyFindings'
import {
  fmtCurrency,
  fmtNumber,
  fmtPercent,
  fmtRatioPercent,
} from '@/lib/pdf-generator/formatters'
import { allPensionsSwitchedOff } from '@/lib/pdf-generator/pensionSwitch'
import { buildEuroUnitCopy } from '@/lib/pdf-generator/euroUnitCopy'
import { planBandOfRate, type PlanBand } from '@/lib/pdf-generator/planScoreCopy'

interface ExecutiveSummaryProps {
  content: ReportContent
  sectionNumber?: string
}

/**
 * The success rate is coloured by the app's band for it (`getPlanHealth`).
 * The plan score has no colour of its own: its band is not derived from it.
 */
const BAND_COLORS: Record<PlanBand, string> = {
  strong: tokens.colors.success[600],
  watch: tokens.colors.warning[600],
  strained: tokens.colors.danger[600],
}

const TONE_COLORS: Record<FindingTone, string> = {
  positive: tokens.colors.success[600],
  neutral: tokens.colors.accent[600],
  risk: tokens.colors.danger[600],
}

/** A label/value pair with an explicit unit caption underneath the label. */
function DataRow({
  label,
  unit,
  value,
  last,
}: {
  label: string
  unit?: string
  value: string
  last?: boolean
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingVertical: 4.5,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: tokens.colors.ink[200],
      }}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ fontSize: 8, color: tokens.colors.ink[700] }}>{label}</Text>
        {unit && (
          <Text style={{ fontSize: 6.5, color: tokens.colors.ink[500], marginTop: 1 }}>{unit}</Text>
        )}
      </View>
      <Text style={{ fontSize: 8.5, fontWeight: 600, color: tokens.colors.ink[900] }}>{value}</Text>
    </View>
  )
}

export function ExecutiveSummary({ content, sectionNumber = '01' }: ExecutiveSummaryProps) {
  const { profile, expenses, assumptions, finances, simulation, ledger, projections } = content
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const annualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal
  const pensionAnnual = finances.monthlyPension * 12
  const pensionsOff = allPensionsSwitchedOff(expenses)
  const confidence = profile.success.successRate
  const confidenceColor = BAND_COLORS[planBandOfRate(confidence)]
  const findings = deriveKeyFindings(content)
  const unitCopy = buildEuroUnitCopy(content.units, content.locale)

  const componentLabels: Record<string, string> = {
    success: isGerman ? 'Erfolgsquote' : 'Success rate',
    withdrawal: isGerman ? 'Entnahmerate (1. Ruhestandsjahr)' : 'Withdrawal rate (year 1)',
  }
  const components = profile.success.components
  const scoreFormula =
    components.length > 1
      ? components
          .map(
            (component) =>
              `${componentLabels[component.id] ?? component.id} × ${fmtRatioPercent(component.weight, 0, locale)}`
          )
          .join(' + ')
      : isGerman
        ? 'entspricht der Erfolgsquote'
        : 'equals the success rate'

  const perYear = isGerman ? 'pro Jahr' : 'per year'
  const meanOfRuns =
    simulation.marketModel === 'historical'
      ? isGerman
        ? 'Mittel der Startjahre'
        : 'mean across start years'
      : isGerman
        ? 'Mittel der Läufe'
        : 'mean across runs'

  // What the portfolio actually pays out once the pension runs — the ledger's
  // booking for that year, not "budget minus gross pension". Falls back to the
  // first retirement year for a plan without a pension.
  const pensionYear = ledger?.pensionYear ?? null
  const firstYear = ledger?.firstRetirementYear ?? null
  const withdrawalRow = pensionYear
    ? {
        label: isGerman
          ? `Depotentnahme im Alter ${pensionYear.age}`
          : `Portfolio withdrawal at age ${pensionYear.age}`,
        unit: `${
          pensionYear.firstPensionYear
            ? isGerman
              ? 'erstes Rentenjahr'
              : 'first pension year'
            : isGerman
              ? 'Rente läuft'
              : 'pension paying'
        }, ${meanOfRuns}, ${unitCopy.tag}`,
        value: fmtCurrency(pensionYear.portfolioWithdrawal, locale),
      }
    : firstYear
      ? {
          label: isGerman
            ? `Depotentnahme im Alter ${firstYear.age}`
            : `Portfolio withdrawal at age ${firstYear.age}`,
          unit: `${isGerman ? 'erstes Ruhestandsjahr' : 'first retirement year'}, ${meanOfRuns}, ${unitCopy.tag}`,
          value: fmtCurrency(firstYear.portfolioWithdrawal, locale),
        }
      : null
  const withdrawalRate = projections.ratios?.firstYearWithdrawalRate ?? null

  const { person } = profile
  const medianAt = (age: number) =>
    content.projections.milestones.find((milestone) => milestone.age === age)?.p50
  const timelineStops: Array<{ key: string; age: number; label: string; emphasis?: boolean }> = [
    { key: 'today', age: person.currentAge, label: isGerman ? 'Heute' : 'Today' },
    {
      key: 'retire',
      age: person.retireAge,
      label: isGerman ? 'Ruhestand' : 'Retirement',
      emphasis: true,
    },
    {
      key: 'pension',
      age: person.pensionAge,
      label: isGerman ? 'Gesetzl. Rentenalter' : 'Statutory pension age',
      emphasis: true,
    },
    { key: 'horizon', age: person.horizonAge, label: isGerman ? 'Planungsende' : 'Horizon' },
  ]
  const timeline = timelineStops
    .filter((stop, index, all) => all.findIndex((other) => other.age === stop.age) === index)
    .map((stop) => {
      // Today is the capital that was entered. Every simulated value is the
      // end of the year of that age — the first of them already includes a
      // year of savings and returns.
      if (stop.key === 'today') {
        return {
          ...stop,
          value: isGerman
            ? `Vermögen ${fmtCurrency(finances.currentAssets, locale)} (Eingabe)`
            : `assets ${fmtCurrency(finances.currentAssets, locale)} (as entered)`,
        }
      }
      const median = medianAt(stop.age)
      return {
        ...stop,
        value:
          median === undefined
            ? '–'
            : isGerman
              ? `Median ${fmtCurrency(median, locale)} zum Jahresende`
              : `median ${fmtCurrency(median, locale)} at year-end`,
      }
    })

  return (
    <View>
      <SectionHeader
        number={sectionNumber}
        overline={isGerman ? 'Zusammenfassung' : 'Summary'}
        title={isGerman ? 'Management Summary' : 'Management Summary'}
        lead={
          isGerman
            ? 'Kompakte Beurteilung Ihrer Ruhestandsstrategie auf Basis der aktuellen Simulationsdaten.'
            : 'Compact assessment of your retirement strategy based on the current simulation data.'
        }
      />

      {/* Which euro every projected figure below is in — the app's € switch. */}
      <Text
        style={{
          fontSize: 7.5,
          color: tokens.colors.ink[600],
          lineHeight: 1.45,
          marginBottom: 8,
        }}
      >
        {unitCopy.statement}
      </Text>

      {/* KPI row */}
      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
        <View style={[styles.cardAccent, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Erfolgsquote' : 'Success Rate'}</Text>
          <Text style={[styles.kpiValue, { color: confidenceColor }]}>
            {fmtPercent(confidence, 1, locale)}
          </Text>
          {/* Gauge */}
          <View
            style={{
              height: 4,
              backgroundColor: tokens.colors.ink[100],
              borderRadius: 2,
              marginTop: 7,
            }}
          >
            <View
              style={{
                width: `${Math.max(2, Math.min(100, confidence * 100))}%`,
                height: 4,
                backgroundColor: confidenceColor,
                borderRadius: 2,
              }}
            />
          </View>
          {/* Counts come from the simulation context, so a historical backtest
              reports 118/125 real start years rather than a fabricated
              "472 / 500" that no Monte Carlo ever ran. The band is the app's
              grading of this very rate. */}
          <Text style={styles.kpiDescription}>
            {fmtNumber(simulation.successCount, { locale })} /{' '}
            {fmtNumber(simulation.effectiveRuns, { locale })}
            {simulation.marketModel === 'historical'
              ? isGerman
                ? ' historische Startjahre erfolgreich'
                : ' historical start years succeed'
              : isGerman
                ? ' Läufe erfolgreich'
                : ' successful runs'}
            {profile.success.label
              ? isGerman
                ? ` · Einstufung: ${profile.success.label}`
                : ` · graded: ${profile.success.label}`
              : ''}
          </Text>
        </View>

        <View style={[styles.cardAccent, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Planungs-Score' : 'Plan Score'}</Text>
          <Text style={styles.kpiValue}>
            {profile.success.score !== null
              ? `${fmtNumber(profile.success.score, { locale })} / 100`
              : '–'}
          </Text>
          <Text style={styles.kpiDescription}>
            {profile.success.score !== null
              ? scoreFormula
              : isGerman
                ? 'Nicht verfügbar'
                : 'Not available'}
          </Text>
        </View>

        <View style={[styles.cardAccent, { flex: 1, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Jahresbudget' : 'Annual Budget'}</Text>
          <Text style={styles.kpiValue}>{fmtCurrency(annualSpend, locale)}</Text>
          <Text style={styles.kpiDescription}>
            {isGerman
              ? `Ausgaben pro Jahr, ${unitCopy.inputTag} · ${fmtNumber(simulation.horizonYears, { locale })} Jahre Horizont`
              : `Spending per year, ${unitCopy.inputTag} · ${fmtNumber(simulation.horizonYears, { locale })} year horizon`}
          </Text>
        </View>
      </View>

      {/* Findings / planning data */}
      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
        <View style={[styles.card, { width: '57%', marginRight: 10, marginBottom: 0 }]}>
          <Text style={[styles.cardTitle, { marginBottom: 3 }]}>
            {isGerman ? 'Kernbefunde' : 'Key Findings'}
          </Text>
          <Text style={{ fontSize: 7, color: tokens.colors.ink[500], marginBottom: 8 }}>
            {isGerman
              ? `Direkt aus dem Simulationsergebnis abgeleitet; Entnahmen, Renten und Ausgaben sind das ${meanOfRuns}. Maßnahmen folgen in Abschnitt 05.`
              : `Derived directly from the simulation output; withdrawals, pensions and spending are the ${meanOfRuns}. Actions follow in section 05.`}
          </Text>
          {findings.map((finding) => (
            <View key={finding.id} style={{ flexDirection: 'row', marginBottom: 6 }}>
              <View
                style={{
                  width: 4,
                  height: 4,
                  backgroundColor: TONE_COLORS[finding.tone],
                  marginTop: 3.5,
                  marginRight: 6,
                }}
              />
              <Text
                style={{ flex: 1, fontSize: 8.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}
              >
                {finding.text}
              </Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { flex: 1, marginBottom: 0 }]}>
          <Text style={styles.cardTitle}>{isGerman ? 'Planungsdaten' : 'Planning Data'}</Text>
          <DataRow
            label={isGerman ? 'Renditeerwartung' : 'Expected return'}
            unit={isGerman ? 'nominal p.a.' : 'nominal p.a.'}
            value={fmtPercent(assumptions.expectedReturn, 1, locale)}
          />
          <DataRow
            label={isGerman ? 'Inflation' : 'Inflation'}
            unit={isGerman ? 'p.a.' : 'p.a.'}
            value={fmtPercent(assumptions.inflation, 1, locale)}
          />
          <DataRow
            label={isGerman ? 'Rente laut Eingabe' : 'Pension as entered'}
            unit={
              pensionsOff
                ? isGerman
                  ? 'keine Rente berücksichtigt'
                  : 'no pension included'
                : isGerman
                  ? `${fmtCurrency(finances.monthlyPension, locale)} monatlich, brutto`
                  : `${fmtCurrency(finances.monthlyPension, locale)} monthly, gross`
            }
            value={fmtCurrency(pensionAnnual, locale)}
          />
          <DataRow
            label={isGerman ? 'Ausgaben laut Eingabe' : 'Spending as entered'}
            unit={`${perYear}, ${unitCopy.inputTag}`}
            value={fmtCurrency(annualSpend, locale)}
            last={!withdrawalRow && withdrawalRate === null}
          />
          {withdrawalRow && (
            <DataRow
              label={withdrawalRow.label}
              unit={withdrawalRow.unit}
              value={withdrawalRow.value}
              last={withdrawalRate === null}
            />
          )}
          {withdrawalRate !== null && (
            <DataRow
              label={isGerman ? 'Entnahmerate' : 'Withdrawal rate'}
              unit={
                isGerman
                  ? 'erstes Ruhestandsjahr, Entnahme / Depot'
                  : 'first retirement year, withdrawal / portfolio'
              }
              value={fmtRatioPercent(withdrawalRate, 1, locale)}
              last
            />
          )}
        </View>
      </View>

      {/* Score composition — shows the arithmetic behind the number above */}
      {components.length > 0 && profile.success.score !== null && (
        <View style={[styles.card, { marginBottom: 10 }]}>
          <Text style={[styles.cardTitle, { marginBottom: 3 }]}>
            {isGerman ? 'Wie der Planungs-Score entsteht' : 'How the Plan Score Is Built'}
          </Text>
          <Text style={{ fontSize: 7, color: tokens.colors.ink[500], marginBottom: 8 }}>
            {components.length > 1
              ? isGerman
                ? 'Gewichteter Mittelwert der Teilwerte, gerundet auf ganze Punkte. Die Einstufung richtet sich allein nach der Erfolgsquote.'
                : 'Weighted mean of the sub-scores, rounded to whole points. The grading follows the success rate alone.'
              : isGerman
                ? 'Entspricht der Erfolgsquote, gerundet auf ganze Punkte.'
                : 'Equals the success rate, rounded to whole points.'}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            {components.map((component, index) => (
              <View
                key={component.id}
                style={{
                  flex: 1,
                  marginRight: index < components.length - 1 ? 12 : 0,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 3,
                  }}
                >
                  <Text style={{ fontSize: 7.5, color: tokens.colors.ink[700] }}>
                    {componentLabels[component.id] ?? component.id}
                  </Text>
                  <Text style={{ fontSize: 7, color: tokens.colors.ink[500] }}>
                    {fmtRatioPercent(component.weight, 0, locale)}
                  </Text>
                </View>
                <View
                  style={{ height: 5, backgroundColor: tokens.colors.ink[100], borderRadius: 2.5 }}
                >
                  <View
                    style={{
                      width: `${Math.max(2, Math.min(100, component.value))}%`,
                      height: 5,
                      backgroundColor: tokens.colors.accent[600],
                      borderRadius: 2.5,
                    }}
                  />
                </View>
                <Text style={{ fontSize: 7, color: tokens.colors.ink[600], marginTop: 3 }}>
                  {fmtNumber(component.value, { locale, maximumFractionDigits: 1 })} / 100 ·{' '}
                  {isGerman ? 'Beitrag' : 'contributes'}{' '}
                  {fmtNumber(component.value * component.weight, {
                    locale,
                    maximumFractionDigits: 1,
                  })}
                </Text>
              </View>
            ))}
          </View>
          {profile.success.reasons.length > 0 && (
            <View
              style={{
                marginTop: 8,
                paddingTop: 7,
                borderTopWidth: 0.5,
                borderTopColor: tokens.colors.ink[200],
              }}
            >
              {profile.success.reasons.map((reason) => (
                <Text
                  key={reason}
                  style={{ fontSize: 7.5, color: tokens.colors.ink[500], lineHeight: 1.5 }}
                >
                  {reason}.
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Timeline strip: the four dates the whole plan turns on. Today shows
          the capital entered; the others the median projected for the end of
          that year. */}
      {timeline.length > 0 && (
        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
          {timeline.map((stop, index) => (
            <View
              key={stop.key}
              style={{
                flex: 1,
                marginRight: index < timeline.length - 1 ? 8 : 0,
                borderWidth: 1,
                borderColor: tokens.colors.ink[200],
                borderRadius: tokens.radius.md,
                borderLeftWidth: 2,
                borderLeftColor: stop.emphasis
                  ? tokens.colors.brand.yellow
                  : tokens.colors.ink[200],
                paddingVertical: 7,
                paddingHorizontal: 8,
              }}
              wrap={false}
            >
              <Text
                style={{
                  fontSize: 6.5,
                  fontWeight: 600,
                  letterSpacing: 0.7,
                  textTransform: 'uppercase',
                  color: tokens.colors.ink[500],
                }}
              >
                {stop.label}
              </Text>
              <Text
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: tokens.colors.ink[900],
                  marginTop: 2,
                }}
              >
                {isGerman ? `Alter ${stop.age}` : `Age ${stop.age}`}
              </Text>
              <Text style={{ fontSize: 7, color: tokens.colors.ink[600], marginTop: 2 }}>
                {stop.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* The bridge has no box of its own any more: the key finding above
          states its years and its amount, and section 05 says what to do
          about it. A third copy pushed this section onto a second page. */}
    </View>
  )
}
