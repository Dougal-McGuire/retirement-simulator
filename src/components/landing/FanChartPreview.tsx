import { useFormatter, useTranslations } from 'next-intl'
import {
  PREVIEW_AGES,
  PREVIEW_PLAN,
  PREVIEW_RUNS,
  PREVIEW_SERIES,
  PREVIEW_SUCCESS_RATE,
  PREVIEW_TERMINAL,
} from './preview-data'

/**
 * Landing-page product preview.
 *
 * Every curve and number here is real output of the app's own Monte Carlo
 * engine (see `preview-data.ts`): the default plan, run {PREVIEW_RUNS} times.
 * Nothing is illustrative, so the panel can never contradict the stat band.
 */

const VIEW_W = 720
const VIEW_H = 300

const START_AGE = PREVIEW_AGES[0]
const END_AGE = PREVIEW_AGES[PREVIEW_AGES.length - 1]

/** Round the axis maximum up to a friendly step so gridlines land on round money. */
const AXIS_STEP = 1_000_000
const AXIS_MAX = Math.ceil(PREVIEW_TERMINAL.p90 / AXIS_STEP) * AXIS_STEP
const AXIS_TICKS = Array.from({ length: AXIS_MAX / AXIS_STEP + 1 }, (_, i) => i * AXIS_STEP)
/** Label every other gridline so the axis stays legible on narrow screens. */
const AXIS_LABELS = AXIS_TICKS.filter((_, i) => i % 2 === 0)

const AXIS_AGES = PREVIEW_AGES.filter((age) => age % 10 === 0 && age > START_AGE && age < END_AGE)

function xFor(age: number) {
  return ((age - START_AGE) / (END_AGE - START_AGE)) * VIEW_W
}

function yFor(value: number) {
  return VIEW_H - (Math.min(value, AXIS_MAX) / AXIS_MAX) * VIEW_H
}

function percentFor(age: number) {
  return ((age - START_AGE) / (END_AGE - START_AGE)) * 100
}

function linePath(series: readonly number[]) {
  return series
    .map(
      (value, i) =>
        `${i === 0 ? 'M' : 'L'}${xFor(PREVIEW_AGES[i]).toFixed(1)},${yFor(value).toFixed(1)}`
    )
    .join(' ')
}

function bandPath(upper: readonly number[], lower: readonly number[]) {
  const up = upper
    .map(
      (value, i) =>
        `${i === 0 ? 'M' : 'L'}${xFor(PREVIEW_AGES[i]).toFixed(1)},${yFor(value).toFixed(1)}`
    )
    .join(' ')
  const down = lower
    .map(
      (value, i) =>
        `L${xFor(PREVIEW_AGES[lower.length - 1 - i]).toFixed(1)},${yFor(lower[lower.length - 1 - i]).toFixed(1)}`
    )
    .join(' ')
  return `${up} ${down} Z`
}

const BAND_OUTER = bandPath(PREVIEW_SERIES.p90, PREVIEW_SERIES.p10)
const BAND_INNER = bandPath(PREVIEW_SERIES.p80, PREVIEW_SERIES.p20)
const MEDIAN = linePath(PREVIEW_SERIES.p50)
const RETIRE_X = xFor(PREVIEW_PLAN.retirementAge)
const PENSION_X = xFor(PREVIEW_PLAN.legalRetirementAge)

export function FanChartPreview() {
  const t = useTranslations('landing.preview')
  const format = useFormatter()

  const compactMoney = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumSignificantDigits: 3,
    })

  const runsLabel = format.number(PREVIEW_RUNS)
  const successLabel = format.number(PREVIEW_SUCCESS_RATE / 100, {
    style: 'percent',
    maximumFractionDigits: 1,
  })

  const outcomes = [
    { key: 'low', value: PREVIEW_TERMINAL.p10, tone: 'bg-viz-orange' },
    { key: 'median', value: PREVIEW_TERMINAL.p50, tone: 'bg-chart-1' },
    { key: 'high', value: PREVIEW_TERMINAL.p90, tone: 'bg-ok' },
  ] as const

  return (
    <figure className="relative m-0">
      <div className="rounded-sm theme-panel-card relative overflow-hidden border border-border bg-white shadow-lg">
        {/* Window chrome */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-[var(--gray-100)] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
              <span className="rounded-sm h-3 w-3 border-2 border-border bg-danger" />
              <span className="rounded-sm h-3 w-3 border-2 border-border bg-amber" />
              <span className="rounded-sm h-3 w-3 border-2 border-border bg-ok" />
            </div>
            <p className="landing-label truncate text-[0.66rem] font-bold text-ink">
              {t('windowTitle')}
            </p>
          </div>
          <span className="rounded-sm landing-label inline-flex shrink-0 items-center gap-2 border-2 border-border bg-ok px-2.5 py-1 text-[0.6rem] font-bold text-gray-950">
            {t('runsChip', { runs: runsLabel })}
          </span>
        </div>

        {/* Plot area */}
        <div className="relative px-3 pb-3 pt-5 sm:px-5 sm:pt-6">
          <div className="relative min-w-0 pl-10 sm:pl-14">
            <div className="relative">
              <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                className="block h-auto w-full min-w-0 overflow-visible"
                role="img"
                aria-label={t('chartAlt', {
                  runs: runsLabel,
                  startAge: START_AGE,
                  endAge: END_AGE,
                })}
              >
                {AXIS_TICKS.map((tick) => (
                  <line
                    key={tick}
                    x1={0}
                    x2={VIEW_W}
                    y1={yFor(tick)}
                    y2={yFor(tick)}
                    className="stroke-ink"
                    strokeOpacity={tick === 0 ? 0.35 : 0.12}
                    strokeWidth={1.5}
                    strokeDasharray={tick === 0 ? undefined : '2 6'}
                  />
                ))}

                <path d={BAND_OUTER} className="fill-chart-1" fillOpacity={0.16} />
                <path d={BAND_INNER} className="fill-chart-1" fillOpacity={0.32} />

                <line
                  x1={PENSION_X}
                  x2={PENSION_X}
                  y1={10}
                  y2={VIEW_H}
                  className="hidden stroke-chart-4 sm:block"
                  strokeWidth={2}
                  strokeDasharray="5 7"
                />
                <line
                  x1={RETIRE_X}
                  x2={RETIRE_X}
                  y1={10}
                  y2={VIEW_H}
                  className="stroke-chart-3"
                  strokeWidth={2.5}
                  strokeDasharray="7 6"
                />

                <path
                  d={MEDIAN}
                  fill="none"
                  className="stroke-chart-1"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                <circle
                  cx={xFor(END_AGE)}
                  cy={yFor(PREVIEW_TERMINAL.p50)}
                  r={7}
                  className="fill-chart-1"
                />
                <circle
                  cx={xFor(END_AGE)}
                  cy={yFor(PREVIEW_TERMINAL.p50)}
                  r={7}
                  fill="none"
                  className="stroke-white"
                  strokeWidth={2.5}
                />
              </svg>

              {/* Money axis (HTML so it stays legible at any width) */}
              <div className="pointer-events-none absolute inset-y-0 -left-10 w-9 sm:-left-14 sm:w-[3.25rem]">
                {AXIS_LABELS.map((tick) => (
                  <span
                    key={tick}
                    className="landing-body absolute right-0 -translate-y-1/2 text-[0.55rem] font-semibold tabular-nums text-muted-foreground"
                    style={{ top: `${(yFor(tick) / VIEW_H) * 100}%` }}
                  >
                    {compactMoney(tick)}
                  </span>
                ))}
              </div>

              {/* Phase markers */}
              <div
                className="pointer-events-none absolute -top-1 -translate-x-1/2"
                style={{ left: `${percentFor(PREVIEW_PLAN.retirementAge)}%` }}
              >
                <span className="rounded-sm landing-label border-2 border-border bg-white px-2 py-0.5 text-[0.55rem] font-bold text-ink shadow-sm">
                  {t('retirementMarker', { age: PREVIEW_PLAN.retirementAge })}
                </span>
              </div>
              <div
                className="pointer-events-none absolute -top-1 hidden -translate-x-1/2 sm:block"
                style={{ left: `${percentFor(PREVIEW_PLAN.legalRetirementAge)}%` }}
              >
                <span className="rounded-sm landing-label border-2 border-border bg-white px-2 py-0.5 text-[0.55rem] font-bold text-ink shadow-sm">
                  {t('pensionMarker', { age: PREVIEW_PLAN.legalRetirementAge })}
                </span>
              </div>
            </div>

            {/* Age axis */}
            <div className="relative mt-2 h-4" aria-hidden="true">
              <span className="landing-body absolute left-0 text-[0.55rem] font-semibold text-muted-foreground">
                {t('ageAxisLabel')} {START_AGE}
              </span>
              {AXIS_AGES.map((age) => (
                <span
                  key={age}
                  className="landing-body absolute hidden -translate-x-1/2 text-[0.55rem] font-semibold tabular-nums text-muted-foreground sm:block"
                  style={{ left: `${percentFor(age)}%` }}
                >
                  {age}
                </span>
              ))}
              <span className="landing-body absolute right-0 text-[0.55rem] font-semibold tabular-nums text-muted-foreground">
                {END_AGE}
              </span>
            </div>
          </div>
        </div>

        {/* Readout: the same numbers the dashboard reports */}
        <div className="grid grid-cols-3 border-t border-border bg-[var(--gray-100)] divide-x-[3px] divide-border">
          {outcomes.map(({ key, value, tone }) => (
            <div
              key={key}
              className="flex h-full min-w-0 flex-col justify-between px-2 py-3 sm:px-4"
            >
              <span className="landing-label flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.5rem] font-semibold text-muted-foreground sm:text-[0.55rem]">
                <span className={`h-2 w-4 ${tone}`} aria-hidden="true" />
                {t(`outcomes.${key}`)}
              </span>
              <p className="landing-display mt-1 font-heading text-sm font-black tabular-nums text-ink sm:text-lg">
                {compactMoney(value)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <figcaption className="landing-body mt-3 text-[0.62rem] font-medium leading-relaxed text-muted-foreground">
        {t('caption', {
          runs: runsLabel,
          successRate: successLabel,
          endAge: END_AGE,
        })}
      </figcaption>
    </figure>
  )
}
