import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Sora } from 'next/font/google'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta',
  subsets: ['latin'],
  display: 'swap',
})

const sora = Sora({
  variable: '--font-sora',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Retirement Simulator',
  description:
    'Monte Carlo retirement planning simulator with comprehensive financial analysis and professional PDF reports',
  icons: {
    icon: '/piggy.svg',
    shortcut: '/piggy.svg',
    apple: '/piggy.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${jakarta.variable} ${sora.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}
