import { ReactNode } from "react"
import { AppNavigationShell } from "@/components/app-shell/app-navigation-shell"
import { CompanyProvider } from "@/contexts/company-context"
import { SupportWidget } from "./support-widget"

interface AuthenticatedLayoutProps {
  children: ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return (
    <CompanyProvider>
      <div className="min-h-screen bg-background">
        <AppNavigationShell>{children}</AppNavigationShell>
        <SupportWidget />
      </div>
    </CompanyProvider>
  )
}
