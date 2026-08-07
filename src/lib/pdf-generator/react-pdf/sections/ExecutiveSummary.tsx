import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { SectionHeader } from '../primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { deriveKeyFindings, type FindingTone } from '@/lib/pdf-generator/insights/keyFindings'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'

interface ExecutiveSummaryProps {
  content: ReportContent
  sectionNumber?: string
}

function scoreColor(score: number | null) {
  if (score === null) return tokens.colors.ink[900]
  if (score >= 80) return tokens.colors.success[600]
  if (score >= 60) return tokens.colors.warning[600]
  return tokens.colors.danger[600]
}

function rateColor(rate: number) {
  if (rate >= 0.8) return tokens.colors.success[600]
  if (rate >= 0.6) return tokens.colors.warning[600]
  return tokens.colors.danger[600]
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
  const { profile, expenses, assumptions, finances } = content
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const annualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal
  const pensionAnnual = finances.monthlyPension * 12
  const annualNetGap = Math.max(0, annualSpend - pensionAnnual)
  const confidence = profile.success.successRate
  const confidenceColor = rateColor(confidence)
  const findings = deriveKeyFindings(content)

  const componentLabels: Record<'success' | 'spending' | 'liquidity', string> = {
    success: isGerman ? 'Erfolgsquote' : 'Success rate',
    spending: isGerman ? 'Entnahmerate' : 'Withdrawal rate',
    liquidity: isGerman ? 'Liquidität' : 'Liquidity',
  }

  const perYear = isGerman ? 'pro Jahr' : 'per year'

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
      label: isGerman ? 'Rentenbeginn' : 'State pension',
      emphasis: true,
    },
    { key: 'horizon', age: person.horizonAge, label: isGerman ? 'Planungsende' : 'Horizon' },
  ]
  const timeline = timelineStops
    .filter((stop, index, all) => all.findIndex((other) => other.age === stop.age) === index)
    .map((stop) => {
      const median = medianAt(stop.age)
      return {
        ...stop,
        value:
          median === undefined
            ? '–'
            : isGerman
              ? `Median ${fmtCurrency(median, locale)}`
              : `median ${fmtCurrency(median, locale)}`,
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
          <Text style={styles.kpiDescription}>
            {fmtNumber(profile.success.successCount, { locale })} /{' '}
            {fmtNumber(profile.success.trials, { locale })}
            {isGerman ? ' Läufe erfolgreich' : ' successful runs'}
          </Text>
        </View>

        <View style={[styles.cardAccent, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Planungs-Score' : 'Plan Score'}</Text>
          <Text style={[styles.kpiValue, { color: scoreColor(profile.success.score) }]}>
            {profile.success.score !== null
              ? `${fmtNumber(profile.success.score, { locale })} / 100`
              : '–'}
          </Text>
          <Text style={styles.kpiDescription}>
            {profile.success.label ?? (isGerman ? 'Nicht verfügbar' : 'Not available')}
            {isGerman ? ' · identisch zum Dashboard' : ' · same figure as the dashboard'}
          </Text>
        </View>

        <View style={[styles.cardAccent, { flex: 1, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Jahresbudget' : 'Annual Budget'}</Text>
          <Text style={styles.kpiValue}>{fmtCurrency(annualSpend, locale)}</Text>
          <Text style={styles.kpiDescription}>
            {isGerman
              ? `Ausgaben pro Jahr · ${fmtNumber(expenses.horizonYears, { locale })} Jahre Horizont`
              : `Spending per year · ${fmtNumber(expenses.horizonYears, { locale })} year horizon`}
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
              ? 'Direkt aus dem Simulationsergebnis abgeleitet — Maßnahmen folgen in Abschnitt 05.'
              : 'Derived directly from the simulation output — actions follow in section 05.'}
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
            label={isGerman ? 'Rentenzahlung' : 'Pension income'}
            unit={isGerman
              ? `${fmtCurrency(finances.monthlyPension, locale)} monatlich`
              : `${fmtCurrency(finances.monthlyPension, locale)} monthly`}
            value={fmtCurrency(pensionAnnual, locale)}
          />
          <DataRow
            label={isGerman ? 'Ausgaben' : 'Spending'}
            unit={perYear}
            value={fmtCurrency(annualSpend, locale)}
          />
          <DataRow
            label={isGerman ? 'Verbleibende Lücke' : 'Remaining gap'}
            unit={
              isGerman
                ? `Ausgaben − Rente, ${perYear}`
                : `spending − pension, ${perYear}`
            }
            value={fmtCurrency(annualNetGap, locale)}
            last
          />
        </View>
      </View>

      {/* Score composition — shows the arithmetic behind the number above */}
      {profile.success.components.length > 0 && profile.success.score !== null && (
        <View style={[styles.card, { marginBottom: 10 }]}>
          <Text style={[styles.cardTitle, { marginBottom: 3 }]}>
            {isGerman ? 'Wie der Planungs-Score entsteht' : 'How the Plan Score Is Built'}
          </Text>
          <Text style={{ fontSize: 7, color: tokens.colors.ink[500], marginBottom: 8 }}>
            {isGerman
              ? 'Gewichteter Mittelwert dreier Teilwerte, gerundet auf ganze Punkte.'
              : 'Weighted mean of three sub-scores, rounded to whole points.'}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            {profile.success.components.map((component, index) => (
              <View
                key={component.id}
                style={{
                  flex: 1,
                  marginRight: index < profile.success.components.length - 1 ? 12 : 0,
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
                    {componentLabels[component.id]}
                  </Text>
                  <Text style={{ fontSize: 7, color: tokens.colors.ink[500] }}>
                    {fmtPercent(component.weight, 0, locale)}
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
                  {fmtNumber(Math.round(component.value), { locale })} / 100 ·{' '}
                  {isGerman ? 'Beitrag' : 'contributes'}{' '}
                  {fmtNumber(Math.round(component.value * component.weight), { locale })}
                </Text>
              </View>
            ))}
          </View>
          {profile.success.reasons.length > 0 && (
            <Text
              style={{
                fontSize: 7.5,
                color: tokens.colors.ink[500],
                lineHeight: 1.5,
                marginTop: 8,
                paddingTop: 7,
                borderTopWidth: 0.5,
                borderTopColor: tokens.colors.ink[200],
              }}
            >
              {profile.success.reasons.join('  ·  ')}
            </Text>
          )}
        </View>
      )}

      {/* Timeline strip: the four dates the whole plan turns on, with the
          median capital projected at each of them. */}
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
              <Text style={{ fontSize: 7.5, color: tokens.colors.ink[600], marginTop: 2 }}>
                {stop.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      {profile.bridge && (
        <View style={[styles.callout]}>
          <Text
            style={{
              fontSize: 8.5,
              fontWeight: 600,
              color: tokens.colors.ink[900],
              marginBottom: 3,
            }}
          >
            {isGerman ? 'Überbrückungsphase' : 'Bridge Phase'}
          </Text>
          <Text style={{ fontSize: 8.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}>
            {isGerman
              ? `Zwischen Alter ${profile.bridge.startAge} und ${profile.bridge.endAge} entsteht bis zum Rentenbeginn ein Liquiditätsbedarf von ${fmtCurrency(profile.bridge.cashNeedEUR, locale)}. Planen Sie diesen Betrag in liquiden, schwankungsarmen Anlagen ein.`
              : `Between age ${profile.bridge.startAge} and ${profile.bridge.endAge}, expected bridge liquidity needs are ${fmtCurrency(profile.bridge.cashNeedEUR, locale)} until the state pension begins. Keep this amount in liquid, low-volatility assets.`}
          </Text>
        </View>
      )}
    </View>
  )
}
