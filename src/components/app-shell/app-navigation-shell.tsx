import type { ReactNode } from 'react'
import { AppSidebar } from '@/components/app-shell/app-sidebar'
import { MobileDrawerClient } from '@/components/app-shell/mobile-drawer-client'

export function AppNavigationShell({ children }: { children: ReactNode }) {
  return (
    <div data-app-shell className="min-h-screen w-full min-w-0 max-w-full overflow-x-clip bg-slate-50">
      <AppSidebar />
      <MobileDrawerClient />
      <main className="w-full min-w-0 max-w-full pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))] xl:pb-0 xl:pl-64 xl:pt-0">
        {children}
      </main>
    </div>
  )
}
