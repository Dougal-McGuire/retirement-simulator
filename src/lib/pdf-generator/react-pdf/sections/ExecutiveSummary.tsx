import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { H2, H4, Body, Label, ListItem } from '../primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber, fmtPercent, nnbsp } from '@/lib/pdf-generator/formatters'

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
  const horizonYears = expenses.horizonYears
  const totalSpend = expenses.totalHorizonAmount

  const highlights = profile.highlights.length
    ? profile.highlights
    : [isGerman ? 'Plan durch Risiko- und Liquiditätsanalyse abgesichert' : 'Plan secured by risk and liquidity review']

  // Determine score status
  const scoreLabel = (() => {
    if (success.score === null) return null
    if (success.score >= 80) return { text: isGerman ? 'Stark' : 'Strong', color: tokens.colors.success[600] }
    if (success.score >= 60) return { text: isGerman ? 'Ausgewogen' : 'Moderate', color: tokens.colors.warning[600] }
    return { text: isGerman ? 'Überarbeiten' : 'Needs Attention', color: tokens.colors.danger[600] }
  })()

  return (
    <View>
      {/* Section Header */}
      <View style={{ marginBottom: tokens.spacing[6] }}>
        <H2>{isGerman ? 'Zusammenfassung' : 'Executive Summary'}</H2>
        <Text style={styles.sectionLead}>
          {isGerman
            ? 'Ergebnisse der Monte-Carlo-Simulation mit Fokus auf Erfolgswahrscheinlichkeit, Liquiditätsbedarf und priorisierte Maßnahmen.'
            : 'Results of the Monte Carlo simulation, focusing on success probability, liquidity needs, and prioritised actions.'}
        </Text>
      </View>

      {/* KPI Grid - Using table-like structure for reliable alignment */}
      <View style={{ flexDirection: 'row', marginBottom: tokens.spacing[6] }}>
        {/* Success Probability */}
        <View style={{ width: '33%', paddingRight: tokens.spacing[2] }}>
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4], minHeight: 100 }}>
            <Text style={styles.label}>{isGerman ? 'Erfolgswahrscheinlichkeit' : 'Success Probability'}</Text>
            <Text style={styles.kpiValue}>
              {fmtPercent(success.successRate, 1, intlLocale)}
            </Text>
            <Text style={styles.kpiDescription}>
              {fmtNumber(success.successCount, { locale: intlLocale })} / {fmtNumber(success.trials, { locale: intlLocale })}
              {' '}{isGerman ? 'Simulationen' : 'simulations'}
            </Text>
          </View>
        </View>

        {/* Plan Score */}
        <View style={{ width: '33%', paddingHorizontal: tokens.spacing[1] }}>
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4], minHeight: 100 }}>
            <Text style={styles.label}>{isGerman ? 'Planungs-Score' : 'Planning Score'}</Text>
            {success.score !== null ? (
              <View>
                <Text style={[styles.kpiValue, { color: scoreLabel?.color || tokens.colors.ink[900] }]}>
                  {fmtNumber(success.score, { locale: intlLocale })} / 100
                </Text>
                {scoreLabel && (
                  <View style={{ marginTop: tokens.spacing[2] }}>
                    <Text style={{ fontSize: 9, color: scoreLabel.color, fontFamily: 'Helvetica-Bold' }}>
                      {scoreLabel.text}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={[styles.kpiValue, { color: tokens.colors.ink[400] }]}>-</Text>
            )}
          </View>
        </View>

        {/* Total Spending */}
        <View style={{ width: '34%', paddingLeft: tokens.spacing[2] }}>
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4], minHeight: 100 }}>
            <Text style={styles.label}>
              {isGerman ? 'Ausgaben' : 'Spending'} ({fmtNumber(horizonYears, { locale: intlLocale })}{nnbsp}{isGerman ? 'J.' : 'yrs'})
            </Text>
            <Text style={styles.kpiValue}>{fmtCurrency(totalSpend, intlLocale)}</Text>
            <Text style={styles.kpiDescription}>
              {isGerman ? 'Lebenshaltungskosten' : 'Living costs'}
            </Text>
          </View>
        </View>
      </View>

      {/* Two-column layout */}
      <View style={{ flexDirection: 'row' }}>
        {/* Prioritised Insights */}
        <View style={{ width: '50%', paddingRight: tokens.spacing[2] }}>
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4], minHeight: 140 }}>
            <H4 style={{ marginBottom: tokens.spacing[3] }}>{isGerman ? 'Priorisierte Erkenntnisse' : 'Prioritised Insights'}</H4>
            <View>
              {highlights.map((item, index) => (
                <ListItem key={index} bullet="•">{item}</ListItem>
              ))}
            </View>
            {success.reasons.length > 0 && (
              <View style={{ marginTop: tokens.spacing[3] }}>
                <Text style={{ fontSize: 8, color: tokens.colors.ink[400] }}>
                  {success.reasons.join(' · ')}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Liquidity Needs */}
        <View style={{ width: '50%', paddingLeft: tokens.spacing[2] }}>
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4], minHeight: 140 }}>
            <H4 style={{ marginBottom: tokens.spacing[3] }}>
              {isGerman ? 'Liquiditätsbedarf' : 'Liquidity Needs'}
            </H4>
            {bridge ? (
              <View>
                <Body>
                  {isGerman
                    ? `Zwischen Ruhestand (${profile.person.retireAge}) und Rente (${profile.person.pensionAge}): `
                    : `Between retirement (${profile.person.retireAge}) and pension (${profile.person.pensionAge}): `}
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtCurrency(bridge.cashNeedEUR, intlLocale)}</Text>
                </Body>
                <View style={{ flexDirection: 'row', marginTop: tokens.spacing[3] }}>
                  <View style={{ width: '50%' }}>
                    <Text style={styles.label}>{isGerman ? 'Cash' : 'Cash'}</Text>
                    <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>
                      {fmtPercent((bridge.cashBucketSharePct ?? 0) / 100, 0, intlLocale)}
                    </Text>
                  </View>
                  <View style={{ width: '50%' }}>
                    <Text style={styles.label}>{isGerman ? 'Portfolio' : 'Portfolio'}</Text>
                    <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>
                      {fmtPercent((bridge.portfolioSharePct ?? 0) / 100, 0, intlLocale)}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <Body>
                {isGerman
                  ? 'Kein zusätzlicher Liquiditätsbedarf identifiziert.'
                  : 'No additional liquidity requirement identified.'}
              </Body>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}
