'use client'

import { useState } from 'react'
import { Settings, X, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ParameterControls } from '@/components/forms/ParameterControls'

interface ParameterSidebarProps {
  className?: string
}

export function ParameterSidebar({ className = "" }: ParameterSidebarProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:block lg:col-span-1">
        <div className="sticky top-8">
          <ParameterControls />
        </div>
      </div>

      {/* Mobile Sheet Trigger */}
      <div className="lg:hidden">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="fixed bottom-4 left-4 z-40 shadow-lg bg-white hover:bg-gray-50 border-2 border-gray-200"
            >
              <Settings className="h-4 w-4 mr-2" />
              Parameters
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-full sm:w-96 p-0">
            <SheetHeader className="p-6 pb-4">
              <SheetTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Simulation Parameters
              </SheetTitle>
              <SheetDescription>
                Adjust your retirement planning parameters and see results update in real-time.
              </SheetDescription>
            </SheetHeader>
            <div className="px-6 pb-6 overflow-y-auto max-h-[calc(100vh-120px)]">
              <ParameterControls />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}