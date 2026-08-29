import type { Metadata } from 'next'
import './globals.css'
import './design-system.css'

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
  // One design language, one light theme: the design system ships on system
  // font stacks (no webfonts) and needs no data-theme attribute or init
  // script — the former multi-theme machinery is gone.
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  )
}
