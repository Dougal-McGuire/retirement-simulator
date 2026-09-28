'use client'

import { useTranslations } from 'next-intl'
import { AuthMenu } from '@/components/auth/AuthMenu'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { AppearanceSwitch } from '@/components/navigation/AppearanceSwitch'
import { FOCUSABLE } from '@/components/simulation-compact/DashboardTools'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * Small pieces of the workspace chrome that other routes reuse, so the setup
 * wizard reads as part of the same app instead of carrying a header of its
 * own. The workspace's own chrome (plan picker, save, run) is the
 * `ResultBar`; only the brand mark and the account/language menu are shared
 * here.
 */
export function WorkspaceBrand() {
  const t = useTranslations('workspace')
  return <div className="workspace-brand">{t('brand')}</div>
}

/**
 * The toolbar's "Menu" button for pages without plan tools: account, language
 * and appearance in the same place, behind the same label, as on the workspace.
 */
export function WorkspaceAccountMenu({ testId = 'workspace-account-menu' }: { testId?: string }) {
  const tools = useTranslations('simulationCompact.tools')
  const t = useTranslations('setup.shell')
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="workspace-button" data-testid={testId}>
          {tools('button')}
        </button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-md"
        // Same rule as the workspace Menu (DashboardTools): Radix would focus
        // the first tabbable element, which without OAuth is the disabled
        // sign-in control. Land on the first control that works instead.
        onOpenAutoFocus={(event) => {
          const root = event.currentTarget as HTMLElement
          const target = root.querySelector<HTMLElement>(`[data-menu-body] :is(${FOCUSABLE})`)
          if (!target) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('menuTitle')}</DialogTitle>
          <DialogDescription>{t('menuDescription')}</DialogDescription>
        </DialogHeader>
        {/* Usable controls first: language, then the account control (which
            is a disabled placeholder while sign-in is not configured). */}
        <div className="flex flex-wrap items-center gap-3" data-menu-body>
          <LocaleSwitcher />
          <AuthMenu />
        </div>
        <AppearanceSwitch showLabel className="self-start" />
      </DialogContent>
    </Dialog>
  )
}
