import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { H2, H4 } from '../primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'

interface ExecutiveSummaryProps {
  content: ReportContent
}

function scoreColor(score: number | null) {
  if (score === null) return tokens.colors.ink[700]
  if (score >= 80) return tokens.colors.success[600]
  if (score >= 60) return tokens.colors.warning[600]
  return tokens.colors.danger[600]
}

export function ExecutiveSummary({ content }: ExecutiveSummaryProps) {
  const { profile, expenses, assumptions, finances } = content
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const annualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal
  const annualNetGap = Math.max(0, annualSpend - finances.monthlyPension * 12)
  const confidence = profile.success.successRate

  return (
    <View>
      <View style={{ marginBottom: 16 }}>
        <H2>{isGerman ? 'Management Summary' : 'Management Summary'}</H2>
        <Text style={styles.sectionLead}>
          {isGerman
            ? 'Kompakte Beurteilung Ihrer Ruhestandsstrategie auf Basis der aktuellen Simulationsdaten.'
            : 'Compact assessment of your retirement strategy based on the current simulation data.'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 14 }}>
        <View style={{ width: '32%', marginRight: '2%' }}>
          <View style={styles.card} wrap={false}>
            <Text style={styles.kpiLabel}>{isGerman ? 'Erfolgsquote' : 'Success Rate'}</Text>
            <Text style={[styles.kpiValue, { color: confidence >= 0.8 ? tokens.colors.success[600] : tokens.colors.warning[600] }]}>
              {fmtPercent(confidence, 1, locale)}
            </Text>
            <Text style={styles.kpiDescription}>
              {fmtNumber(profile.success.successCount, { locale })} / {fmtNumber(profile.success.trials, { locale })}
              {isGerman ? ' Läufe erfolgreich' : ' successful runs'}
            </Text>
          </View>
        </View>

        <View style={{ width: '32%', marginRight: '2%' }}>
          <View style={styles.card} wrap={false}>
            <Text style={styles.kpiLabel}>{isGerman ? 'Planungs-Score' : 'Plan Score'}</Text>
            <Text style={[styles.kpiValue, { color: scoreColor(profile.success.score) }]}>
              {profile.success.score !== null ? fmtNumber(profile.success.score, { locale }) : '-'}
            </Text>
            <Text style={styles.kpiDescription}>{profile.success.label ?? (isGerman ? 'Nicht verfügbar' : 'Not available')}</Text>
          </View>
        </View>

        <View style={{ width: '34%' }}>
          <View style={styles.card} wrap={false}>
            <Text style={styles.kpiLabel}>{isGerman ? 'Jahresbudget' : 'Annual Budget'}</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(annualSpend, locale)}</Text>
            <Text style={styles.kpiDescription}>
              {fmtNumber(expenses.horizonYears, { locale })} {isGerman ? 'Jahre Planungshorizont' : 'years planning horizon'}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 14 }}>
        <View style={{ width: '56%', marginRight: '2%' }}>
          <View style={styles.card}>
            <H4 style={{ marginBottom: 8 }}>{isGerman ? 'Kernbefunde' : 'Key Findings'}</H4>
            {profile.highlights.length > 0 ? (
              profile.highlights.slice(0, 4).map((item, index) => (
                <View key={index} style={{ flexDirection: 'row', marginBottom: 4 }}>
                  <Text style={{ width: 12, color: tokens.colors.accent[600], fontSize: 9 }}>•</Text>
                  <Text style={{ flex: 1, fontSize: 9.5, color: tokens.colors.ink[700], lineHeight: 1.45 }}>{item}</Text>
                </View>
              ))
            ) : (
              <Text style={{ fontSize: 9.5, color: tokens.colors.ink[600] }}>
                {isGerman ? 'Keine zusätzlichen Highlights verfügbar.' : 'No additional highlights available.'}
              </Text>
            )}

            {profile.success.reasons.length > 0 && (
              <Text style={{ marginTop: 8, fontSize: 8.5, color: tokens.colors.ink[500] }}>
                {profile.success.reasons.join(' · ')}
              </Text>
            )}
          </View>
        </View>

        <View style={{ width: '42%' }}>
          <View style={styles.card}>
            <H4 style={{ marginBottom: 8 }}>{isGerman ? 'Planungsdaten' : 'Planning Data'}</H4>
            <View style={{ marginBottom: 6 }}>
              <Text style={styles.label}>{isGerman ? 'Renditeerwartung' : 'Expected Return'}</Text>
              <Text style={{ fontSize: 11, color: tokens.colors.ink[800], fontFamily: 'Helvetica-Bold' }}>
                {fmtPercent(assumptions.expectedReturn, 1, locale)}
              </Text>
            </View>
            <View style={{ marginBottom: 6 }}>
              <Text style={styles.label}>{isGerman ? 'Inflation' : 'Inflation'}</Text>
              <Text style={{ fontSize: 11, color: tokens.colors.ink[800], fontFamily: 'Helvetica-Bold' }}>
                {fmtPercent(assumptions.inflation, 1, locale)}
              </Text>
            </View>
            <View style={{ marginBottom: 6 }}>
              <Text style={styles.label}>{isGerman ? 'Simulationen' : 'Simulations'}</Text>
              <Text style={{ fontSize: 11, color: tokens.colors.ink[800], fontFamily: 'Helvetica-Bold' }}>
                {fmtNumber(assumptions.simulationRuns, { locale })}
              </Text>
            </View>
            <View>
              <Text style={styles.label}>{isGerman ? 'Netto-Ausgabenlücke' : 'Annual Net Gap'}</Text>
              <Text style={{ fontSize: 11, color: tokens.colors.ink[800], fontFamily: 'Helvetica-Bold' }}>
                {fmtCurrency(annualNetGap, locale)}
              </Text>
            </View>
            <View style={{ marginTop: 6 }}>
              <Text style={styles.label}>{isGerman ? 'Monatliche Rente' : 'Monthly Pension'}</Text>
              <Text style={{ fontSize: 11, color: tokens.colors.ink[800], fontFamily: 'Helvetica-Bold' }}>
                {fmtCurrency(finances.monthlyPension, locale)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {profile.bridge && (
        <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: tokens.colors.accent[600] }]}>
          <H4 style={{ marginBottom: 6 }}>{isGerman ? 'Überbrückungsphase' : 'Bridge Phase'}</H4>
          <Text style={{ fontSize: 10, color: tokens.colors.ink[700], lineHeight: 1.5 }}>
            {isGerman
              ? `Zwischen Alter ${profile.bridge.startAge} und ${profile.bridge.endAge} entsteht ein Liquiditätsbedarf von ${fmtCurrency(profile.bridge.cashNeedEUR, locale)}.`
              : `Between age ${profile.bridge.startAge} and ${profile.bridge.endAge}, expected bridge liquidity needs are ${fmtCurrency(profile.bridge.cashNeedEUR, locale)}.`}
          </Text>
        </View>
      )}
    </View>
  )
}
