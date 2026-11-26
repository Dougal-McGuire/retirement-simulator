'use client'

import { useTranslations } from 'next-intl'
import { AuthMenu } from '@/components/auth/AuthMenu'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { AppearanceSwitch } from '@/components/navigation/AppearanceSwitch'
import { GenerateReportButton } from '@/components/GenerateReportButton'
import { selectResultsStale } from '@/components/workspace/useRunStatus'
import { useUsableStoreResults } from '@/components/workspace/useUsableResults'
import { formatDeployTimestamp, getAppVersionInfo } from '@/lib/version'
import { useSimulationLoading, useSimulationStore } from '@/lib/stores/simulationStore'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/** First control that can actually do something — never the disabled sign-in. */
export const FOCUSABLE =
  'button:not([disabled]):not([aria-disabled="true"]), a[href], [role="combobox"]:not([disabled])'

/**
 * The report export as the Menü carries it on phones, where the bar has no
 * room for its own PDF button. Mounted only while the dialog is open, so the
 * bar does not subscribe to results twice.
 */
function MenuReport() {
  const results = useUsableStoreResults()
  const stale = useSimulationStore(selectResultsStale)
  const loading = useSimulationLoading()
  return (
    <div className="workspace-menu-report">
      <GenerateReportButton
        results={stale ? null : results}
        disabled={loading}
        size="sm"
        variant="outline"
      />
    </div>
  )
}

/**
 * The workspace "Menü": language, account and appearance. The nominal /
 * today's-€ switch and the PDF export have their own places in the bar; on
 * phones, where the bar keeps to the plan menu, the € switch and this
 * button, the PDF export is the first item here. Plan management lives in
 * the plan menu's "Manage plans …" dialog, the guided setup at the foot of
 * the control column.
 */
export function DashboardTools() {
  const t = useTranslations('simulationCompact.tools')
  const versionInfo = getAppVersionInfo()
  const deployedLabel = formatDeployTimestamp(versionInfo.deployedAt)
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="ds-btn ds-btn--outline ds-btn--sm min-h-11 shrink-0"
          data-testid="dashboard-tools"
        >
          {t('button')}
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        // Radix focuses the first tabbable element, which used to be the
        // disabled sign-in control (and opened its tooltip). Pick explicitly:
        // the first control that works receives focus.
        onOpenAutoFocus={(event) => {
          const root = event.currentTarget as HTMLElement
          const target = Array.from(
            root.querySelectorAll<HTMLElement>(`[data-tools-body] :is(${FOCUSABLE})`)
          ).find((node) => node.getClientRects().length > 0)
          if (!target) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3" data-tools-body>
          <MenuReport />
          <LocaleSwitcher />
          <AuthMenu />
        </div>
        {/* Colour scheme (System / Light / Dark); self-contained, see AppearanceSwitch. */}
        <AppearanceSwitch showLabel className="self-start" />
        <details className="workspace-shortcuts" data-testid="keyboard-shortcuts">
          <summary>{t('shortcuts.title')}</summary>
          <dl className="workspace-shortcuts-list">
            <div>
              <dt>
                <kbd className="workspace-kbd">Ctrl/⌘</kbd>
                {' + '}
                <kbd className="workspace-kbd">S</kbd>
              </dt>
              <dd>{t('shortcuts.save')}</dd>
            </div>
            <div>
              <dt>
                <kbd className="workspace-kbd">F2</kbd>
              </dt>
              <dd>{t('shortcuts.rename')}</dd>
            </div>
            <div>
              <dt>
                <kbd className="workspace-kbd">F6</kbd>
              </dt>
              <dd>{t('shortcuts.switchPane')}</dd>
            </div>
            <div>
              <dt>
                <kbd className="workspace-kbd">R</kbd>
              </dt>
              <dd>{t('shortcuts.recalculate')}</dd>
            </div>
            <div>
              <dt>
                <kbd className="workspace-kbd">Esc</kbd>
              </dt>
              <dd>{t('shortcuts.escape')}</dd>
            </div>
          </dl>
        </details>
        <p className="workspace-version-meta" data-testid="app-version-info">
          <span>
            {t('version.label')}{' '}
            <code className="workspace-version-code">{versionInfo.version}</code>
          </span>
          <span aria-hidden="true">·</span>
          <code
            className="workspace-version-code"
            data-testid="app-version-commit"
            title={versionInfo.commit || undefined}
          >
            {versionInfo.shortCommit || t('version.unknownCommit')}
          </code>
          {deployedLabel && (
            <>
              <span aria-hidden="true">·</span>
              <time
                dateTime={versionInfo.deployedAt}
                title={versionInfo.deployedAt}
                data-testid="app-version-date"
                suppressHydrationWarning
              >
                {t('version.deployed', { date: deployedLabel })}
              </time>
            </>
          )}
        </p>
      </DialogContent>
    </Dialog>
  )
}
