import { redirect } from 'next/navigation'

interface LocaleHomePageProps {
  params: Promise<{ locale: string }>
}

export default async function LocaleHomePage({ params }: LocaleHomePageProps) {
  const { locale } = await params
  redirect(`/${locale}/simulation`)
}
