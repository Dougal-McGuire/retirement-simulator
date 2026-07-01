'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { usePathname, useRouter } from '@/navigation'
import { defaultLocale, isLocale, locales } from '@/i18n/config'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface LocaleSwitcherProps {
  className?: string
  size?: 'sm' | 'default'
}

export function LocaleSwitcher({ className, size = 'sm' }: LocaleSwitcherProps) {
  const router = useRouter()
  const pathname = usePathname()
  const currentLocale = useLocale()
  const locale = isLocale(currentLocale) ? currentLocale : defaultLocale
  const t = useTranslations('localeSwitcher')
  const [isPending, startTransition] = useTransition()

  const handleChange = (nextLocale: string) => {
    if (!isLocale(nextLocale) || nextLocale === locale) return

    startTransition(() => {
      router.replace(pathname, { locale: nextLocale })
    })
  }

  return (
    <Select value={locale} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger aria-label={t('label')} size={size} className={cn('w-48 justify-between', className)}>
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
