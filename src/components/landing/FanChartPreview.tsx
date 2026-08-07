import { useTranslations } from 'next-intl'

/**
 * Pre-computed Monte Carlo fan chart for the landing page hero preview.
 *
 * The percentile curves were generated offline with the same model the app
 * uses (lognormal returns, accumulation until 62, drawdown with pension from
 * 67), then projected onto a 720x320 viewBox with a mild power scale so the
 * lower percentiles stay readable. Ages run 35 -> 90 across the x-axis.
 */
const BAND_OUTER =
  'M0.0,271.5 L13.1,266.9 L26.2,263.5 L39.3,259.9 L52.4,256.6 L65.5,253.2 L78.5,249.8 L91.6,246.2 L104.7,242.9 L117.8,239.7 L130.9,235.7 L144.0,231.8 L157.1,227.9 L170.2,224.0 L183.3,220.2 L196.4,216.1 L209.5,211.6 L222.5,207.6 L235.6,203.0 L248.7,198.6 L261.8,194.4 L274.9,189.6 L288.0,184.3 L301.1,179.3 L314.2,174.8 L327.3,169.3 L340.4,164.1 L353.5,158.2 L366.5,155.5 L379.6,152.7 L392.7,148.2 L405.8,145.3 L418.9,141.8 L432.0,137.9 L445.1,133.7 L458.2,129.3 L471.3,125.3 L484.4,121.0 L497.5,117.0 L510.5,110.0 L523.6,106.7 L536.7,101.8 L549.8,96.2 L562.9,92.9 L576.0,87.0 L589.1,81.9 L602.2,77.2 L615.3,69.9 L628.4,62.9 L641.5,55.6 L654.5,48.2 L667.6,40.8 L680.7,33.0 L693.8,26.2 L706.9,17.1 L720.0,10.0 L720.0,266.9 L706.9,263.3 L693.8,260.1 L680.7,257.9 L667.6,254.6 L654.5,252.2 L641.5,250.3 L628.4,248.1 L615.3,245.1 L602.2,243.4 L589.1,242.5 L576.0,240.8 L562.9,239.6 L549.8,238.4 L536.7,236.7 L523.6,235.8 L510.5,234.5 L497.5,233.1 L484.4,232.4 L471.3,231.2 L458.2,229.7 L445.1,228.6 L432.0,227.7 L418.9,227.3 L405.8,225.1 L392.7,223.0 L379.6,221.4 L366.5,219.2 L353.5,217.3 L340.4,220.0 L327.3,222.4 L314.2,224.9 L301.1,227.1 L288.0,228.9 L274.9,230.6 L261.8,232.7 L248.7,235.0 L235.6,237.1 L222.5,239.3 L209.5,241.3 L196.4,243.4 L183.3,245.4 L170.2,247.4 L157.1,249.4 L144.0,251.2 L130.9,253.2 L117.8,255.3 L104.7,257.1 L91.6,259.0 L78.5,260.9 L65.5,262.8 L52.4,264.8 L39.3,266.7 L26.2,268.5 L13.1,270.4 L0.0,271.5 Z'

const BAND_INNER =
  'M0.0,271.5 L13.1,267.9 L26.2,264.8 L39.3,261.8 L52.4,258.8 L65.5,255.8 L78.5,253.0 L91.6,250.0 L104.7,246.9 L117.8,243.8 L130.9,240.7 L144.0,237.4 L157.1,234.0 L170.2,230.8 L183.3,227.4 L196.4,223.8 L209.5,220.4 L222.5,216.8 L235.6,213.2 L248.7,209.8 L261.8,206.1 L274.9,202.1 L288.0,198.4 L301.1,193.9 L314.2,189.6 L327.3,185.0 L340.4,180.7 L353.5,176.4 L366.5,174.6 L379.6,172.9 L392.7,171.0 L405.8,169.1 L418.9,168.1 L432.0,165.7 L445.1,163.5 L458.2,160.1 L471.3,157.0 L484.4,153.9 L497.5,151.6 L510.5,148.6 L523.6,145.4 L536.7,142.5 L549.8,139.5 L562.9,135.0 L576.0,130.8 L589.1,127.3 L602.2,124.2 L615.3,121.3 L628.4,117.1 L641.5,112.3 L654.5,108.4 L667.6,104.2 L680.7,99.0 L693.8,95.8 L706.9,90.9 L720.0,85.0 L720.0,213.6 L706.9,213.4 L693.8,212.9 L680.7,212.5 L667.6,213.0 L654.5,213.0 L641.5,212.7 L628.4,211.8 L615.3,212.0 L602.2,212.0 L589.1,213.2 L576.0,212.7 L562.9,213.2 L549.8,212.6 L536.7,212.5 L523.6,212.8 L510.5,212.4 L497.5,212.3 L484.4,211.7 L471.3,211.8 L458.2,212.0 L445.1,212.5 L432.0,211.9 L418.9,211.9 L405.8,210.8 L392.7,209.8 L379.6,209.0 L366.5,208.1 L353.5,207.2 L340.4,210.4 L327.3,213.1 L314.2,215.8 L301.1,218.4 L288.0,221.0 L274.9,223.6 L261.8,226.1 L248.7,228.6 L235.6,231.0 L222.5,233.6 L209.5,235.9 L196.4,238.5 L183.3,240.7 L170.2,242.9 L157.1,245.3 L144.0,247.6 L130.9,249.7 L117.8,252.0 L104.7,254.4 L91.6,256.5 L78.5,258.8 L65.5,260.8 L52.4,263.0 L39.3,265.3 L26.2,267.5 L13.1,269.7 L0.0,271.5 Z'

const MEDIAN =
  'M0.0,271.5 L13.1,268.8 L26.2,266.2 L39.3,263.5 L52.4,261.0 L65.5,258.5 L78.5,255.9 L91.6,253.5 L104.7,250.8 L117.8,248.1 L130.9,245.5 L144.0,242.9 L157.1,240.1 L170.2,237.3 L183.3,234.6 L196.4,231.7 L209.5,228.9 L222.5,226.0 L235.6,223.1 L248.7,220.2 L261.8,216.8 L274.9,213.8 L288.0,210.4 L301.1,207.2 L314.2,203.7 L327.3,200.1 L340.4,196.2 L353.5,192.9 L366.5,192.7 L379.6,192.4 L392.7,192.2 L405.8,192.1 L418.9,190.9 L432.0,190.2 L445.1,188.9 L458.2,187.8 L471.3,187.1 L484.4,185.8 L497.5,184.7 L510.5,183.8 L523.6,181.5 L536.7,180.4 L549.8,178.6 L562.9,177.2 L576.0,175.1 L589.1,173.5 L602.2,172.1 L615.3,170.0 L628.4,168.3 L641.5,166.9 L654.5,165.1 L667.6,163.1 L680.7,160.9 L693.8,158.9 L706.9,157.6 L720.0,155.2'

const VIEW_W = 720
const VIEW_H = 320
const RETIRE_X = 353.5
const START_AGE = 35
const END_AGE = 90
const AXIS_AGES = [40, 50, 60, 70, 80]

const GRID_YS = [60, 115, 170, 225, 280]

function agePercent(age: number) {
  return ((age - START_AGE) / (END_AGE - START_AGE)) * 100
}

export function FanChartPreview() {
  const t = useTranslations('landing.preview')

  return (
    <figure className="relative m-0">
      {/* Framed chart window */}
      <div className="theme-panel-card relative overflow-hidden border-3 border-neo-black bg-neo-white shadow-neo-lg">
        {/* Window chrome */}
        <div className="flex items-center justify-between gap-4 border-b-3 border-neo-black bg-[var(--neo-surface-muted)] px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
              <span className="h-3 w-3 border-2 border-neo-black bg-neo-red" />
              <span className="h-3 w-3 border-2 border-neo-black bg-neo-yellow" />
              <span className="h-3 w-3 border-2 border-neo-black bg-neo-green" />
            </div>
            <p className="truncate text-[0.62rem] font-bold uppercase tracking-[0.2em] text-neo-black">
              {t('windowTitle')}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 border-2 border-neo-black bg-neo-green px-2.5 py-1 text-[0.58rem] font-bold uppercase tracking-[0.18em] text-gray-950">
            <span
              className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-gray-950"
              aria-hidden="true"
            />
            {t('live')}
          </span>
        </div>

        {/* Plot area */}
        <div className="relative px-3 pb-2 pt-4 sm:px-6 sm:pt-6">
          <div className="relative">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="block h-auto w-full"
              role="img"
              aria-label={t('chartAlt')}
            >
              {/* Grid */}
              {GRID_YS.map((y) => (
                <line
                  key={y}
                  x1={0}
                  x2={VIEW_W}
                  y1={y}
                  y2={y}
                  className="stroke-neo-black"
                  strokeOpacity={0.09}
                  strokeWidth={1.5}
                  strokeDasharray="2 6"
                />
              ))}

              {/* Percentile bands */}
              <path d={BAND_OUTER} className="fill-chart-1" fillOpacity={0.16} />
              <path d={BAND_INNER} className="fill-chart-1" fillOpacity={0.3} />

              {/* Retirement marker */}
              <line
                x1={RETIRE_X}
                x2={RETIRE_X}
                y1={14}
                y2={VIEW_H - 14}
                className="stroke-chart-3"
                strokeWidth={2.5}
                strokeDasharray="7 6"
              />

              {/* Median path */}
              <path
                d={MEDIAN}
                fill="none"
                className="stroke-chart-1"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Median endpoint dot */}
              <circle cx={713} cy={155.6} r={7} className="fill-chart-1" />
              <circle
                cx={713}
                cy={155.6}
                r={7}
                fill="none"
                className="stroke-neo-white"
                strokeWidth={2.5}
              />
            </svg>

            {/* Retirement label chip (HTML overlay so it stays crisp at any width) */}
            <div
              className="pointer-events-none absolute top-1 hidden -translate-x-1/2 sm:block"
              style={{ left: `${(RETIRE_X / VIEW_W) * 100}%` }}
            >
              <span className="border-2 border-neo-black bg-neo-white px-2.5 py-1 text-[0.58rem] font-bold uppercase tracking-[0.16em] text-neo-black shadow-neo-xs">
                {t('retirementMarker')}
              </span>
            </div>
          </div>

          {/* Age axis */}
          <div className="relative mt-2 h-5" aria-hidden="true">
            <span className="absolute left-0 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t('ageAxisLabel')} {START_AGE}
            </span>
            {AXIS_AGES.map((age) => (
              <span
                key={age}
                className="absolute hidden -translate-x-1/2 text-[0.58rem] font-semibold tracking-[0.14em] text-muted-foreground sm:block"
                style={{ left: `${agePercent(age)}%` }}
              >
                {age}
              </span>
            ))}
            <span className="absolute right-0 text-[0.58rem] font-semibold tracking-[0.14em] text-muted-foreground">
              {END_AGE}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t-3 border-neo-black bg-[var(--neo-surface-muted)] px-4 py-3 sm:px-6">
          <span className="inline-flex items-center gap-2 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-neo-black">
            <span className="h-1 w-6 rounded-full bg-chart-1" aria-hidden="true" />
            {t('legendMedian')}
          </span>
          <span className="inline-flex items-center gap-2 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="h-3 w-6 bg-chart-1 opacity-40" aria-hidden="true" />
            {t('legendInner')}
          </span>
          <span className="inline-flex items-center gap-2 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="h-3 w-6 bg-chart-1 opacity-20" aria-hidden="true" />
            {t('legendOuter')}
          </span>
        </div>
      </div>

      {/* Floating success card */}
      <div className="absolute -top-6 left-4 hidden rotate-[-2deg] border-3 border-neo-black bg-neo-white p-4 shadow-neo-md sm:left-8 md:block lg:-left-8 lg:top-16">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {t('successLabel')}
        </p>
        <p className="mt-1 font-heading text-4xl font-black tracking-tight text-neo-black">
          <span className="inline-block border-2 border-neo-black bg-neo-green px-2 py-0.5 text-gray-950">
            {t('successValue')}
          </span>
        </p>
        <p className="mt-2 max-w-[11rem] text-[0.6rem] font-medium leading-relaxed text-muted-foreground">
          {t('successCaption')}
        </p>
      </div>
    </figure>
  )
}
