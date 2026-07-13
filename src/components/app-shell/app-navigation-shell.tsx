import type { ReactNode } from 'react'
import { AppSidebar } from '@/components/app-shell/app-sidebar'
import { MobileDrawerClient } from '@/components/app-shell/mobile-drawer-client'

export function AppNavigationShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <AppSidebar />
      <MobileDrawerClient />
      <main className="min-w-0 pt-16 md:pl-64 md:pt-0">
        {children}
      </main>
    </div>
  )
}
