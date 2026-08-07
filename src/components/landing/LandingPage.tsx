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
import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import { Button } from '@/components/ui/button'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { ThemeSwitcher } from '@/components/navigation/ThemeSwitcher'
import { FanChartPreview } from './FanChartPreview'
import { cn } from '@/lib/utils'

const STAT_KEYS = ['scenarios', 'percentiles', 'speed', 'privacy'] as const

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

export function LandingPage() {
  const t = useTranslations('landing')
  const year = String(new Date().getFullYear())

  return (
    <div className="app-page relative min-h-screen">
      {/* ================= Header ================= */}
      <header id="navigation" className="relative z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center border-3 border-neo-black bg-neo-yellow shadow-neo-sm transition-neo group-hover:-translate-x-[1px] group-hover:-translate-y-[1px] group-hover:shadow-neo">
              <Image src="/piggy.svg" alt="" width={26} height={26} priority />
            </span>
            <span className="font-heading text-[0.8rem] font-black uppercase tracking-[0.18em] text-neo-black sm:text-sm">
              {t('nav.appName')}
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <LocaleSwitcher className="hidden w-36 lg:flex" />
            <ThemeSwitcher className="hidden w-44 xl:flex" />
            <Button size="sm" asChild>
              <Link href="/setup">
                {t('nav.launch')}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content" className="relative z-10">
        {/* ================= Hero ================= */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16 lg:pb-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <span className="neo-chip animate-fade-in">
              <span
                className="h-2 w-2 animate-pulse-soft rounded-full bg-neo-black"
                aria-hidden="true"
              />
              {t('hero.badge')}
            </span>

            <h1 className="animate-fade-in mt-8 text-balance font-heading text-4xl font-black leading-[1.08] text-neo-black sm:text-5xl lg:text-6xl">
              {t('hero.titleLine1')}
              <br />
              <span className="mt-3 inline-block rotate-[-1deg] border-3 border-neo-black bg-secondary px-4 py-1 text-secondary-foreground shadow-neo transition-neo hover:rotate-0">
                {t('hero.titleLine2')}
              </span>
            </h1>

            <p className="animate-fade-in-delayed mx-auto mt-8 max-w-2xl text-pretty text-sm font-medium leading-relaxed text-foreground/80 sm:text-base">
              {t('hero.subtitle')}
            </p>

            <div className="animate-fade-in-delayed mt-10 flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row">
              <Button size="lg" asChild className="w-full sm:w-auto sm:min-w-[16rem]">
                <Link href="/setup">
                  {t('hero.ctaPrimary')}
                  <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild className="w-full sm:w-auto">
                <Link href="/simulation">{t('hero.ctaSecondary')}</Link>
              </Button>
            </div>

            <p className="animate-fade-in-more-delayed mt-6 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('hero.note')}
            </p>
          </div>

          {/* Stats strip */}
          <div className="animate-fade-in-more-delayed mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
            {STAT_KEYS.map((key) => (
              <div
                key={key}
                className="theme-panel-card border-3 border-neo-black bg-neo-white p-5 shadow-neo transition-neo hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-neo-md"
              >
                <p className="font-heading text-2xl font-black tracking-tight text-neo-black sm:text-3xl">
                  {t(`stats.${key}.value`)}
                </p>
                <p className="mt-2 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t(`stats.${key}.label`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ================= Chart preview ================= */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:pb-28">
          <div className="mx-auto mb-12 flex max-w-2xl flex-col items-center text-center">
            <span className="inline-block border-3 border-neo-black bg-primary px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.24em] text-primary-foreground shadow-neo-sm">
              {t('preview.eyebrow')}
            </span>
            <h2 className="mt-6 text-balance font-heading text-3xl font-black text-neo-black sm:text-4xl">
              {t('preview.title')}
            </h2>
            <p className="mt-4 text-pretty text-sm font-medium leading-relaxed text-foreground/75">
              {t('preview.subtitle')}
            </p>
          </div>

          <div className="mx-auto max-w-4xl lg:px-6">
            <FanChartPreview />
          </div>
        </section>

        {/* ================= Features ================= */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:pb-28">
          <div className="mx-auto mb-12 flex max-w-2xl flex-col items-center text-center">
            <span className="inline-block border-3 border-neo-black bg-secondary px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.24em] text-secondary-foreground shadow-neo-sm">
              {t('features.eyebrow')}
            </span>
            <h2 className="mt-6 text-balance font-heading text-3xl font-black text-neo-black sm:text-4xl">
              {t('features.title')}
            </h2>
            <p className="mt-4 text-pretty text-sm font-medium leading-relaxed text-foreground/75">
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
                <h3 className="mt-5 text-sm font-extrabold uppercase tracking-[0.14em] text-neo-black">
                  {t(`features.items.${key}.title`)}
                </h3>
                <p className="mt-3 text-[0.78rem] font-medium leading-relaxed text-foreground/75">
                  {t(`features.items.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ================= How it works ================= */}
        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:pb-32">
          <div className="mx-auto mb-12 flex max-w-2xl flex-col items-center text-center">
            <span className="inline-block border-3 border-neo-black bg-neo-green px-3 py-1 text-[0.62rem] font-bold uppercase tracking-[0.24em] text-gray-950 shadow-neo-sm">
              {t('how.eyebrow')}
            </span>
            <h2 className="mt-6 text-balance font-heading text-3xl font-black text-neo-black sm:text-4xl">
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
                  <h3 className="mt-5 text-sm font-extrabold uppercase tracking-[0.14em] text-neo-black">
                    {t(`how.steps.${key}.title`)}
                  </h3>
                  <p className="mt-3 text-[0.78rem] font-medium leading-relaxed text-foreground/75">
                    {t(`how.steps.${key}.body`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ================= Final CTA ================= */}
        <section className="border-y-3 border-neo-black bg-neo-black">
          <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:py-24">
            <h2 className="text-balance font-heading text-3xl font-black text-neo-white sm:text-4xl lg:text-5xl">
              {t('cta.title')}
            </h2>
            <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-neo-white/70">
              {t('cta.subtitle')}
            </p>
            <Button size="lg" asChild className="mt-10 min-w-[16rem]">
              <Link href="/setup">
                {t('cta.button')}
                <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
            <Link
              href="/simulation"
              className="mt-6 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-neo-white/70 underline decoration-2 underline-offset-4 transition-neo hover:text-neo-white"
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
              <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-neo-black">
                {t('nav.appName')}
              </p>
              <p className="mt-1 text-[0.6rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {t('footer.tagline')}
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <Link
              href="/setup"
              className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-neo-black underline decoration-2 underline-offset-4 transition-neo hover:text-neo-blue"
            >
              {t('footer.setup')}
            </Link>
            <Link
              href="/simulation"
              className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-neo-black underline decoration-2 underline-offset-4 transition-neo hover:text-neo-blue"
            >
              {t('footer.simulation')}
            </Link>
          </nav>
        </div>
        <div className="border-t-2 border-neo-black/15">
          <p className="mx-auto max-w-6xl px-4 py-5 text-[0.58rem] font-medium uppercase tracking-[0.14em] text-muted-foreground sm:px-6">
            {t('footer.copyright', { year })}
          </p>
        </div>
      </footer>
    </div>
  )
}
