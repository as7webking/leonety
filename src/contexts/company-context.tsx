'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { clearAppNavigationMemory } from '@/lib/app-navigation-memory'

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
  const resolvedUserIdRef = useRef<string | null>(null)
  const inFlightRef = useRef<{ userId: string; promise: Promise<void> } | null>(null)
  const requestVersionRef = useRef(0)

  const setCurrentCompanyId = useCallback((companyId: string) => {
    setCurrentCompanyIdState(companyId)
    if (userId) {
      window.localStorage.setItem(getStorageKey(userId), companyId)
    }
  }, [userId])

  const clearCompanyState = useCallback(() => {
    requestVersionRef.current += 1
    resolvedUserIdRef.current = null
    inFlightRef.current = null
    clearAppNavigationMemory()
    setUserId(null)
    setCompanies([])
    setCurrentCompanyIdState(null)
    setLoading(false)
  }, [])

  const loadCompaniesForUser = useCallback((nextUserId: string, preferredCompanyId?: string | null) => {
    if (!preferredCompanyId && inFlightRef.current?.userId === nextUserId) {
      return inFlightRef.current.promise
    }

    const userChanged = resolvedUserIdRef.current !== null && resolvedUserIdRef.current !== nextUserId
    const isInitialLoad = resolvedUserIdRef.current === null
    if (userChanged) {
      clearAppNavigationMemory()
      setCompanies([])
      setCurrentCompanyIdState(null)
    }
    if (isInitialLoad || userChanged) setLoading(true)
    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion

    const request = (async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, owner_id, name, type, currency, created_at, updated_at')
        .eq('owner_id', nextUserId)
        .order('created_at', { ascending: true })

      if (error) {
        if (requestVersion !== requestVersionRef.current) return
        console.error('Failed to load companies:', error)
        if (isInitialLoad || userChanged) {
          setCompanies([])
          setCurrentCompanyIdState(null)
        }
        return
      }

      if (requestVersion !== requestVersionRef.current) return

      const nextCompanies = (data ?? []) as Company[]
      const storedCompanyId = window.localStorage.getItem(getStorageKey(nextUserId))
      const selectedCompanyId =
        preferredCompanyId && nextCompanies.some((company) => company.id === preferredCompanyId)
          ? preferredCompanyId
          : storedCompanyId && nextCompanies.some((company) => company.id === storedCompanyId)
            ? storedCompanyId
            : nextCompanies[0]?.id ?? null

      resolvedUserIdRef.current = nextUserId
      setUserId(nextUserId)
      setCompanies(nextCompanies)
      setCurrentCompanyIdState(selectedCompanyId)

      if (selectedCompanyId) {
        window.localStorage.setItem(getStorageKey(nextUserId), selectedCompanyId)
      } else {
        window.localStorage.removeItem(getStorageKey(nextUserId))
      }
    })().finally(() => {
      if (requestVersion === requestVersionRef.current) {
        if (inFlightRef.current?.promise === request) inFlightRef.current = null
        setLoading(false)
      }
    })

    if (!preferredCompanyId) inFlightRef.current = { userId: nextUserId, promise: request }
    return request
  }, [supabase])

  const refreshCompanies = useCallback(async (preferredCompanyId?: string | null) => {
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) {
      clearCompanyState()
      return
    }
    await loadCompaniesForUser(authData.user.id, preferredCompanyId)
  }, [clearCompanyState, loadCompaniesForUser, supabase])

  useEffect(() => {
    const initialLoad = window.requestAnimationFrame(() => {
      void refreshCompanies()
    })

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearCompanyState()
        return
      }
      if (event === 'SIGNED_IN' && session?.user.id && session.user.id !== resolvedUserIdRef.current) {
        void loadCompaniesForUser(session.user.id)
      }
    })

    return () => {
      window.cancelAnimationFrame(initialLoad)
      data.subscription.unsubscribe()
    }
  }, [clearCompanyState, loadCompaniesForUser, refreshCompanies, supabase])

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
