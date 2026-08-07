import { redirect } from 'next/navigation'
import { defaultLocale } from '@/i18n/config'

export default function Home() {
  // Land visitors on the localized marketing page first
  redirect(`/${defaultLocale}`)
}
