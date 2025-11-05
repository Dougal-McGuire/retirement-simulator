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
            {/* Scroll indicator - top shadow */}
            <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 h-8 bg-gradient-to-b from-background to-transparent opacity-0 transition-opacity duration-200" id="scroll-indicator-top" />

            <div
              className="max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neo-black/20 hover:scrollbar-thumb-neo-black/40"
              onScroll={(e) => {
                const target = e.currentTarget
                const top = document.getElementById('scroll-indicator-top')
                const bottom = document.getElementById('scroll-indicator-bottom')

                if (top && bottom) {
                  // Show top indicator when scrolled down
                  if (target.scrollTop > 20) {
                    top.style.opacity = '1'
                  } else {
                    top.style.opacity = '0'
                  }

                  // Show bottom indicator when not at bottom
                  const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 20
                  if (isAtBottom) {
                    bottom.style.opacity = '0'
                  } else {
                    bottom.style.opacity = '1'
                  }
                }
              }}
            >
              <ParameterControls />
            </div>

            {/* Scroll indicator - bottom shadow */}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-8 bg-gradient-to-t from-background to-transparent opacity-100 transition-opacity duration-200" id="scroll-indicator-bottom" />
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
