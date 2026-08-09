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
  const { recommendations, profile, expenses, finances, projections } = content
  const isGerman = content.locale !== 'en'
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'

  // The section is a single page by design: the levers table and the 90-day
  // plan below always fit, so the card list is capped to what is left over.
  const maxCards = recommendations.primary.length >= 4 ? 3 : 5
  const list = recommendations.primary.slice(0, maxCards)
  const hiddenCount = Math.max(0, recommendations.primary.length - list.length)
  const uplifts = recommendations.uplifts.slice(0, 3)
  // The uplift table and the lever table answer the same question ("what
  // changes if I act"), so only one of them is ever shown: the modelled uplift
  // when the payload carries it, the arithmetic levers otherwise.
  const showLevers = uplifts.length === 0

  const annualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal
  const { person } = profile
  const bridgeYears = Math.max(0, person.pensionAge - person.retireAge)

  /**
   * Deterministic lever arithmetic — no re-simulation, just the direct effect
   * each lever has on the two numbers that drive the outcome: the annual gap
   * the portfolio has to cover, and the cash needed across the bridge years.
   * Labelled as arithmetic in the caption so it is never mistaken for a run.
   */
  const gapToday = Math.max(0, annualSpend - finances.monthlyPension * 12)
  const bridgeNeed = profile.bridge?.cashNeedEUR ?? annualSpend * bridgeYears
  const perBridgeYear = bridgeYears > 0 ? bridgeNeed / bridgeYears : annualSpend
  const levers: Array<{ lever: string; gap: string; bridge: string }> = [
    {
      lever: isGerman ? 'Zwei Jahre später in Rente' : 'Retire two years later',
      gap: isGerman
        ? `+${fmtCurrency(finances.annualSavings * 2, locale)} zusätzlich gespart`
        : `+${fmtCurrency(finances.annualSavings * 2, locale)} extra saved`,
      bridge:
        bridgeYears >= 2
          ? `−${fmtCurrency(Math.min(bridgeNeed, perBridgeYear * 2), locale)}`
          : isGerman
            ? 'keine Überbrückung nötig'
            : 'no bridge required',
    },
    {
      lever: isGerman ? 'Jahresbudget um 10 % senken' : 'Cut the annual budget by 10%',
      gap: `−${fmtCurrency(annualSpend * 0.1, locale)}`,
      bridge: `−${fmtCurrency(bridgeNeed * 0.1, locale)}`,
    },
    {
      lever: isGerman ? 'Sparrate um 10 % erhöhen' : 'Raise the savings rate by 10%',
      gap: isGerman
        ? `+${fmtCurrency(finances.annualSavings * 0.1, locale)} pro Jahr investiert`
        : `+${fmtCurrency(finances.annualSavings * 0.1, locale)} invested per year`,
      bridge: isGerman ? 'unverändert' : 'unchanged',
    },
  ]

  /**
   * A short, concrete review agenda. Every row is derived from this plan's own
   * numbers so the reader leaves with dates and amounts, not platitudes.
   */
  const checkpoints: Array<{ when: string; what: string; detail: string }> = [
    {
      when: isGerman ? '0–30 Tage' : 'Days 0–30',
      what: isGerman ? 'Liquiditätspuffer festlegen' : 'Set the cash buffer',
      detail: profile.bridge
        ? isGerman
          ? `${fmtCurrency(profile.bridge.cashNeedEUR, locale)} für ${fmtNumber(bridgeYears, { locale })} Überbrückungsjahre einplanen; die ersten ${fmtNumber(profile.bridge.cashBucketYears ?? 2, { locale })} Jahre schwankungsarm halten.`
          : `Earmark ${fmtCurrency(profile.bridge.cashNeedEUR, locale)} for ${fmtNumber(bridgeYears, { locale })} bridge years; hold the first ${fmtNumber(profile.bridge.cashBucketYears ?? 2, { locale })} years in low-volatility assets.`
        : isGerman
          ? `Zwölf Monatsausgaben (${fmtCurrency(annualSpend, locale)} p.a.) als Puffer bereitstellen.`
          : `Hold twelve months of spending (${fmtCurrency(annualSpend, locale)} p.a.) as a buffer.`,
    },
    {
      when: isGerman ? '30–60 Tage' : 'Days 30–60',
      what: isGerman ? 'Eine Maßnahme mit hoher Wirkung umsetzen' : 'Implement one high-impact action',
      detail: list[0]
        ? isGerman
          ? `Beginnen Sie mit „${list[0].title}“ — die Maßnahme mit der größten erwarteten Wirkung.`
          : `Start with "${list[0].title}" — the action with the largest expected effect.`
        : isGerman
          ? 'Priorisieren Sie die Maßnahme mit dem größten Hebel auf die Erfolgsquote.'
          : 'Prioritise the action with the largest leverage on the success rate.',
    },
    {
      when: isGerman ? '60–90 Tage' : 'Days 60–90',
      what: isGerman ? 'Simulation erneut laufen lassen' : 'Rerun the simulation',
      detail: isGerman
        ? `Vergleichen Sie die neue Erfolgsquote mit den heutigen ${fmtPercent(profile.success.successRate, 1, locale)}.`
        : `Compare the new success rate against today's ${fmtPercent(profile.success.successRate, 1, locale)}.`,
    },
    {
      when: isGerman ? 'Jährlich' : 'Annually',
      what: isGerman ? 'Annahmen nachziehen' : 'Refresh the assumptions',
      detail: isGerman
        ? `Rentenbescheid, Ausgabenliste (${fmtCurrency(finances.monthlyPension, locale)} monatliche Rente heute) und Planungshorizont bis ${person.horizonAge} überprüfen.`
        : `Revisit the pension statement, the expense list (${fmtCurrency(finances.monthlyPension, locale)} monthly pension today) and the horizon at age ${person.horizonAge}.`,
    },
  ]

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

      <View
        style={[
          styles.callout,
          projections.exhaustionAge ? styles.calloutWarning : styles.calloutSuccess,
          { marginBottom: 10 },
        ]}
      >
        <Text
          style={{ fontSize: 8.5, fontWeight: 600, color: tokens.colors.ink[900], marginBottom: 3 }}
        >
          {isGerman ? 'Worauf es zuerst ankommt' : 'What Matters First'}
        </Text>
        <Text style={{ fontSize: 8, color: tokens.colors.ink[700], lineHeight: 1.45 }}>
          {projections.exhaustionAge
            ? isGerman
              ? `Das Stressszenario läuft ab Alter ${fmtNumber(projections.exhaustionAge, { locale })} leer. Die wirksamsten Hebel sind ein späterer Ruhestandsbeginn als ${person.retireAge} und eine Senkung des Jahresbudgets von ${fmtCurrency(annualSpend, locale)}; beides wirkt direkt auf die Entnahmerate.`
              : `The stress scenario runs dry from age ${fmtNumber(projections.exhaustionAge, { locale })}. The strongest levers are retiring later than ${person.retireAge} and trimming the ${fmtCurrency(annualSpend, locale)} annual budget; both act directly on the withdrawal rate.`
            : isGerman
              ? `Der Plan trägt auch im Stressszenario bis Alter ${person.horizonAge}. Der Fokus liegt daher auf Absicherung: Liquiditätspuffer für die Überbrückungsjahre und regelmäßige Überprüfung der Annahmen.`
              : `The plan holds to age ${person.horizonAge} even under stress. The focus is therefore protective: keep the bridge-year liquidity buffer and revisit the assumptions regularly.`}
        </Text>
      </View>

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
                {
                  borderLeftWidth: 2.5,
                  borderLeftColor: tag.color,
                  marginBottom: 6,
                  paddingVertical: 7,
                  paddingHorizontal: 9,
                },
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
                      fontSize: 9.5,
                      fontWeight: 600,
                      color: tokens.colors.ink[900],
                      marginBottom: 2,
                    }}
                  >
                    {rec.title}
                  </Text>
                  <Text style={{ fontSize: 8, lineHeight: 1.45, color: tokens.colors.ink[700] }}>
                    {rec.body}
                  </Text>
                </View>
              </View>
            </View>
          )
        })
      )}

      {hiddenCount > 0 && (
        <Text style={{ fontSize: 7, color: tokens.colors.ink[500], marginBottom: 6 }}>
          {isGerman
            ? `${list.length} von ${recommendations.primary.length} Maßnahmen nach Wirkung priorisiert; die vollständige Liste zeigt die App.`
            : `${list.length} of ${recommendations.primary.length} measures shown, ranked by effect; the app lists them all.`}
        </Text>
      )}

      {uplifts.length > 0 && (
        <View style={[styles.card, { marginTop: 4, marginBottom: 8 }]}>
          <Text style={[styles.cardTitle, { marginBottom: 3 }]}>
            {isGerman ? 'Erwartete Wirkung auf die Erfolgsquote' : 'Expected Effect on the Success Rate'}
          </Text>
          <Text style={{ fontSize: 7, color: tokens.colors.ink[500], marginBottom: 4 }}>
            {isGerman
              ? `Modellschätzung in Prozentpunkten, ausgehend von heute ${fmtPercent(profile.success.successRate, 1, locale)}.`
              : `Model estimate in percentage points, starting from today's ${fmtPercent(profile.success.successRate, 1, locale)}.`}
          </Text>
          <Table>
            <TableRow header>
              <TableCell header width="58%">
                {isGerman ? 'Maßnahme' : 'Action'}
              </TableCell>
              <TableCell header width="20%" align="right">
                {isGerman ? 'Wirkung' : 'Uplift'}
              </TableCell>
              <TableCell header width="22%" align="right">
                {isGerman ? 'Neue Quote' : 'Resulting rate'}
              </TableCell>
            </TableRow>
            {uplifts.map((uplift, index) => {
              const base = profile.success.successRate * 100
              const low = Math.min(100, base + uplift.upliftMin)
              const high = Math.min(100, base + uplift.upliftMax)
              return (
                <TableRow key={`${uplift.title}-${index}`} alt={index % 2 === 1}>
                  <TableCell width="58%">{uplift.title}</TableCell>
                  <TableCell width="20%" align="right">
                    <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>
                      {uplift.upliftMin === uplift.upliftMax
                        ? `+${fmtNumber(uplift.upliftMin, { locale })} pp`
                        : `+${fmtNumber(uplift.upliftMin, { locale })}–${fmtNumber(uplift.upliftMax, { locale })} pp`}
                    </Text>
                  </TableCell>
                  <TableCell width="22%" align="right">
                    {low === high
                      ? `${fmtNumber(low, { locale, maximumFractionDigits: 0 })}${isGerman ? ' %' : '%'}`
                      : `${fmtNumber(low, { locale, maximumFractionDigits: 0 })}–${fmtNumber(high, { locale, maximumFractionDigits: 0 })}${isGerman ? ' %' : '%'}`}
                  </TableCell>
                </TableRow>
              )
            })}
          </Table>
        </View>
      )}

      {showLevers && (
      <View style={[styles.card, { marginTop: 4, marginBottom: 8 }]}>
        <Text style={[styles.cardTitle, { marginBottom: 3 }]}>
          {isGerman ? 'Wirkung der wichtigsten Hebel' : 'Effect of the Main Levers'}
        </Text>
        <Text style={{ fontSize: 7, color: tokens.colors.ink[500], marginBottom: 4 }}>
          {isGerman
            ? `Direkte Rechnung auf Basis der aktuellen Eingaben — keine erneute Simulation. Ausgangslage: ${fmtCurrency(gapToday, locale)} Lücke pro Jahr, ${fmtCurrency(bridgeNeed, locale)} Überbrückungsbedarf.`
            : `Direct arithmetic on the current inputs — not a re-run of the simulation. Baseline: ${fmtCurrency(gapToday, locale)} gap per year, ${fmtCurrency(bridgeNeed, locale)} bridge need.`}
        </Text>
        <Table>
          <TableRow header>
            <TableCell header width="42%">
              {isGerman ? 'Hebel' : 'Lever'}
            </TableCell>
            <TableCell header width="32%" align="right">
              {isGerman ? 'Wirkung auf Jahresbedarf' : 'Effect on annual need'}
            </TableCell>
            <TableCell header width="26%" align="right">
              {isGerman ? 'Überbrückungsbedarf' : 'Bridge need'}
            </TableCell>
          </TableRow>
          {levers.map((lever, index) => (
            <TableRow key={lever.lever} alt={index % 2 === 1}>
              <TableCell width="42%">
                <Text style={{ fontSize: 7.5, fontWeight: 600, color: tokens.colors.ink[900] }}>
                  {lever.lever}
                </Text>
              </TableCell>
              <TableCell width="32%" align="right">
                <Text style={{ fontSize: 7.5 }}>{lever.gap}</Text>
              </TableCell>
              <TableCell width="26%" align="right">
                <Text style={{ fontSize: 7.5 }}>{lever.bridge}</Text>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      </View>
      )}

      <View style={[styles.card, { marginTop: 0, marginBottom: 8 }]}>
        <Text style={[styles.cardTitle, { marginBottom: 3 }]}>
          {isGerman ? '90-Tage-Umsetzungsplan' : '90-Day Implementation Plan'}
        </Text>
        <Table>
          <TableRow header>
            <TableCell header width="18%">
              {isGerman ? 'Zeitraum' : 'Window'}
            </TableCell>
            <TableCell header width="30%">
              {isGerman ? 'Schritt' : 'Step'}
            </TableCell>
            <TableCell header width="52%">
              {isGerman ? 'Konkret' : 'Specifically'}
            </TableCell>
          </TableRow>
          {checkpoints.map((checkpoint, index) => (
            <TableRow key={checkpoint.when} alt={index % 2 === 1}>
              <TableCell width="18%">
                <Text style={{ fontSize: 7.5, fontWeight: 600, color: tokens.colors.accent[700] }}>
                  {checkpoint.when}
                </Text>
              </TableCell>
              <TableCell width="30%">
                <Text style={{ fontSize: 7.5, fontWeight: 600, color: tokens.colors.ink[900] }}>
                  {checkpoint.what}
                </Text>
              </TableCell>
              <TableCell width="52%">
                <Text style={{ fontSize: 7, lineHeight: 1.4 }}>{checkpoint.detail}</Text>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      </View>

    </View>
  )
}
