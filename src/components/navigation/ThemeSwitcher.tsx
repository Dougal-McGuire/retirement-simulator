'use client'

import { useCallback, useEffect, useState } from 'react'
import { Palette } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  DEFAULT_THEME_ID,
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  isThemeId,
  type ThemeId,
} from '@/lib/themes'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface ThemeSwitcherProps {
  className?: string
  size?: 'sm' | 'default'
}

function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Keep the visual theme even when storage is unavailable.
  }
}

export function ThemeSwitcher({ className, size = 'sm' }: ThemeSwitcherProps) {
  const t = useTranslations('themeSwitcher')
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME_ID)

  useEffect(() => {
    let storedTheme: string | null = null

    try {
      storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    } catch {
      storedTheme = null
    }

    const nextTheme = isThemeId(storedTheme) ? storedTheme : DEFAULT_THEME_ID
    setTheme(nextTheme)
    applyTheme(nextTheme)
  }, [])

  const handleChange = useCallback((value: string) => {
    if (!isThemeId(value)) return

    setTheme(value)
    applyTheme(value)
  }, [])

  return (
    <Select value={theme} onValueChange={handleChange}>
      <SelectTrigger
        aria-label={t('label')}
        size={size}
        className={cn('w-56 justify-between', className)}
      >
        <SelectValue placeholder={t(`options.${theme}`)} />
      </SelectTrigger>
      <SelectContent>
        {THEME_OPTIONS.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <span className="flex min-w-0 items-center gap-2">
              <Palette className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span className="flex flex-shrink-0 items-center gap-1" aria-hidden="true">
                {option.swatches.map((swatch) => (
                  <span
                    key={`${option.id}-${swatch}`}
                    className="h-3 w-3 border border-neo-black"
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </span>
              <span className="truncate">{t(`options.${option.translationKey}`)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
