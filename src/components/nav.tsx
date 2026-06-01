'use client'

import Link from "next/link"
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-client'
import { useCompany } from '@/contexts/company-context'
import { useAccountAccess } from '@/hooks/use-account-access'
import { canCreateWorkspace } from '@/lib/account-access'
import { AppSearch } from '@/components/app-search'
import { AppSelect } from '@/components/app-select'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/i18n-context'
import { ChevronDown, Menu, X, User } from 'lucide-react'

const WORKSPACE_ACTION_VALUE = '__workspace_action__'

export function Nav() {
  const [isOpen, setIsOpen] = useState(false)
  const [transactionsOpen, setTransactionsOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [supabase] = useState(() => createClient())
  const router = useRouter()
  const { companies, currentCompanyId, loading, setCurrentCompanyId } = useCompany()
  const { accountAccess } = useAccountAccess(accountEmail)
  const { t } = useI18n()
  const canAddWorkspace = canCreateWorkspace(companies.length, accountAccess)
  const workspaceActionHref = canAddWorkspace ? '/workspaces' : '/upgrade'
  const workspaceActionLabel = canAddWorkspace ? t('nav.addWorkspace') : t('nav.switchToPro')
  const companyOptions = [
    ...(companies.length === 0 ? [{ value: '', label: t('nav.noWorkspace'), disabled: true }] : []),
    ...companies.map((company) => ({ value: company.id, label: `${company.name} (${company.type})` })),
    { value: WORKSPACE_ACTION_VALUE, label: workspaceActionLabel },
  ]
  const showBusinessModules = currentCompanyId
    ? companies.find((company) => company.id === currentCompanyId)?.type === 'business'
    : false

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
      <div className="container mx-auto px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold" onClick={() => setIsOpen(false)}>
            <img src="/logo.png" alt="Leonety" className="h-9 w-9 object-contain" />
            <span>Leonety</span>
          </Link>
          
          {/* Desktop menu */}
          <div className="hidden flex-1 items-center justify-between gap-2 lg:flex">
            <div className="flex items-center gap-0.5 rounded-md bg-slate-50 p-0.5">
              <Link href="/dashboard" className="rounded px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-950">{t('nav.dashboard')}</Link>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTransactionsOpen((open) => !open)}
                  className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-950"
                  aria-expanded={transactionsOpen}
                >
                  {t('nav.transactions')}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {transactionsOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                    <Link href="/transactions" className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setTransactionsOpen(false)}>
                      {t('nav.allTransactions')}
                    </Link>
                    <Link href="/income" className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setTransactionsOpen(false)}>
                      {t('nav.income')}
                    </Link>
                    <Link href="/expenses" className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setTransactionsOpen(false)}>
                      {t('nav.expenses')}
                    </Link>
                  </div>
                )}
              </div>
              <Link href="/time" className="rounded px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-950">{t('nav.time')}</Link>
              {showBusinessModules && (
                <>
                  <Link href="/clients" className="rounded px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-950">{t('nav.clients')}</Link>
                  <Link href="/invoices" className="rounded px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-950">{t('nav.invoices')}</Link>
                </>
              )}
              <Link href="/workspaces" className="rounded px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-950">{t('nav.workspaces')}</Link>
            </div>
            <div className="flex min-w-0 items-center justify-end gap-1.5">
              <AppSearch />
              <div className="min-w-[160px] max-w-[210px]">
                <label htmlFor="company-selector" className="sr-only">Current company</label>
                <AppSelect
                  value={currentCompanyId ?? ''}
                  onChange={handleCompanyChange}
                  disabled={loading}
                  options={companyOptions}
                  ariaLabel="Current company"
                />
              </div>
              {isAuthenticated && (
                <Link href="/profile" className="flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-950">
                  <User className="h-4 w-4" />
                  {t('nav.profile')}
                </Link>
              )}
              <LanguageSwitcher />
              {isAuthenticated ? (
                <Button onClick={handleLogout} variant="outline" size="sm">{t('nav.logout')}</Button>
              ) : (
                <Link href="/login">
                  <Button variant="outline" size="sm">{t('nav.login')}</Button>
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
              <AppSelect
                value={currentCompanyId ?? ''}
                onChange={handleCompanyChange}
                disabled={loading}
                options={companyOptions}
                ariaLabel="Current company"
              />
              <Link href="/dashboard" className="hover:underline" onClick={() => setIsOpen(false)}>{t('nav.dashboard')}</Link>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-sm font-medium text-slate-700">{t('nav.transactions')}</p>
                <div className="flex flex-col gap-2 pl-2">
                  <Link href="/transactions" className="hover:underline" onClick={() => setIsOpen(false)}>{t('nav.allTransactions')}</Link>
                  <Link href="/income" className="hover:underline" onClick={() => setIsOpen(false)}>{t('nav.income')}</Link>
                  <Link href="/expenses" className="hover:underline" onClick={() => setIsOpen(false)}>{t('nav.expenses')}</Link>
                </div>
              </div>
              <Link href="/time" className="hover:underline" onClick={() => setIsOpen(false)}>{t('nav.time')}</Link>
              {showBusinessModules && (
                <>
                  <Link href="/clients" className="hover:underline" onClick={() => setIsOpen(false)}>{t('nav.clients')}</Link>
                  <Link href="/invoices" className="hover:underline" onClick={() => setIsOpen(false)}>{t('nav.invoices')}</Link>
                </>
              )}
              <Link href="/workspaces" className="hover:underline" onClick={() => setIsOpen(false)}>{t('nav.workspaces')}</Link>
              {isAuthenticated && (
                <Link href="/profile" className="hover:underline flex items-center gap-1" onClick={() => setIsOpen(false)}>
                  <User className="h-4 w-4" />
                  {t('nav.profile')}
                </Link>
              )}
              <LanguageSwitcher />
              {isAuthenticated ? (
                <Button onClick={handleLogout} variant="outline" size="sm" className="w-full">
                  {t('nav.logout')}
                </Button>
              ) : (
                <Link href="/login" className="w-full" onClick={() => setIsOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full">{t('nav.login')}</Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
