'use client'

import { useState } from 'react'
import { Menu, X, FileText, Settings as SettingsIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/navigation'
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
import { GenerateReportButton } from '@/components/GenerateReportButton'
import type { SimulationParams, SimulationResults } from '@/types'

interface MobileMenuProps {
  results: SimulationResults | null
  params: SimulationParams
  isLoading?: boolean
  showReportButton?: boolean
  showSetupLink?: boolean
}

export function MobileMenu({
  results,
  params,
  isLoading = false,
  showReportButton = false,
  showSetupLink = false,
}: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useTranslations('mobileMenu')

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="rounded-sm h-11 w-11 border border-border bg-white shadow-sm hover:-translate-y-[1px] hover:bg-amber/15"
          aria-label={t('trigger')}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="rounded-sm w-full border border-border bg-white p-0 shadow-sm sm:w-96"
      >
        <SheetHeader className="border-b border-border bg-white px-6 py-5">
          <SheetTitle className="flex items-center justify-between text-lg font-bold   text-ink">
            <span className="flex items-center">
              <Menu className="mr-2 h-5 w-5" />
              {t('title')}
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded border-2 border-border bg-white p-1 transition-colors hover:-translate-y-[1px] hover:bg-danger hover:text-white"
              aria-label={t('close')}
            >
              <X className="h-4 w-4" />
            </button>
          </SheetTitle>
          <SheetDescription className="sr-only">{t('description')}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-6 py-6">
          {/* Locale Switcher */}
          <div className="space-y-2">
            <h4 className="text-[0.68rem] font-semibold   text-muted-foreground">
              {t('sections.language')}
            </h4>
            <LocaleSwitcher className="w-full" />
          </div>

          {/* Primary Actions */}
          <div className="space-y-3 border-t border-border pt-4">
            <h4 className="text-[0.68rem] font-semibold   text-muted-foreground">
              {t('sections.actions')}
            </h4>

            {showReportButton && (
              <GenerateReportButton
                results={results}
                params={params}
                disabled={isLoading}
                variant="default"
                size="lg"
                wrapperClassName="w-full"
                buttonClassName="w-full justify-start"
              >
                <FileText className="mr-2 h-5 w-5" />
                <span className="flex-1 text-left">{t('actions.generateReport')}</span>
              </GenerateReportButton>
            )}

            {showSetupLink && (
              <Button variant="secondary" size="lg" asChild className="w-full justify-start">
                <Link href="/setup" onClick={() => setIsOpen(false)}>
                  <SettingsIcon className="mr-2 h-5 w-5" />
                  <span className="flex-1 text-left">{t('actions.goToSetup')}</span>
                </Link>
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
