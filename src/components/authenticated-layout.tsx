import { ReactNode } from "react"
import { CompanyProvider } from "@/contexts/company-context"
import { Nav } from "./nav"

interface AuthenticatedLayoutProps {
  children: ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return (
    <CompanyProvider>
      <div className="min-h-screen bg-background">
        <Nav />
        <main className="flex-1">{children}</main>
      </div>
    </CompanyProvider>
  )
}
