'use client'

import { useCallback, useRef, useSyncExternalStore, type KeyboardEvent } from 'react'
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
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (!step) return
    event.preventDefault()
    const count = COLOR_SCHEME_PREFERENCES.length
    // Move from the focused radio (WAI-ARIA radio group), not the stored value.
    const focused = refs.current.findIndex((node) => node === document.activeElement)
    const index = focused >= 0 ? focused : COLOR_SCHEME_PREFERENCES.indexOf(preference)
    const next = (index + step + count) % count
    setPreference(COLOR_SCHEME_PREFERENCES[next])
    refs.current[next]?.focus()
  }

  const group = (
    <div
      role="radiogroup"
      aria-label={t('label')}
      data-testid="appearance-switch"
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex shrink-0 overflow-hidden rounded-sm border border-border bg-card',
        !showLabel && className
      )}
    >
      {COLOR_SCHEME_PREFERENCES.map((option, index) => {
        const Icon = ICONS[option]
        const checked = preference === option
        return (
          <button
            key={option}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-value={option}
            onClick={() => setPreference(option)}
            className={cn(
              'inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-r border-border px-3 text-sm transition-colors last:border-r-0',
              checked
                ? 'bg-muted font-semibold text-ink'
                : 'font-normal text-muted-foreground hover:bg-muted hover:text-ink'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t(`options.${option}`)}
          </button>
        )
      })}
    </div>
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
