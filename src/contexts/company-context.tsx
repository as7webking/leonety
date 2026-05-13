'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'

export interface Company {
  id: string
  owner_id: string
  name: string
  type: 'personal' | 'business'
  currency: string | null
  created_at: string
  updated_at: string
}

interface CompanyContextValue {
  companies: Company[]
  currentCompany: Company | null
  currentCompanyId: string | null
  loading: boolean
  setCurrentCompanyId: (companyId: string) => void
  refreshCompanies: (preferredCompanyId?: string | null) => Promise<void>
}

const CompanyContext = createContext<CompanyContextValue | undefined>(undefined)

function getStorageKey(userId: string) {
  return `monvia-current-company:${userId}`
}

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient())
  const [companies, setCompanies] = useState<Company[]>([])
  const [currentCompanyId, setCurrentCompanyIdState] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const setCurrentCompanyId = useCallback((companyId: string) => {
    setCurrentCompanyIdState(companyId)
    if (userId) {
      window.localStorage.setItem(getStorageKey(userId), companyId)
    }
  }, [userId])

  const refreshCompanies = useCallback(async (preferredCompanyId?: string | null) => {
    setLoading(true)

    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (!user) {
      setUserId(null)
      setCompanies([])
      setCurrentCompanyIdState(null)
      setLoading(false)
      return
    }

    setUserId(user.id)

    const { data, error } = await supabase
      .from('companies')
      .select('id, owner_id, name, type, currency, created_at, updated_at')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to load companies:', error)
      setCompanies([])
      setCurrentCompanyIdState(null)
      setLoading(false)
      return
    }

    const nextCompanies = (data ?? []) as Company[]
    setCompanies(nextCompanies)

    const storedCompanyId = window.localStorage.getItem(getStorageKey(user.id))
    const selectedCompanyId =
      preferredCompanyId && nextCompanies.some((company) => company.id === preferredCompanyId)
        ? preferredCompanyId
        : storedCompanyId && nextCompanies.some((company) => company.id === storedCompanyId)
          ? storedCompanyId
          : nextCompanies[0]?.id ?? null

    setCurrentCompanyIdState(selectedCompanyId)

    if (selectedCompanyId) {
      window.localStorage.setItem(getStorageKey(user.id), selectedCompanyId)
    } else {
      window.localStorage.removeItem(getStorageKey(user.id))
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refreshCompanies()
    }, 0)

    const { data } = supabase.auth.onAuthStateChange(() => {
      void refreshCompanies()
    })

    return () => {
      window.clearTimeout(initialLoad)
      data.subscription.unsubscribe()
    }
  }, [refreshCompanies, supabase])

  const currentCompany =
    companies.find((company) => company.id === currentCompanyId) ?? null

  return (
    <CompanyContext.Provider
      value={{
        companies,
        currentCompany,
        currentCompanyId,
        loading,
        setCurrentCompanyId,
        refreshCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  const context = useContext(CompanyContext)

  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider')
  }

  return context
}
