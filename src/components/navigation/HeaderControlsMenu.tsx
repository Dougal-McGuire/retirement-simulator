'use client'

import { useState } from 'react'
import { Settings2, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { ThemeSwitcher } from '@/components/navigation/ThemeSwitcher'
import { cn } from '@/lib/utils'

interface HeaderControlsMenuProps {
  className?: string
}

/**
 * Compact overflow menu that keeps the language and theme controls reachable
 * on viewports too narrow to show them inline in the header.
 */
export function HeaderControlsMenu({ className }: HeaderControlsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useTranslations('headerControls')
  const tLocale = useTranslations('localeSwitcher')
  const tTheme = useTranslations('themeSwitcher')

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn('h-10 w-10 shrink-0', className)}
          aria-label={t('trigger')}
        >
          <Settings2 className="h-5 w-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="theme-panel-card w-full border-3 border-neo-black bg-neo-white p-0 shadow-neo sm:w-80"
      >
        <SheetHeader className="border-b-3 border-neo-black px-6 py-5">
          <SheetTitle className="flex items-center justify-between gap-3 text-base font-black tracking-[0.08em] text-neo-black">
            {t('title')}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="border-2 border-neo-black bg-neo-white p-1 text-neo-black transition-neo hover:-translate-y-[1px] hover:bg-neo-red hover:text-neo-white"
              aria-label={t('close')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </SheetTitle>
          <SheetDescription className="text-left text-sm font-medium text-muted-foreground">
            {t('description')}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-6 py-6">
          <div className="space-y-2">
            <h3 className="text-[0.68rem] font-bold tracking-[0.1em] text-muted-foreground">
              {tLocale('label')}
            </h3>
            <LocaleSwitcher className="w-full" size="default" />
          </div>
          <div className="space-y-2">
            <h3 className="text-[0.68rem] font-bold tracking-[0.1em] text-muted-foreground">
              {tTheme('label')}
            </h3>
            <ThemeSwitcher className="w-full" size="default" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
