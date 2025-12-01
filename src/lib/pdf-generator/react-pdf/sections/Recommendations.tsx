import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { H2, H4, Body, Caption } from '../primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'

interface RecommendationsProps {
  content: ReportContent
}

export function Recommendations({ content }: RecommendationsProps) {
  const { recommendations } = content
  const locale = content.locale ?? 'de'
  const isGerman = locale === 'de'

  const impactColors: Record<string, string> = {
    High: tokens.colors.success[600],
    hoch: tokens.colors.success[600],
    Medium: tokens.colors.warning[600],
    mittel: tokens.colors.warning[600],
    Low: tokens.colors.ink[500],
    niedrig: tokens.colors.ink[500],
  }

  const impactLabels: Record<string, string> = {
    High: isGerman ? 'Hoch' : 'High',
    hoch: 'Hoch',
    Medium: isGerman ? 'Mittel' : 'Medium',
    mittel: 'Mittel',
    Low: isGerman ? 'Niedrig' : 'Low',
    niedrig: 'Niedrig',
  }

  // Group by impact
  const highImpact = recommendations.primary.filter((r) => r.impact === 'High')
  const mediumImpact = recommendations.primary.filter((r) => r.impact === 'Medium')
  const lowImpact = recommendations.primary.filter((r) => r.impact === 'Low')

  const renderRecommendation = (rec: (typeof recommendations.primary)[0], index: number) => {
    const impactLabel = rec.impactLabel || impactLabels[rec.impact] || rec.impact
    const impactColor = impactColors[rec.impact] || impactColors[impactLabel] || tokens.colors.ink[500]

    return (
      <View
        key={index}
        style={{
          marginBottom: tokens.spacing[3],
          borderWidth: 1,
          borderColor: tokens.colors.ink[200],
          borderLeftWidth: 4,
          borderLeftColor: impactColor,
          padding: tokens.spacing[4],
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8, color: tokens.colors.ink[500], marginBottom: 2 }}>{rec.category}</Text>
            <H4 style={{ marginBottom: tokens.spacing[2] }}>{rec.title}</H4>
            <Body style={{ marginBottom: 0 }}>{rec.body}</Body>
          </View>
          <View style={{ marginLeft: tokens.spacing[3] }}>
            <View style={{ backgroundColor: impactColor, paddingVertical: 2, paddingHorizontal: 6 }}>
              <Text style={{ fontSize: 8, color: tokens.colors.white, fontFamily: 'Helvetica-Bold' }}>
                {impactLabel}
              </Text>
            </View>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View>
      {/* Section Header */}
      <View style={{ marginBottom: tokens.spacing[6] }}>
        <H2>{isGerman ? 'Empfohlene Maßnahmen' : 'Recommended Actions'}</H2>
        <Text style={styles.sectionLead}>
          {isGerman
            ? 'Priorisierte Handlungsempfehlungen zur Optimierung Ihres Ruhestandsplans.'
            : 'Prioritised recommendations to optimise your retirement plan.'}
        </Text>
      </View>

      {/* Priority legend - Fixed width columns */}
      <View style={{ flexDirection: 'row', marginBottom: tokens.spacing[6] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', width: '33%' }}>
          <View style={{ width: 12, height: 12, backgroundColor: tokens.colors.success[600], marginRight: 4 }} />
          <Caption>{isGerman ? 'Hohe Priorität' : 'High Priority'}</Caption>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', width: '33%' }}>
          <View style={{ width: 12, height: 12, backgroundColor: tokens.colors.warning[600], marginRight: 4 }} />
          <Caption>{isGerman ? 'Mittlere Priorität' : 'Medium Priority'}</Caption>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', width: '34%' }}>
          <View style={{ width: 12, height: 12, backgroundColor: tokens.colors.ink[500], marginRight: 4 }} />
          <Caption>{isGerman ? 'Niedrige Priorität' : 'Low Priority'}</Caption>
        </View>
      </View>

      {/* High Impact */}
      {highImpact.length > 0 && (
        <View style={{ marginBottom: tokens.spacing[4] }}>
          <Text style={[styles.label, { marginBottom: tokens.spacing[2] }]}>{isGerman ? 'Höchste Priorität' : 'Highest Priority'}</Text>
          {highImpact.map((rec, i) => renderRecommendation(rec, i))}
        </View>
      )}

      {/* Medium Impact */}
      {mediumImpact.length > 0 && (
        <View style={{ marginBottom: tokens.spacing[4] }}>
          <Text style={[styles.label, { marginBottom: tokens.spacing[2] }]}>{isGerman ? 'Mittlere Priorität' : 'Medium Priority'}</Text>
          {mediumImpact.map((rec, i) => renderRecommendation(rec, i))}
        </View>
      )}

      {/* Low Impact */}
      {lowImpact.length > 0 && (
        <View style={{ marginBottom: tokens.spacing[4] }}>
          <Text style={[styles.label, { marginBottom: tokens.spacing[2] }]}>{isGerman ? 'Zur Überlegung' : 'For Consideration'}</Text>
          {lowImpact.map((rec, i) => renderRecommendation(rec, i))}
        </View>
      )}

      {/* Next Steps */}
      <View style={{ marginTop: tokens.spacing[4], borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4] }}>
        <H4 style={{ marginBottom: tokens.spacing[3] }}>
          {isGerman ? 'Nächste Schritte (30/90 Tage)' : 'Next Steps (30/90 Days)'}
        </H4>
        <View>
          {highImpact.slice(0, 2).map((rec, i) => (
            <View key={`high-${i}`} style={{ flexDirection: 'row', marginBottom: tokens.spacing[2] }}>
              <Text style={{ width: 20, fontSize: 10, color: tokens.colors.accent[600] }}>[ ]</Text>
              <Text style={{ flex: 1, fontSize: 10 }}>{rec.title}</Text>
              <View style={{ backgroundColor: tokens.colors.ink[800], paddingVertical: 1, paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 7, color: tokens.colors.white, fontFamily: 'Helvetica-Bold' }}>
                  {isGerman ? '30 Tage' : '30 days'}
                </Text>
              </View>
            </View>
          ))}
          {mediumImpact.slice(0, 2).map((rec, i) => (
            <View key={`med-${i}`} style={{ flexDirection: 'row', marginBottom: tokens.spacing[2] }}>
              <Text style={{ width: 20, fontSize: 10, color: tokens.colors.ink[400] }}>[ ]</Text>
              <Text style={{ flex: 1, fontSize: 10 }}>{rec.title}</Text>
              <View style={{ backgroundColor: tokens.colors.ink[400], paddingVertical: 1, paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 7, color: tokens.colors.white, fontFamily: 'Helvetica-Bold' }}>
                  {isGerman ? '90 Tage' : '90 days'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
