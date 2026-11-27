import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { buildFanGeometry, FAN_H, FAN_W } from '@/components/simulation-compact/fanGeometry'
import { formatAxisEuro, formatBarEuro } from '@/components/simulation-compact/format'
import {
  PREVIEW_AGES,
  PREVIEW_PLAN,
  PREVIEW_RUNS,
  PREVIEW_SERIES,
  PREVIEW_TERMINAL,
} from './preview-data'

/**
 * Landing-page product preview: the workspace's asset chart ("Vermögen"),
 * drawn with the same geometry (`buildFanGeometry`), colours, legend and
 * markers as `FanChartCard`, so the first thing a visitor sees is what the
 * app will show them — not a lookalike in other colours.
 *
 * Every curve and number is real output of the app's own Monte Carlo engine
 * (`preview-data.ts`): the default plan, run {PREVIEW_RUNS} times. A server
 * component: static SVG, no interaction, no client JS.
 */

const AGES = [...PREVIEW_AGES]
const SERIES = {
  p10: [...PREVIEW_SERIES.p10],
  p20: [...PREVIEW_SERIES.p20],
  p50: [...PREVIEW_SERIES.p50],
  p80: [...PREVIEW_SERIES.p80],
  p90: [...PREVIEW_SERIES.p90],
}
const GEOMETRY = buildFanGeometry(AGES, [SERIES.p90])
const START_AGE = AGES[0]
const END_AGE = AGES[AGES.length - 1]

export function FanChartPreview() {
  const t = useTranslations('landing.preview')
  const tChart = useTranslations('simulationCompact.chart')
  const locale = useLocale()
  const format = useFormatter()
  const runsLabel = format.number(PREVIEW_RUNS)
  const { retirementAge, legalRetirementAge, endAge } = PREVIEW_PLAN

  const outcomes = [
    { key: 'low', value: PREVIEW_TERMINAL.p10 },
    { key: 'median', value: PREVIEW_TERMINAL.p50 },
    { key: 'high', value: PREVIEW_TERMINAL.p90 },
  ] as const

  return (
    <figure className="lp-figure">
      <div className="lp-fan" data-testid="landing-fan">
        <div className="lp-fan-head">
          <p className="lp-fan-title">{t('title')}</p>
          <ul className="lp-fan-legend" aria-hidden="true">
            <li>
              <span className="lp-fan-key" data-key="median" />
              {tChart('median')}
            </li>
            <li>
              <span className="lp-fan-key" data-key="outer" />
              {tChart('bandOuter')}
            </li>
            <li className="lp-fan-legend-inner">
              <span className="lp-fan-key" data-key="inner" />
              {tChart('bandInner')}
            </li>
          </ul>
        </div>

        <div
          className="lp-fan-plot"
          role="img"
          aria-label={t('chartAlt', { runs: runsLabel, startAge: START_AGE, endAge: END_AGE })}
        >
          <svg viewBox={`0 0 ${FAN_W} ${FAN_H}`} preserveAspectRatio="none" aria-hidden="true">
            {GEOMETRY.gridLines.map((grid) => (
              <line
                key={grid.value}
                x1={0}
                x2={FAN_W}
                y1={grid.y}
                y2={grid.y}
                stroke="var(--gray-200)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={GEOMETRY.band(SERIES.p10, SERIES.p90)} fill="var(--viz-seq-1)" />
            <path d={GEOMETRY.band(SERIES.p20, SERIES.p80)} fill="var(--viz-seq-2)" />
            <line
              x1={GEOMETRY.ageX(legalRetirementAge)}
              x2={GEOMETRY.ageX(legalRetirementAge)}
              y1={0}
              y2={FAN_H}
              stroke="var(--line-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={GEOMETRY.ageX(retirementAge)}
              x2={GEOMETRY.ageX(retirementAge)}
              y1={0}
              y2={FAN_H}
              stroke="var(--viz-seq-5)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={GEOMETRY.line(SERIES.p50)}
              fill="none"
              stroke="var(--viz-seq-5)"
              strokeWidth={2.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {GEOMETRY.gridLines.map((grid) => (
            <span key={grid.value} className="lp-fan-ylabel" style={{ top: grid.topPct }}>
              {formatAxisEuro(grid.value, locale)}
            </span>
          ))}
          <span
            className="lp-fan-marker"
            data-marker="retirement"
            style={{ left: GEOMETRY.agePct(retirementAge) }}
          >
            {tChart('retirementMarker', { age: retirementAge })}
          </span>
          <span
            className="lp-fan-marker"
            data-marker="pension"
            style={{ left: GEOMETRY.agePct(legalRetirementAge) }}
          >
            {tChart('pensionMarker', { age: legalRetirementAge })}
          </span>
        </div>

        <div className="lp-fan-axis" aria-hidden="true">
          {GEOMETRY.axisTicks.map((tick) => (
            <span key={tick.age} style={{ left: tick.leftPct }}>
              {format.number(tick.age)}
            </span>
          ))}
        </div>
      </div>

      {/* The chart's right edge, as numbers: what is left at the end age. */}
      <section className="lp-outcomes" aria-labelledby="lp-outcomes-title">
        <h2 id="lp-outcomes-title" className="lp-outcomes-title">
          {t('endTitle', { age: endAge })}
        </h2>
        <ul>
          {outcomes.map(({ key, value }) => (
            <li key={key}>
              <span className="lp-outcome-label">{t(`outcomes.${key}.label`)}</span>
              <strong className="lp-outcome-value">{formatBarEuro(value, locale)}</strong>
              <span className="lp-outcome-body">
                {key === 'high' && PREVIEW_TERMINAL.p10 > 0
                  ? t('outcomes.high.ratio', {
                      ratio: format.number(PREVIEW_TERMINAL.p90 / PREVIEW_TERMINAL.p10, {
                        maximumFractionDigits: 0,
                      }),
                    })
                  : t(`outcomes.${key}.body`)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </figure>
  )
}
