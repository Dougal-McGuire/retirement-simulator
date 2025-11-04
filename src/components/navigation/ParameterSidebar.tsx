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
              variant="secondary"
              size="sm"
              className="fixed bottom-5 left-5 z-40 h-12 min-w-[11rem] shadow-neo"
            >
              <Settings className="mr-2 h-4 w-4" />
              {t('trigger')}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-full border-3 border-neo-black bg-neo-white p-0 shadow-neo sm:w-96"
          >
            <SheetHeader className="border-b-3 border-neo-black bg-neo-white px-6 py-5">
              <SheetTitle className="flex items-center text-lg font-bold uppercase tracking-[0.18em] text-neo-black">
                <Settings className="mr-2 h-5 w-5" />
                {t('title')}
              </SheetTitle>
              <SheetDescription className="text-sm font-medium text-muted-foreground">
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
