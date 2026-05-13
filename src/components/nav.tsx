'use client'

import Link from "next/link"
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useCompany } from '@/contexts/company-context'
import { useAccountAccess } from '@/hooks/use-account-access'
import { canCreateWorkspace } from '@/lib/account-access'
import { AppSearch } from '@/components/app-search'
import { Button } from '@/components/ui/button'
import { Menu, X, User } from 'lucide-react'

const WORKSPACE_ACTION_VALUE = '__workspace_action__'

export function Nav() {
  const [isOpen, setIsOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [supabase] = useState(() => createClient())
  const router = useRouter()
  const { companies, currentCompanyId, loading, setCurrentCompanyId } = useCompany()
  const { accountAccess } = useAccountAccess(accountEmail)
  const canAddWorkspace = canCreateWorkspace(companies.length, accountAccess)
  const workspaceActionHref = canAddWorkspace ? '/workspaces' : '/upgrade'
  const workspaceActionLabel = canAddWorkspace ? 'Add Workspace' : 'Switch to Pro'

  useEffect(() => {
    let mounted = true

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (mounted) {
        setIsAuthenticated(!!data.session)
        setAccountEmail(data.session?.user?.email ?? null)
      }
    }

    loadSession()

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setIsAuthenticated(!!session)
        setAccountEmail(session?.user?.email ?? null)
      }
    })

    return () => {
      mounted = false
      data?.subscription?.unsubscribe()
    }
  }, [supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    setIsOpen(false)
  }

  const handleCompanyChange = (value: string) => {
    if (value === WORKSPACE_ACTION_VALUE) {
      router.push(workspaceActionHref)
      setIsOpen(false)
      return
    }

    if (value) {
      setCurrentCompanyId(value)
    }
  }

  return (
    <nav className="bg-card border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-xl font-bold" onClick={() => setIsOpen(false)}>Leonety</Link>
          
          {/* Desktop menu */}
          <div className="hidden flex-1 items-center justify-between gap-3 lg:flex">
            <div className="flex items-center gap-1 rounded-md bg-slate-50 p-1">
              <Link href="/dashboard" className="rounded px-2.5 py-1.5 text-sm text-slate-700 hover:bg-white hover:text-slate-950">Dashboard</Link>
              <Link href="/income" className="rounded px-2.5 py-1.5 text-sm text-slate-700 hover:bg-white hover:text-slate-950">Income</Link>
              <Link href="/expenses" className="rounded px-2.5 py-1.5 text-sm text-slate-700 hover:bg-white hover:text-slate-950">Expenses</Link>
              <Link href="/time" className="rounded px-2.5 py-1.5 text-sm text-slate-700 hover:bg-white hover:text-slate-950">Time</Link>
              <Link href="/workspaces" className="rounded px-2.5 py-1.5 text-sm text-slate-700 hover:bg-white hover:text-slate-950">Workspaces</Link>
            </div>
            <div className="flex items-center justify-end gap-3">
              <AppSearch />
              <div className="min-w-[220px]">
                <label htmlFor="company-selector" className="sr-only">Current company</label>
                <select
                  id="company-selector"
                  value={currentCompanyId ?? ''}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {companies.length === 0 && <option value="">No workspace selected</option>}
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name} ({company.type})
                    </option>
                  ))}
                  <option value={WORKSPACE_ACTION_VALUE}>{workspaceActionLabel}</option>
                </select>
              </div>
              {isAuthenticated && (
                <Link href="/profile" className="flex items-center gap-1 rounded px-2.5 py-1.5 text-sm text-slate-700 hover:bg-white hover:text-slate-950">
                  <User className="h-4 w-4" />
                  Profile
                </Link>
              )}
              {isAuthenticated ? (
                <Button onClick={handleLogout} variant="outline" size="sm">Logout</Button>
              ) : (
                <Link href="/login">
                  <Button variant="outline" size="sm">Login</Button>
                </Link>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            className="lg:hidden"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu */}
        {isOpen && (
          <div className="mt-4 border-t pt-4 pb-4 lg:hidden">
            <div className="flex flex-col space-y-3">
              <AppSearch />
              <select
                value={currentCompanyId ?? ''}
                onChange={(e) => handleCompanyChange(e.target.value)}
                disabled={loading}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {companies.length === 0 && <option value="">No workspace selected</option>}
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name} ({company.type})
                  </option>
                ))}
                <option value={WORKSPACE_ACTION_VALUE}>{workspaceActionLabel}</option>
              </select>
              <Link href="/dashboard" className="hover:underline" onClick={() => setIsOpen(false)}>Dashboard</Link>
              <Link href="/income" className="hover:underline" onClick={() => setIsOpen(false)}>Income</Link>
              <Link href="/expenses" className="hover:underline" onClick={() => setIsOpen(false)}>Expenses</Link>
              <Link href="/time" className="hover:underline" onClick={() => setIsOpen(false)}>Time</Link>
              <Link href="/workspaces" className="hover:underline" onClick={() => setIsOpen(false)}>Workspaces</Link>
              {isAuthenticated && (
                <Link href="/profile" className="hover:underline flex items-center gap-1" onClick={() => setIsOpen(false)}>
                  <User className="h-4 w-4" />
                  Profile
                </Link>
              )}
              {isAuthenticated ? (
                <Button onClick={handleLogout} variant="outline" size="sm" className="w-full">
                  Logout
                </Button>
              ) : (
                <Link href="/login" className="w-full" onClick={() => setIsOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full">Login</Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
