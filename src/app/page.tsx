import { redirect } from 'next/navigation'

export default function Home() {
  // No marketing landing page — send users to the core flow
  redirect('/simulation')
}
