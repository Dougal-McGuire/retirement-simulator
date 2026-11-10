'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  COLOR_SCHEME_CHANGE_EVENT,
  COLOR_SCHEME_PREFERENCES,
  COLOR_SCHEME_STORAGE_KEY,
  applyColorSchemePreference,
  readColorSchemePreference,
  writeColorSchemePreference,
  type ColorSchemePreference,
} from '@/lib/colorScheme'
import { SegmentedRadio } from '@/components/ui/segmented-radio'
import { cn } from '@/lib/utils'

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== COLOR_SCHEME_STORAGE_KEY) return
    // Another tab changed the preference: follow it here as well.
    applyColorSchemePreference(readColorSchemePreference())
    onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(COLOR_SCHEME_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(COLOR_SCHEME_CHANGE_EVENT, onChange)
  }
}

const getSnapshot = () => readColorSchemePreference()
// The server cannot know the stored choice; the pre-paint script has already
// applied it, and the control catches up right after hydration.
const getServerSnapshot = (): ColorSchemePreference => 'system'

export function useColorSchemePreference() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setPreference = useCallback((next: ColorSchemePreference) => {
    writeColorSchemePreference(next)
    applyColorSchemePreference(next)
    window.dispatchEvent(new Event(COLOR_SCHEME_CHANGE_EVENT))
  }, [])
  return [preference, setPreference] as const
}

interface AppearanceSwitchProps {
  className?: string
  /** Show the "Appearance" label above the control (menus); otherwise it is aria-only. */
  showLabel?: boolean
}

/**
 * Three-state colour-scheme control: System (default) / Light / Dark.
 * Self-contained so it can be mounted in any menu or footer.
 */
export function AppearanceSwitch({ className, showLabel = false }: AppearanceSwitchProps) {
  const t = useTranslations('appearance')
  const [preference, setPreference] = useColorSchemePreference()
  const group = (
    <SegmentedRadio
      options={COLOR_SCHEME_PREFERENCES.map((option) => {
        const Icon = ICONS[option]
        return {
          value: option,
          label: (
            <>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t(`options.${option}`)}
            </>
          ),
        }
      })}
      value={preference}
      onChange={setPreference}
      ariaLabel={t('label')}
      testId="appearance-switch"
      className={cn(
        'inline-flex shrink-0 overflow-hidden rounded-sm border border-border bg-card',
        !showLabel && className
      )}
      optionClassName={(checked) =>
        cn(
          'inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-r border-border px-3 text-sm transition-colors last:border-r-0',
          checked
            ? 'bg-muted font-semibold text-ink'
            : 'font-normal text-muted-foreground hover:bg-muted hover:text-ink'
        )
      }
    />
  )

  if (!showLabel) return group

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-muted-foreground" aria-hidden="true">
        {t('label')}
      </span>
      {group}
    </div>
  )
}
