import { Suspense } from 'react'
import { ArrowRight } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { Link } from '@/navigation'
import { Button } from '@/components/ui/button'
import { ExamplePlanButton } from '@/components/plans/ExamplePlanButton'
import { AppearanceSwitch } from '@/components/navigation/AppearanceSwitch'
import { FanChartPreview } from './FanChartPreview'
import { LandingHeaderActions } from './LandingHeaderActions'
import {
  APP_DEFAULT_RUNS,
  PREVIEW_DEFAULT_RUNS_SUCCESS_RATE,
  PREVIEW_RUNS,
  PREVIEW_SUCCESS_RATE,
} from './preview-data'
import './landing.css'

/**
 * The landing page: one screen in the workspace's own visual language — the
 * same bar, type scale, colours and asset chart — so a stranger sees what the
 * app is before opening it. Returning visitors with a session never get here:
 * the proxy forwards them to the workspace (`src/proxy.ts`).
 */
export function LandingPage() {
  const t = useTranslations('landing')
  const format = useFormatter()
  const year = String(new Date().getFullYear())

  const runsLabel = format.number(PREVIEW_RUNS)
  const percentLabel = (rate: number) =>
    format.number(rate / 100, { style: 'percent', maximumFractionDigits: 1 })

  return (
    <div className="lp">
      <header id="navigation" className="lp-bar">
        <div className="lp-bar-inner">
          <Link href="/" className="lp-name">
            {t('nav.appName')}
          </Link>
          <div className="lp-actions">
            {/* `useSearchParams` inside needs a boundary for static rendering;
                the fallback is the bar without its buttons for one tick. */}
            <Suspense fallback={null}>
              <LandingHeaderActions />
            </Suspense>
          </div>
        </div>
      </header>

      <main id="main-content" className="lp-main">
        <div className="lp-hero">
          <div className="lp-copy">
            <p className="lp-eyebrow">{t('hero.badge')}</p>
            <h1 className="lp-title">
              {t('hero.titleLine1')} {t('hero.titleLine2', { runs: runsLabel })}
            </h1>
            <p className="lp-lede">{t('hero.lede')}</p>
            <p className="lp-text">{t('hero.subtitle')}</p>

            <div className="lp-ctas">
              <Button asChild className="lp-cta">
                <Link href="/setup">
                  {t('hero.ctaPrimary')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              {/* A stranger can poke a furnished plan before typing their own
                  salary into anything. */}
              <ExamplePlanButton variant="outline" />
            </div>

            <p className="lp-note">{t('hero.note')}</p>
          </div>

          <div className="lp-preview">
            <FanChartPreview />
            {/* After the chart in document order: it explains the chart. */}
            <p className="lp-caption">
              {t('hero.runsNote', {
                previewRuns: runsLabel,
                previewRate: percentLabel(PREVIEW_SUCCESS_RATE),
                defaultRuns: format.number(APP_DEFAULT_RUNS),
                defaultRate: percentLabel(PREVIEW_DEFAULT_RUNS_SUCCESS_RATE),
              })}
            </p>
          </div>
        </div>
      </main>

      <footer className="lp-foot">
        <div className="lp-foot-inner">
          <p className="lp-foot-text">{t('footer.copyright', { year })}</p>
          <nav className="lp-foot-links" aria-label={t('footer.label')}>
            <Link href="/setup">{t('footer.setup')}</Link>
            <Link href="/simulation">{t('footer.simulation')}</Link>
          </nav>
          <AppearanceSwitch />
        </div>
      </footer>
    </div>
  )
}
