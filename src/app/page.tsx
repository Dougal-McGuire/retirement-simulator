import { redirect } from 'next/navigation'
import { defaultLocale } from '@/i18n/config'

export default function Home() {
  // No marketing landing page — send users to the core flow
  redirect(`/${defaultLocale}/simulation`)
}
