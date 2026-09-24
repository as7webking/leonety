import { ReactNode } from "react"
import { AppNavigationShell } from "@/components/app-shell/app-navigation-shell"
import { CompanyProvider } from "@/contexts/company-context"
import { AiAssistantWidget } from "./ai-assistant-widget"
import { IncomingOrderAlert } from "./incoming-order-alert"
import { OfflineModeProvider } from '@/contexts/offline-mode-context'
import { OfflineStatusBar } from '@/components/offline-status-bar'

interface AuthenticatedLayoutProps {
  children: ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return (
    <CompanyProvider>
      <OfflineModeProvider>
        <div className="min-h-screen bg-background">
          <AppNavigationShell><OfflineStatusBar />{children}</AppNavigationShell>
          <IncomingOrderAlert />
          <AiAssistantWidget />
        </div>
      </OfflineModeProvider>
    </CompanyProvider>
  )
}
