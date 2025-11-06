'use client'

import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'react-hot-toast'
import buildInfo from '@/lib/build-info/build-info.json'

export function VersionInfo() {
  const handleShowVersionInfo = () => {
    const { version, buildNumber, buildDate, git, packages } = buildInfo

    const date = new Date(buildDate).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const versionText = `Version: ${version}
Build: #${buildNumber}
Date: ${date}
${git.tag ? `Tag: ${git.tag}\n` : ''}Commit: ${git.commitShort}
Branch: ${git.branch}

Key Packages:
• Next.js ${packages.next}
• React ${packages.react}
• next-intl ${packages['next-intl']}
• TypeScript ${packages.typescript}
• Tailwind CSS ${packages.tailwindcss}`

    toast(versionText, {
      duration: 8000,
      style: {
        minWidth: '320px',
        maxWidth: '420px',
        fontFamily: 'monospace',
        fontSize: '0.8rem',
        lineHeight: '1.5',
        whiteSpace: 'pre-line',
      },
      icon: 'ℹ️',
    })
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleShowVersionInfo}
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      title="Version Information"
      aria-label="Show version information"
    >
      <Info className="h-4 w-4" />
    </Button>
  )
}
