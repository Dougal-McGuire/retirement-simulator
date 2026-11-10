import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { SectionHeader, Table, TableRow, TableCell } from '../primitives'
import type { ReportContent, ReportLeverEffects } from '@/lib/pdf-generator/reportTypes'
import {
  fmtCurrency,
  fmtNumber,
  fmtPercent,
  fmtRatioPercent,
} from '@/lib/pdf-generator/formatters'
import { allPensionsSwitchedOff } from '@/lib/pdf-generator/pensionSwitch'
import { buildEuroUnitCopy } from '@/lib/pdf-generator/euroUnitCopy'

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

type LeverId = ReportLeverEffects['levers'][number]['id']

/** The three stress levers, named as the app names them (formal German). */
const LEVER_NAMES: Record<LeverId, { de: string; en: string }> = {
  laterRetirement: {
    de: 'Zwei Jahre später in den Ruhestand',
    en: 'Retire two years later',
  },
  moreSavings: {
    de: 'Sparleistung um 10 % erhöhen',
    en: 'Raise annual savings by 10%',
  },
  lowerSpending: {
    de: 'Laufende Ausgaben um 10 % senken',
    en: 'Cut recurring spending by 10%',
  },
}

/** "+2,6 pp" / "±0,0 pp" / "−1,2 pp" — always signed, one decimal. */
function signedPoints(points: number, locale: string): string {
  const rounded = Math.round(points * 10) / 10
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  const digits = fmtNumber(Math.abs(rounded), {
    locale,
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  return `${sign}${digits} pp`
}

function signedMoney(amount: number, locale: string): string {
  const rounded = Math.round(amount)
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  return `${sign}${fmtCurrency(Math.abs(rounded), locale)}`
}

export function Recommendations({ content, sectionNumber = '05' }: RecommendationsProps) {
  const { recommendations, profile, expenses, finances, projections, simulation } = content
  const isGerman = content.locale !== 'en'
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'

  const annualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal
  const { person } = profile
  // Every amount below says which euro it is in: derived amounts follow the
  // report's unit, entered ones are today's euros in either mode.
  const unitCopy = buildEuroUnitCopy(content.units, content.locale)
  const bridge = profile.bridge
  const bridgeYears = bridge ? Math.max(0, bridge.endAge - bridge.startAge + 1) : 0

  /**
   * What the levers do — **measured**. Each row is one full simulation on the
   * same paths and at the same run count as the report's own result, the very
   * runs behind the app's lever list. When that measurement is not available
   * the table is omitted: there is no formula to fall back on, and the
   * "direct arithmetic" table that used to stand in here mixed today's euros
   * with future ones.
   */
  const measured = recommendations.levers ?? null
  const leverRows = measured
    ? [...measured.levers]
        .map((lever) => ({
          ...lever,
          worstDecileDelta: lever.worstDecileEndEUR - measured.baseWorstDecileEndEUR,
        }))
        .sort(
          (a, b) => b.deltaPoints - a.deltaPoints || b.worstDecileDelta - a.worstDecileDelta
        )
    : []
  const isHistorical = simulation.marketModel === 'historical'
  const pathsPhrase = isHistorical
    ? isGerman
      ? `denselben ${fmtNumber(simulation.effectiveRuns, { locale })} historischen Startjahren`
      : `the same ${fmtNumber(simulation.effectiveRuns, { locale })} historical start years`
    : isGerman
      ? `denselben ${fmtNumber(simulation.effectiveRuns, { locale })} Zufallspfaden`
      : `the same ${fmtNumber(simulation.effectiveRuns, { locale })} random paths`

  /**
   * The section is one page. The fixed parts (header, callout, lever table,
   * 90-day plan) leave room for a certain amount of recommendation text; how
   * many cards that is depends on how long their bodies are, so the cards are
   * counted by the lines they will take rather than by a constant.
   */
  const CARD_LINE_BUDGET = measured ? 15 : 21
  // 8 pt body text on a ~430 pt measure; German wraps a little earlier.
  const CHARS_PER_LINE = isGerman ? 106 : 112
  // Category line and title, then the body.
  const cardLines = (body: string) => 2 + Math.max(1, Math.ceil(body.length / CHARS_PER_LINE))
  const list: typeof recommendations.primary = []
  let usedLines = 0
  for (const rec of recommendations.primary) {
    const lines = cardLines(rec.body)
    if (list.length > 0 && usedLines + lines > CARD_LINE_BUDGET) break
    list.push(rec)
    usedLines += lines
  }
  const hiddenCount = Math.max(0, recommendations.primary.length - list.length)

  /**
   * A short, concrete review agenda. Every row is derived from this plan's own
   * numbers so the reader leaves with dates and amounts, not platitudes.
   */
  const checkpoints: Array<{ when: string; what: string; detail: string }> = [
    {
      when: isGerman ? '0–30 Tage' : 'Days 0–30',
      what: isGerman ? 'Liquiditätspuffer festlegen' : 'Set the cash buffer',
      detail: bridge
        ? isGerman
          ? `Für die ${fmtNumber(bridgeYears, { locale })} Überbrückungsjahre entnimmt der Plan ${fmtCurrency(bridge.cashNeedEUR, locale)}${unitCopy.amountQualifier}; die ersten ${fmtNumber(bridge.cashBucketYears ?? 2, { locale })} Jahre davon schwankungsarm halten.`
          : `Over the ${fmtNumber(bridgeYears, { locale })} bridge years the plan withdraws ${fmtCurrency(bridge.cashNeedEUR, locale)}${unitCopy.amountQualifier}; hold the first ${fmtNumber(bridge.cashBucketYears ?? 2, { locale })} years of it in low-volatility assets.`
        : isGerman
          ? `Zwölf Monatsausgaben (${fmtCurrency(annualSpend, locale)} p.a.${unitCopy.inputQualifier}) als Puffer bereitstellen.`
          : `Hold twelve months of spending (${fmtCurrency(annualSpend, locale)} p.a.${unitCopy.inputQualifier}) as a buffer.`,
    },
    {
      when: isGerman ? '30–60 Tage' : 'Days 30–60',
      what: isGerman ? 'Eine Maßnahme umsetzen' : 'Implement one action',
      detail: list[0]
        ? isGerman
          ? `Beginnen Sie mit „${list[0].title}“ — der am höchsten eingestuften Maßnahme.`
          : `Start with "${list[0].title}" — the highest-ranked action.`
        : isGerman
          ? 'Priorisieren Sie den Hebel mit der größten simulierten Wirkung auf die Erfolgsquote.'
          : 'Prioritise the lever with the largest simulated effect on the success rate.',
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
      detail: allPensionsSwitchedOff(expenses)
        ? isGerman
          ? `Rentenbescheid (die Rente ist im Plan derzeit ausgeschaltet), Ausgabenliste und Planungshorizont bis ${person.horizonAge} überprüfen.`
          : `Revisit the pension statement (the pension is currently switched off in the plan), the expense list and the horizon at age ${person.horizonAge}.`
        : isGerman
          ? `Rentenbescheid (eingegeben: ${fmtCurrency(finances.monthlyPension, locale)} monatlich, brutto), Ausgabenliste und Horizont bis ${person.horizonAge} prüfen.`
          : `Revisit the pension statement (entered: ${fmtCurrency(finances.monthlyPension, locale)} monthly, gross), the expense list and the horizon at age ${person.horizonAge}.`,
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
          { marginBottom: 7 },
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
              ? `Im Stressszenario sind die Ausgaben ab Alter ${fmtNumber(projections.exhaustionAge, { locale })} nicht mehr gedeckt. Die wirksamsten Hebel sind ein späterer Ruhestandsbeginn als ${person.retireAge} und eine Senkung des Jahresbudgets von ${fmtCurrency(annualSpend, locale)}${unitCopy.inputQualifier}; beides wirkt direkt auf die Entnahmerate.`
              : `In the stress scenario spending is no longer funded from age ${fmtNumber(projections.exhaustionAge, { locale })}. The strongest levers are retiring later than ${person.retireAge} and trimming the annual budget of ${fmtCurrency(annualSpend, locale)}${unitCopy.inputQualifier}; both act directly on the withdrawal rate.`
            : isGerman
              ? `Der Plan trägt auch im Stressszenario bis Alter ${person.horizonAge}. Im Fokus steht daher die Absicherung: ${bridge ? 'Liquiditätspuffer für die Überbrückungsjahre und ' : ''}regelmäßige Überprüfung der Annahmen.`
              : `The plan holds to age ${person.horizonAge} even under stress. The focus is therefore protective: ${bridge ? 'keep the bridge-year liquidity buffer and ' : ''}revisit the assumptions regularly.`}
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
                  marginBottom: 4,
                  paddingVertical: 5,
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
            ? `${list.length} von ${recommendations.primary.length} Maßnahmen nach Einstufung priorisiert; die vollständige Liste zeigt die App.`
            : `${list.length} of ${recommendations.primary.length} measures shown, by ranking; the app lists them all.`}
        </Text>
      )}

      {measured && leverRows.length > 0 && (
        <View style={[styles.card, { marginTop: 2, marginBottom: 6, paddingVertical: 7 }]}>
          <Text style={[styles.cardTitle, { marginBottom: 3 }]}>
            {isGerman ? 'Simulierte Wirkung der Hebel' : 'Simulated Effect of the Levers'}
          </Text>
          <Text style={{ fontSize: 7, color: tokens.colors.ink[500], marginBottom: 4, lineHeight: 1.4 }}>
            {isGerman
              ? `Simuliert, nicht geschätzt: je Hebel ein vollständiger Lauf auf ${pathsPhrase} wie das Ergebnis dieses Berichts (${fmtRatioPercent(measured.baseSuccessRatePct / 100, 1, locale)}). Wirkung in Prozentpunkten (pp) der Erfolgsquote; P10-Endvermögen ${unitCopy.tag}.`
              : `Simulated, not estimated: one full run per lever on ${pathsPhrase} as this report's own result (${fmtRatioPercent(measured.baseSuccessRatePct / 100, 1, locale)}). Effect in percentage points (pp) of the success rate; P10 end assets ${unitCopy.tag}.`}
          </Text>
          <Table>
            <TableRow header>
              <TableCell header width="40%">
                {isGerman ? 'Hebel' : 'Lever'}
              </TableCell>
              <TableCell header width="19%" align="right">
                {isGerman ? 'Simuliert' : 'Simulated'}
              </TableCell>
              <TableCell header width="17%" align="right">
                {isGerman ? 'Neue Quote' : 'Resulting rate'}
              </TableCell>
              <TableCell header width="24%" align="right">
                {isGerman ? 'P10-Endvermögen' : 'P10 end assets'}
              </TableCell>
            </TableRow>
            {leverRows.map((lever, index) => (
              <TableRow key={lever.id} alt={index % 2 === 1}>
                <TableCell width="40%">
                  <Text style={{ fontSize: 7.5, fontWeight: 600, color: tokens.colors.ink[900] }}>
                    {LEVER_NAMES[lever.id][isGerman ? 'de' : 'en']}
                  </Text>
                </TableCell>
                <TableCell width="19%" align="right">
                  <Text style={{ fontSize: 7.5, fontWeight: 600, color: tokens.colors.ink[900] }}>
                    {signedPoints(lever.deltaPoints, locale)}
                  </Text>
                </TableCell>
                <TableCell width="17%" align="right">
                  <Text style={{ fontSize: 7.5 }}>
                    {fmtRatioPercent(lever.successRatePct / 100, 1, locale)}
                  </Text>
                </TableCell>
                <TableCell width="24%" align="right">
                  <Text style={{ fontSize: 7.5 }}>{signedMoney(lever.worstDecileDelta, locale)}</Text>
                </TableCell>
              </TableRow>
            ))}
          </Table>
        </View>
      )}

      <View style={[styles.card, { marginTop: 0, marginBottom: 0, paddingVertical: 7 }]}>
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
