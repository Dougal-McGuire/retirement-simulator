import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { SectionHeader } from '../primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
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

function DataRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4.5,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: tokens.colors.ink[200],
      }}
    >
      <Text style={{ fontSize: 8, color: tokens.colors.ink[600] }}>{label}</Text>
      <Text style={{ fontSize: 8.5, fontWeight: 600, color: tokens.colors.ink[900] }}>{value}</Text>
    </View>
  )
}

export function ExecutiveSummary({ content, sectionNumber = '01' }: ExecutiveSummaryProps) {
  const { profile, expenses, assumptions, finances } = content
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const annualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal
  const annualNetGap = Math.max(0, annualSpend - finances.monthlyPension * 12)
  const confidence = profile.success.successRate
  const confidenceColor = rateColor(confidence)

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
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <View style={[styles.card, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
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

        <View style={[styles.card, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Planungs-Score' : 'Plan Score'}</Text>
          <Text style={[styles.kpiValue, { color: scoreColor(profile.success.score) }]}>
            {profile.success.score !== null
              ? `${fmtNumber(profile.success.score, { locale })} / 100`
              : '–'}
          </Text>
          <Text style={styles.kpiDescription}>
            {profile.success.label ?? (isGerman ? 'Nicht verfügbar' : 'Not available')}
          </Text>
        </View>

        <View style={[styles.card, { flex: 1, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Jahresbudget' : 'Annual Budget'}</Text>
          <Text style={styles.kpiValue}>{fmtCurrency(annualSpend, locale)}</Text>
          <Text style={styles.kpiDescription}>
            {fmtNumber(expenses.horizonYears, { locale })}{' '}
            {isGerman ? 'Jahre Planungshorizont' : 'years planning horizon'}
          </Text>
        </View>
      </View>

      {/* Findings / planning data */}
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <View style={[styles.card, { width: '56%', marginRight: 10, marginBottom: 0 }]}>
          <Text style={styles.cardTitle}>{isGerman ? 'Kernbefunde' : 'Key Findings'}</Text>
          {profile.highlights.length > 0 ? (
            profile.highlights.slice(0, 4).map((item, index) => (
              <View key={index} style={{ flexDirection: 'row', marginBottom: 5 }}>
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: tokens.colors.accent[600],
                    marginTop: 3.5,
                    marginRight: 6,
                  }}
                />
                <Text
                  style={{ flex: 1, fontSize: 8.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}
                >
                  {item}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ fontSize: 8.5, color: tokens.colors.ink[600] }}>
              {isGerman
                ? 'Keine zusätzlichen Highlights verfügbar.'
                : 'No additional highlights available.'}
            </Text>
          )}

          {profile.success.reasons.length > 0 && (
            <View
              style={{
                marginTop: 8,
                paddingTop: 7,
                borderTopWidth: 0.5,
                borderTopColor: tokens.colors.ink[200],
              }}
            >
              <Text style={{ fontSize: 7.5, color: tokens.colors.ink[500], lineHeight: 1.5 }}>
                {profile.success.reasons.join('  ·  ')}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.card, { flex: 1, marginBottom: 0 }]}>
          <Text style={styles.cardTitle}>{isGerman ? 'Planungsdaten' : 'Planning Data'}</Text>
          <DataRow
            label={isGerman ? 'Renditeerwartung' : 'Expected Return'}
            value={fmtPercent(assumptions.expectedReturn, 1, locale)}
          />
          <DataRow
            label={isGerman ? 'Inflation' : 'Inflation'}
            value={fmtPercent(assumptions.inflation, 1, locale)}
          />
          <DataRow
            label={isGerman ? 'Simulationen' : 'Simulations'}
            value={fmtNumber(assumptions.simulationRuns, { locale })}
          />
          <DataRow
            label={isGerman ? 'Netto-Ausgabenlücke' : 'Annual Net Gap'}
            value={fmtCurrency(annualNetGap, locale)}
          />
          <DataRow
            label={isGerman ? 'Monatliche Rente' : 'Monthly Pension'}
            value={fmtCurrency(finances.monthlyPension, locale)}
            last
          />
        </View>
      </View>

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
