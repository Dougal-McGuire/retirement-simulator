'use client'

import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useLocale, useTranslations } from 'next-intl'
import { AuthMenu } from '@/components/auth/AuthMenu'
import { useAuthEnabled } from '@/components/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { HeaderControlsMenu } from '@/components/navigation/HeaderControlsMenu'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { Link, useRouter } from '@/navigation'

/** Where a sign-in started on the landing page ends up. */
const DASHBOARD_PATH = '/simulation'

/**
 * Query flag that keeps a signed-in visitor on the landing page. Without it
 * an authenticated session is forwarded straight to the dashboard — the
 * marketing page has nothing new to tell someone who already has a plan.
 */
export const STAY_ON_LANDING_PARAM = 'stay'

function useStayOnLanding(): boolean {
  const searchParams = useSearchParams()
  return searchParams.has(STAY_ON_LANDING_PARAM)
}

/**
 * Forwards an already-signed-in visitor from the landing page to their
 * dashboard. The Auth.js session cookie outlives the tab, so for a returning
 * user this is the "auto-login": open the site, land on the plan.
 *
 * Mounted only when auth is configured (see `LandingHeaderActions`), so it
 * never calls `useSession()` without a provider.
 */
function ReturningUserForward() {
  const { status } = useSession()
  const stay = useStayOnLanding()
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('landing.nav')
  const [forwarding, setForwarding] = useState(false)

  useEffect(() => {
    if (stay || status !== 'authenticated') return
    setForwarding(true)
    router.replace(DASHBOARD_PATH, { locale })
  }, [stay, status, router, locale])

  if (!forwarding) return null

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="landing-forwarding"
      className="fixed inset-x-0 top-0 z-[60] flex h-1 overflow-hidden bg-ink/10"
    >
      <span className="block h-full w-1/3 animate-route-progress bg-accent" />
      <span className="sr-only">{t('forwarding')}</span>
    </div>
  )
}

/** The header's primary button: "Launch app" for strangers, "Dashboard" for accounts. */
function PrimaryCta({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations('landing.nav')

  if (signedIn) {
    return (
      <Button size="sm" asChild className="landing-label shrink-0" data-testid="landing-cta-dashboard">
        <Link href={DASHBOARD_PATH}>
          <span className="sm:hidden">{t('dashboardShort')}</span>
          <span className="hidden sm:inline">{t('dashboard')}</span>
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    )
  }

  return (
    <Button size="sm" asChild className="landing-label shrink-0" data-testid="landing-cta-launch">
      <Link href="/setup">
        <span className="sm:hidden">{t('launchShort')}</span>
        <span className="hidden sm:inline">{t('launch')}</span>
        <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
      </Link>
    </Button>
  )
}

function SessionAwareActions() {
  const { status } = useSession()
  const signedIn = status === 'authenticated'

  return (
    <>
      <ReturningUserForward />
      <AuthMenu
        className="hidden max-w-[18rem] lg:flex"
        signInRedirectTo={DASHBOARD_PATH}
        hideWhenUnavailable
      />
      <LocaleSwitcher className="hidden w-auto px-3  lg:flex" />
      <HeaderControlsMenu className="lg:hidden" signInRedirectTo={DASHBOARD_PATH} />
      <PrimaryCta signedIn={signedIn} />
    </>
  )
}

/**
 * Right-hand side of the landing header. With OAuth configured it carries the
 * sign-in control (sending the user straight to the dashboard afterwards) and
 * forwards sessions that already exist; without it, the landing page stays
 * the account-free page it always was.
 */
export function LandingHeaderActions() {
  const enabled = useAuthEnabled()

  if (!enabled) {
    return (
      <>
        <LocaleSwitcher className="hidden w-auto px-3  lg:flex" />
        <HeaderControlsMenu className="lg:hidden" />
        <PrimaryCta signedIn={false} />
      </>
    )
  }

  return <SessionAwareActions />
}
