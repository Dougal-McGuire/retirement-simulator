import { redirect } from 'next/navigation'
import { defaultLocale } from '@/i18n/config'

export default function Home() {
  // Default first-run experience: guide users through setup before the dashboard
  redirect(`/${defaultLocale}/setup`)
}
