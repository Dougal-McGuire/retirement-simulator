import { createNavigation } from 'next-intl/navigation'
import { localePrefix, locales } from '@/i18n/config'

export const { Link, redirect, useRouter, usePathname } =
  createNavigation({ locales, localePrefix })
