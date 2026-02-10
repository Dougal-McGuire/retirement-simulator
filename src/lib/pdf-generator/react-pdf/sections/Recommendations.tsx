import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { H2, H4 } from '../primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'

interface RecommendationsProps {
  content: ReportContent
}

function impactVisual(impact: string) {
  if (impact === 'High' || impact === 'hoch') {
    return { color: tokens.colors.danger[600], label: 'H1' }
  }
  if (impact === 'Medium' || impact === 'mittel') {
    return { color: tokens.colors.warning[600], label: 'H2' }
  }
  return { color: tokens.colors.success[600], label: 'H3' }
}

export function Recommendations({ content }: RecommendationsProps) {
  const { recommendations } = content
  const isGerman = content.locale !== 'en'

  const list = [...recommendations.primary]

  return (
    <View>
      <View style={{ marginBottom: 12 }}>
        <H2>{isGerman ? 'Handlungsempfehlungen' : 'Recommended Actions'}</H2>
        <Text style={styles.sectionLead}>
          {isGerman
            ? 'Priorisierte Maßnahmen zur Verbesserung der Robustheit Ihres Plans.'
            : 'Prioritised measures to improve plan robustness.'}
        </Text>
      </View>

      {list.length === 0 ? (
        <View style={styles.card}>
          <Text style={{ fontSize: 10, color: tokens.colors.ink[600] }}>
            {isGerman
              ? 'Es wurden keine spezifischen Empfehlungen erzeugt.'
              : 'No specific recommendations were generated.'}
          </Text>
        </View>
      ) : (
        list.slice(0, 6).map((rec, index) => {
          const tag = impactVisual(rec.impactLabel ?? rec.impact)
          return (
            <View key={`${rec.title}-${index}`} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: tag.color }]} wrap={false}>
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 8, color: tokens.colors.ink[500], marginBottom: 2 }}>
                    {rec.category}
                  </Text>
                  <H4 style={{ marginBottom: 4 }}>{rec.title}</H4>
                </View>
                <View style={{ alignSelf: 'flex-start', backgroundColor: tag.color, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 7, color: tokens.colors.white, fontFamily: 'Helvetica-Bold' }}>
                    {tag.label}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 9.5, lineHeight: 1.5, color: tokens.colors.ink[700] }}>{rec.body}</Text>
            </View>
          )
        })
      )}

      <View style={[styles.card, { marginTop: 6, borderLeftWidth: 3, borderLeftColor: tokens.colors.accent[600] }]}>
        <H4 style={{ marginBottom: 6 }}>{isGerman ? 'Umsetzungsrahmen' : 'Implementation Frame'}</H4>
        <Text style={{ fontSize: 9.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}>
          {isGerman
            ? 'Empfehlung: Fokus auf 1–2 H1/H2-Maßnahmen in den nächsten 90 Tagen und anschließend erneute Simulation.'
            : 'Recommendation: focus on 1-2 H1/H2 actions over the next 90 days, then rerun simulation.'}
        </Text>
      </View>
    </View>
  )
}
