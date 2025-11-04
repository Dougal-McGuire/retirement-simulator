'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/navigation'
import { locales, type Locale } from '@/i18n/config'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface LocaleSwitcherProps {
  className?: string
}

export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const router = useRouter()
  const pathname = usePathname()
  const locale = useLocale() as Locale
  const t = useTranslations('localeSwitcher')
  const [isPending, startTransition] = useTransition()

  const handleChange = (nextLocale: string) => {
    if (nextLocale === locale) return

    startTransition(() => {
      router.replace(pathname, { locale: nextLocale as Locale })
    })
  }

  return (
    <Select value={locale} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger aria-label={t('label')} className={cn('w-48 justify-between', className)}>
        <SelectValue placeholder={t(`options.${locale}`)} />
      </SelectTrigger>
      <SelectContent>
        {locales.map((availableLocale) => (
          <SelectItem key={availableLocale} value={availableLocale}>
            {t(`options.${availableLocale}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

