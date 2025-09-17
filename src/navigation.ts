import { createSharedPathnamesNavigation } from 'next-intl/navigation'
import { localePrefix, locales } from '@/i18n/config'

export const { Link, redirect, useRouter, usePathname, getPathname } =
  createSharedPathnamesNavigation({ locales, localePrefix })
