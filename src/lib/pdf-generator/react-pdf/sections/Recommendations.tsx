import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { SectionHeader, Table, TableRow, TableCell } from '../primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'

interface RecommendationsProps {
  content: ReportContent
  sectionNumber?: string
}

function impactVisual(impact: string, isGerman: boolean) {
  if (impact === 'High' || impact === 'hoch') {
    return {
      color: tokens.colors.danger[600],
      bg: tokens.colors.danger[50],
      label: isGerman ? 'Hohe Wirkung' : 'High impact',
    }
  }
  if (impact === 'Medium' || impact === 'mittel') {
    return {
      color: tokens.colors.warning[600],
      bg: tokens.colors.warning[50],
      label: isGerman ? 'Mittlere Wirkung' : 'Medium impact',
    }
  }
  return {
    color: tokens.colors.success[600],
    bg: tokens.colors.success[50],
    label: isGerman ? 'Geringe Wirkung' : 'Low impact',
  }
}

export function Recommendations({ content, sectionNumber = '05' }: RecommendationsProps) {
  const { recommendations } = content
  const isGerman = content.locale !== 'en'

  const list = recommendations.primary.slice(0, 5)

  return (
    <View>
      <SectionHeader
        number={sectionNumber}
        overline={isGerman ? 'Maßnahmen' : 'Actions'}
        title={isGerman ? 'Handlungsempfehlungen' : 'Recommended Actions'}
        lead={
          isGerman
            ? 'Priorisierte Maßnahmen zur Verbesserung der Robustheit Ihres Plans.'
            : 'Prioritised measures to improve the robustness of your plan.'
        }
      />

      {list.length === 0 ? (
        <View style={styles.card}>
          <Text style={{ fontSize: 9, color: tokens.colors.ink[600] }}>
            {isGerman
              ? 'Es wurden keine spezifischen Empfehlungen erzeugt.'
              : 'No specific recommendations were generated.'}
          </Text>
        </View>
      ) : (
        list.map((rec, index) => {
          const tag = impactVisual(rec.impactLabel ?? rec.impact, isGerman)
          return (
            <View
              key={`${rec.title}-${index}`}
              style={[
                styles.card,
                { borderLeftWidth: 2.5, borderLeftColor: tag.color, marginBottom: 8 },
              ]}
              wrap={false}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                {/* Priority number */}
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: tokens.colors.ink[900],
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 9,
                    marginTop: 1,
                  }}
                >
                  <Text style={{ fontSize: 8.5, fontWeight: 700, color: tokens.colors.white }}>
                    {index + 1}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 6.5,
                        fontWeight: 600,
                        letterSpacing: 0.8,
                        textTransform: 'uppercase',
                        color: tokens.colors.ink[500],
                      }}
                    >
                      {rec.category}
                    </Text>
                    <View
                      style={{
                        backgroundColor: tag.bg,
                        borderRadius: 2.5,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ fontSize: 6.5, fontWeight: 600, color: tag.color }}>
                        {tag.label}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: tokens.colors.ink[900],
                      marginBottom: 3,
                    }}
                  >
                    {rec.title}
                  </Text>
                  <Text style={{ fontSize: 8.5, lineHeight: 1.5, color: tokens.colors.ink[700] }}>
                    {rec.body}
                  </Text>
                </View>
              </View>
            </View>
          )
        })
      )}

      <View style={[styles.callout, { marginTop: 6 }]}>
        <Text
          style={{ fontSize: 8.5, fontWeight: 600, color: tokens.colors.ink[900], marginBottom: 3 }}
        >
          {isGerman ? 'Umsetzungsrahmen' : 'Implementation Frame'}
        </Text>
        <Text style={{ fontSize: 8.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}>
          {isGerman
            ? 'Empfehlung: Fokussieren Sie sich in den nächsten 90 Tagen auf ein bis zwei Maßnahmen mit hoher Wirkung und führen Sie die Simulation anschließend erneut durch.'
            : 'Recommendation: focus on one or two high-impact actions over the next 90 days, then rerun the simulation to validate the effect.'}
        </Text>
      </View>
    </View>
  )
}
