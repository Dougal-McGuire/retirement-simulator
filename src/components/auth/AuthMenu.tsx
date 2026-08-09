'use client'

import { useCallback, useState } from 'react'
import { LogOut, User as UserIcon } from 'lucide-react'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAuthEnabled } from './AuthProvider'

interface AuthMenuProps {
  className?: string
  /** Icon-only rendering for tight mobile toolbars. */
  compact?: boolean
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  )
}

// "Sign in with Google" / "Mit Google anmelden" are long strings for an
// uppercase, wide-tracked button. Tightening tracking and padding keeps them on
// one line inside the 12rem action strips instead of ellipsising.
const SIGN_IN_BUTTON_CLASS = 'w-full justify-center gap-2 px-3 text-[0.6rem] tracking-[0.06em]'

/** Rendered when the deployment has no Google OAuth credentials. */
function AuthUnavailable({ className, compact }: AuthMenuProps) {
  const t = useTranslations('auth')
  const label = t('notConfigured')

  // On a 390px toolbar a permanently disabled icon button says nothing and
  // costs 52px that the report button and the menu trigger both need — it was
  // what pushed the menu trigger past the header's right edge. The desktop
  // strip still shows the labelled disabled state, where it has room to
  // explain itself.
  if (compact) return null

  return (
    <Tooltip>
      {/* Disabled buttons swallow pointer events, so the span carries the trigger. */}
      <TooltipTrigger asChild>
        <span className={cn('inline-flex', compact ? '' : className)} tabIndex={0}>
          <Button
            type="button"
            variant="outline"
            size={compact ? 'icon' : 'sm'}
            disabled
            aria-label={label}
            className={cn(compact ? 'h-10 w-10' : SIGN_IN_BUTTON_CLASS)}
          >
            <GoogleIcon className="h-4 w-4 shrink-0 opacity-60" />
            {!compact && <span className="truncate">{t('signIn')}</span>}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Rendered when credentials exist — real sign-in / signed-in state. */
function AuthSession({ className, compact }: AuthMenuProps) {
  const t = useTranslations('auth')
  const { data: session, status } = useSession()
  const [isPending, setIsPending] = useState(false)

  const currentPath = () => {
    if (typeof window === 'undefined') return '/'
    return `${window.location.pathname}${window.location.search}`
  }

  const handleSignIn = useCallback(() => {
    setIsPending(true)
    // Relative target only; the server-side `redirect` callback re-anchors it
    // to this origin, so no external callback URL can be injected.
    void signIn('google', { redirectTo: currentPath() }).finally(() => setIsPending(false))
  }, [])

  const handleSignOut = useCallback(() => {
    setIsPending(true)
    void signOut({ redirectTo: currentPath() }).finally(() => setIsPending(false))
  }, [])

  if (status === 'loading') {
    return (
      <div
        className={cn(
          'inline-flex animate-pulse items-center border-3 border-neo-black bg-muted',
          compact ? 'h-10 w-10' : 'h-10 w-full',
          className
        )}
        aria-label={t('loading')}
        role="status"
      />
    )
  }

  if (status !== 'authenticated' || !session?.user) {
    const label = t('signIn')
    return (
      // The landing page promises "no sign-up, no cloud" — the tooltip spells
      // out that signing in still keeps every plan on this device.
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={compact ? 'icon' : 'sm'}
            onClick={handleSignIn}
            disabled={isPending}
            aria-label={compact ? label : undefined}
            title={t('localOnly')}
            className={cn(compact ? 'h-10 w-10' : SIGN_IN_BUTTON_CLASS, className)}
          >
            <GoogleIcon className="h-4 w-4 shrink-0" />
            {!compact && <span className="truncate">{label}</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[16rem]">
          {compact ? `${label} — ${t('localOnly')}` : t('localOnly')}
        </TooltipContent>
      </Tooltip>
    )
  }

  const displayName = session.user.name ?? session.user.email ?? t('accountFallbackName')
  const avatarUrl = session.user.image ?? null

  const avatar = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- tiny remote avatar; avoids an image-host allowlist in next.config
    <img
      src={avatarUrl}
      alt=""
      width={28}
      height={28}
      referrerPolicy="no-referrer"
      className="h-7 w-7 shrink-0 border-2 border-neo-black object-cover"
    />
  ) : (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-neo-black bg-neo-yellow">
      <UserIcon className="h-4 w-4 text-neo-black" aria-hidden="true" />
    </span>
  )

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleSignOut}
            disabled={isPending}
            aria-label={t('signOutFrom', { name: displayName })}
            className={cn('h-10 w-10 p-0', className)}
          >
            {avatar}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('signOutFrom', { name: displayName })}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 border-3 border-neo-black bg-neo-white px-2 py-1.5 shadow-neo-sm',
        className
      )}
    >
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[0.7rem] font-bold text-neo-black" title={displayName}>
          {displayName}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="truncate text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground"
              title={t('localOnly')}
            >
              {t('signedIn')}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[16rem]">
            {t('localOnly')}
          </TooltipContent>
        </Tooltip>
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            disabled={isPending}
            aria-label={t('signOut')}
            className="h-8 w-8 shrink-0 p-0"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('signOut')}</TooltipContent>
      </Tooltip>
    </div>
  )
}

/**
 * Self-contained Google auth control: sign-in button, signed-in identity with
 * sign-out, or a disabled state when the deployment has no OAuth credentials.
 *
 * Safe to mount anywhere beneath `AuthProvider` (simulation header, setup
 * header, and — later — the landing header).
 */
export function AuthMenu({ className, compact = false }: AuthMenuProps) {
  const enabled = useAuthEnabled()

  if (!enabled) {
    return <AuthUnavailable className={className} compact={compact} />
  }

  return <AuthSession className={className} compact={compact} />
}
