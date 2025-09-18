'use client'

import { useState } from 'react'
import { Settings, ChevronRight } from 'lucide-react'
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
import { ParameterControls } from '@/components/forms/ParameterControls'

interface ParameterSidebarProps {
  className?: string
}

export function ParameterSidebar({ className = '' }: ParameterSidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useTranslations('parameterSidebar')

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={`hidden lg:block lg:col-span-1 ${className}`}>
        <div className="sticky top-6">
          <div className="relative">
            <div className="pointer-events-none absolute inset-x-6 top-0 h-32 rounded-full bg-primary/15 blur-3xl" />
            <div className="max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 scrollbar-invisible">
              <ParameterControls />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sheet Trigger */}
      <div className="lg:hidden">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="fixed bottom-4 left-4 z-40 rounded-full border-white/70 bg-white/80 px-4 shadow-2xl backdrop-blur transition hover:border-primary/40 hover:bg-white"
            >
              <Settings className="h-4 w-4 mr-2" />
              {t('trigger')}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-full border-white/60 bg-white/80 p-0 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:w-96"
          >
            <SheetHeader className="border-b border-white/60 bg-white/50 p-6 pb-4">
              <SheetTitle className="flex items-center text-lg font-semibold text-slate-900">
                <Settings className="h-5 w-5 mr-2" />
                {t('title')}
              </SheetTitle>
              <SheetDescription className="text-sm text-slate-600">
                {t('description')}
              </SheetDescription>
            </SheetHeader>
            <div className="max-h-[calc(100vh-120px)] overflow-y-auto px-6 pb-6">
              <ParameterControls />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
