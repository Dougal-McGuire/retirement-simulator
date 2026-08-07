import Image from 'next/image'
import {
  Activity,
  ArrowRight,
  FileText,
  Languages,
  Route,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import { Button } from '@/components/ui/button'
import { HeaderControlsMenu } from '@/components/navigation/HeaderControlsMenu'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { ThemeSwitcher } from '@/components/navigation/ThemeSwitcher'
import { FanChartPreview } from './FanChartPreview'
import {
  PREVIEW_AGES,
  PREVIEW_PLAN,
  PREVIEW_RUNS,
  PREVIEW_SUCCESS_RATE,
  PREVIEW_TERMINAL,
} from './preview-data'
import { cn } from '@/lib/utils'

const FEATURES = [
  {
    key: 'monteCarlo',
    Icon: Activity,
    tile: 'bg-secondary text-secondary-foreground',
    rotate: 'rotate-3',
  },
  {
    key: 'live',
    Icon: SlidersHorizontal,
    tile: 'bg-primary text-primary-foreground',
    rotate: '-rotate-2',
  },
  { key: 'phases', Icon: Route, tile: 'bg-neo-green text-gray-950', rotate: 'rotate-2' },
  { key: 'reports', Icon: FileText, tile: 'bg-neo-orange text-gray-950', rotate: '-rotate-3' },
  {
    key: 'privacy',
    Icon: ShieldCheck,
    tile: 'bg-accent text-accent-foreground',
    rotate: 'rotate-2',
  },
  { key: 'bilingual', Icon: Languages, tile: 'bg-neo-purple text-white', rotate: '-rotate-2' },
] as const

const HOW_STEPS = [
  { key: 'step1', accent: 'bg-neo-yellow' },
  { key: 'step2', accent: 'bg-neo-blue' },
  { key: 'step3', accent: 'bg-neo-green' },
] as const

const SPREAD_ITEMS = [
  { key: 'low', value: PREVIEW_TERMINAL.p10, accent: 'bg-neo-orange' },
  { key: 'median', value: PREVIEW_TERMINAL.p50, accent: 'bg-chart-1' },
  { key: 'high', value: PREVIEW_TERMINAL.p90, accent: 'bg-neo-green' },
] as const

export function LandingPage() {
  const t = useTranslations('landing')
  const format = useFormatter()
  const year = String(new Date().getFullYear())

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

  // Every headline number on this page is derived from the single baked run of
  // the real engine, so the stat band can never disagree with the chart.
  const STATS = [
    { key: 'scenarios', value: runsLabel },
    { key: 'percentiles', value: t('stats.percentiles.value') },
    { key: 'years', value: format.number(PREVIEW_AGES.length) },
    { key: 'privacy', value: t('stats.privacy.value') },
  ] as const

  return (
    <div className="app-page landing-typeset relative min-h-screen">
      {/* ================= Header ================= */}
      <header id="navigation" className="relative z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border-3 border-neo-black bg-neo-yellow shadow-neo-sm transition-neo group-hover:-translate-x-[1px] group-hover:-translate-y-[1px] group-hover:shadow-neo">
              <Image src="/piggy.svg" alt="" width={24} height={24} priority />
            </span>
            <span className="landing-label font-heading text-[0.72rem] font-black text-neo-black [overflow-wrap:anywhere] sm:text-sm">
              {t('nav.appName')}
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <LocaleSwitcher className="hidden w-auto px-3 tracking-[0.08em] lg:flex" />
            <ThemeSwitcher className="hidden lg:flex" />
            <HeaderControlsMenu className="lg:hidden" />
            <Button size="sm" asChild className="landing-label shrink-0">
              <Link href="/setup">
                <span className="sm:hidden">{t('nav.launchShort')}</span>
                <span className="hidden sm:inline">{t('nav.launch')}</span>
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" className="relative z-10">
        {/* ================= Hero: message + real product output ================= */}
        <section className="mx-auto max-w-6xl px-4 pb-14 pt-4 sm:px-6 sm:pt-8 lg:pb-20">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              <span className="neo-chip landing-label animate-fade-in text-[0.62rem]">
                <span
                  className="h-2 w-2 animate-pulse-soft rounded-full bg-current"
                  aria-hidden="true"
                />
                {t('hero.badge')}
              </span>

              <h1 className="landing-display animate-fade-in mt-5 text-balance font-heading text-[1.95rem] font-black leading-[1.08] text-neo-black sm:text-[2.6rem] lg:text-[2.7rem]">
                {t('hero.titleLine1')}{' '}
                <span className="mt-2 inline-block border-3 border-neo-black bg-secondary px-3 py-0.5 text-secondary-foreground shadow-neo">
                  {t('hero.titleLine2', { runs: runsLabel })}
                </span>
              </h1>

              {/* The thesis of the whole product — front and centre, not buried. */}
              <p className="landing-display animate-fade-in-delayed mt-5 max-w-xl font-heading text-lg font-bold leading-snug text-neo-black sm:text-xl">
                {t('hero.lede')}
              </p>

              <p className="landing-body animate-fade-in-delayed mt-3 max-w-xl text-pretty text-sm font-medium leading-relaxed text-foreground/80">
                {t('hero.subtitle')}
              </p>

              <div className="animate-fade-in-delayed mt-7 flex w-full flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
                <Button
                  size="lg"
                  asChild
                  className="landing-label h-auto w-full whitespace-normal py-3 text-center leading-tight sm:w-auto lg:w-full lg:max-w-[21rem]"
                >
                  <Link href="/setup">
                    {t('hero.ctaPrimary')}
                    <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  asChild
                  className="landing-label h-auto w-full whitespace-normal py-3 text-center leading-tight sm:w-auto lg:w-full lg:max-w-[21rem]"
                >
                  <Link href="/simulation">{t('hero.ctaSecondary')}</Link>
                </Button>
              </div>

              <p className="landing-body animate-fade-in-more-delayed mt-4 text-xs font-semibold leading-relaxed text-muted-foreground">
                {t('hero.note')}
              </p>
            </div>

            <div className="animate-fade-in-delayed lg:col-span-7">
              <FanChartPreview />
            </div>
          </div>

          {/* Stats strip */}
          <div className="animate-fade-in-more-delayed mt-12 grid grid-cols-2 gap-4 lg:mt-16 lg:grid-cols-4">
            {STATS.map(({ key, value }) => (
              <div
                key={key}
                className="theme-panel-card border-3 border-neo-black bg-neo-white p-5 shadow-neo transition-neo hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-neo-md"
              >
                <p className="landing-display font-heading text-2xl font-black tabular-nums text-neo-black sm:text-3xl">
                  {value}
                </p>
                <p className="landing-body mt-2 text-[0.68rem] font-semibold leading-snug text-muted-foreground">
                  {t(`stats.${key}.label`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ================= Same plan, different futures ================= */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:pb-28">
          <div className="mx-auto mb-10 flex max-w-2xl flex-col items-center text-center">
            <span className="inline-block border-3 border-neo-black bg-primary landing-label px-3 py-1 text-[0.66rem] font-bold text-primary-foreground shadow-neo-sm">
              {t('spread.eyebrow')}
            </span>
            <h2 className="landing-display mt-5 text-balance font-heading text-2xl font-black text-neo-black sm:text-4xl">
              {t('spread.title')}
            </h2>
            <p className="landing-body mt-4 text-pretty text-sm font-medium leading-relaxed text-foreground/80">
              {t('spread.body', { endAge: PREVIEW_PLAN.endAge })}
            </p>
          </div>

          <ul className="grid list-none grid-cols-1 gap-6 p-0 md:grid-cols-3">
            {SPREAD_ITEMS.map(({ key, value, accent }) => (
              <li
                key={key}
                className="theme-panel-card border-3 border-neo-black bg-neo-white shadow-neo transition-neo hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-neo-md"
              >
                <span className={cn('block h-2 w-full border-b-3 border-neo-black', accent)} />
                <div className="p-6">
                  <p className="landing-label text-[0.68rem] font-bold text-muted-foreground">
                    {t(`spread.items.${key}.label`)}
                  </p>
                  <p className="landing-display mt-2 font-heading text-4xl font-black tabular-nums text-neo-black">
                    {compactMoney(value)}
                  </p>
                  <p className="landing-body mt-3 text-[0.8rem] font-medium leading-relaxed text-foreground/75">
                    {t(`spread.items.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <p className="landing-body mt-6 text-center text-xs font-medium text-muted-foreground">
            {t('spread.footnote', {
              runs: runsLabel,
              successRate: successLabel,
              endAge: PREVIEW_PLAN.endAge,
            })}
          </p>
        </section>

        {/* ================= Features ================= */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:pb-28">
          <div className="mx-auto mb-12 flex max-w-2xl flex-col items-center text-center">
            <span className="inline-block border-3 border-neo-black bg-secondary landing-label px-3 py-1 text-[0.66rem] font-bold text-secondary-foreground shadow-neo-sm">
              {t('features.eyebrow')}
            </span>
            <h2 className="landing-display mt-5 text-balance font-heading text-2xl font-black text-neo-black sm:text-4xl">
              {t('features.title')}
            </h2>
            <p className="landing-body mt-4 text-pretty text-sm font-medium leading-relaxed text-foreground/80">
              {t('features.subtitle')}
            </p>
          </div>

          <ul className="grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ key, Icon, tile, rotate }) => (
              <li
                key={key}
                className="theme-panel-card group border-3 border-neo-black bg-neo-white p-6 shadow-neo transition-neo hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-neo-md"
              >
                <span
                  className={cn(
                    'flex h-12 w-12 items-center justify-center border-3 border-neo-black shadow-neo-sm transition-neo group-hover:rotate-0',
                    tile,
                    rotate
                  )}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="landing-label mt-5 text-sm font-extrabold text-neo-black">
                  {t(`features.items.${key}.title`)}
                </h3>
                <p className="landing-body mt-3 text-[0.8rem] font-medium leading-relaxed text-foreground/75">
                  {t(`features.items.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ================= How it works ================= */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:pb-32">
          <div className="mx-auto mb-12 flex max-w-2xl flex-col items-center text-center">
            <span className="inline-block border-3 border-neo-black bg-neo-green landing-label px-3 py-1 text-[0.66rem] font-bold text-gray-950 shadow-neo-sm">
              {t('how.eyebrow')}
            </span>
            <h2 className="landing-display mt-5 text-balance font-heading text-2xl font-black text-neo-black sm:text-4xl">
              {t('how.title')}
            </h2>
          </div>

          <ol className="grid list-none grid-cols-1 gap-6 p-0 md:grid-cols-3">
            {HOW_STEPS.map(({ key, accent }, index) => (
              <li
                key={key}
                className="theme-panel-card relative border-3 border-neo-black bg-neo-white shadow-neo transition-neo hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-neo-md"
              >
                <span className={cn('block h-2 w-full border-b-3 border-neo-black', accent)} />
                <div className="p-6">
                  <span className="flex h-11 w-11 items-center justify-center border-3 border-neo-black bg-neo-white font-heading text-base font-black text-neo-black shadow-neo-sm">
                    {index + 1}
                  </span>
                  <h3 className="landing-label mt-5 text-sm font-extrabold text-neo-black">
                    {t(`how.steps.${key}.title`)}
                  </h3>
                  <p className="landing-body mt-3 text-[0.8rem] font-medium leading-relaxed text-foreground/75">
                    {t(`how.steps.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ================= Final CTA ================= */}
        <section className="landing-cta border-y-3 border-neo-black">
          <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:py-24">
            <h2 className="landing-cta-title landing-display text-balance font-heading text-2xl font-black sm:text-4xl lg:text-5xl">
              {t('cta.title')}
            </h2>
            <p className="landing-cta-sub landing-body mt-4 text-sm font-semibold">
              {t('cta.subtitle')}
            </p>
            <Button
              size="lg"
              asChild
              className="landing-label mt-10 h-auto w-full max-w-[20rem] whitespace-normal py-3 leading-tight sm:min-w-[16rem]"
            >
              <Link href="/setup">
                {t('cta.button')}
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <Link
              href="/simulation"
              className="landing-cta-link landing-body mt-6 text-xs font-semibold underline decoration-2 underline-offset-4 transition-neo"
            >
              {t('cta.secondary')}
            </Link>
          </div>
        </section>
      </main>

      {/* ================= Footer ================= */}
      <footer className="relative z-10 bg-neo-white/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center border-3 border-neo-black bg-neo-yellow shadow-neo-xs">
              <Image src="/piggy.svg" alt="" width={20} height={20} />
            </span>
            <div>
              <p className="landing-label text-[0.72rem] font-black text-neo-black">
                {t('nav.appName')}
              </p>
              <p className="landing-body mt-1 text-[0.68rem] font-medium text-muted-foreground">
                {t('footer.tagline')}
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <Link
              href="/setup"
              className="landing-label text-[0.72rem] font-bold text-neo-black underline decoration-2 underline-offset-4 transition-neo hover:text-neo-blue"
            >
              {t('footer.setup')}
            </Link>
            <Link
              href="/simulation"
              className="landing-label text-[0.72rem] font-bold text-neo-black underline decoration-2 underline-offset-4 transition-neo hover:text-neo-blue"
            >
              {t('footer.simulation')}
            </Link>
          </nav>
        </div>
        <div className="border-t-2 border-neo-black/15">
          <p className="landing-body mx-auto max-w-6xl px-4 py-5 text-[0.66rem] font-medium text-muted-foreground sm:px-6">
            {t('footer.copyright', { year })}
          </p>
        </div>
      </footer>
    </div>
  )
}
