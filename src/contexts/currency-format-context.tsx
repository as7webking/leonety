'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { formatCurrency, type CurrencySymbolPosition } from '@/lib/currency'
import {
  DEFAULT_CURRENCY_SYMBOL_POSITION,
  readCurrencySymbolPosition,
  writeCurrencySymbolPosition,
} from '@/lib/currency-position'

interface CurrencyFormatContextValue {
  position: CurrencySymbolPosition
  setPosition: (position: CurrencySymbolPosition) => void
  format: (amount: number, currency: string, locale?: string) => string
}

const CurrencyFormatContext = createContext<CurrencyFormatContextValue | null>(null)

export function CurrencyFormatProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient())
  const [userId, setUserId] = useState<string | null>(null)
  const [position, setPositionState] = useState<CurrencySymbolPosition>(DEFAULT_CURRENCY_SYMBOL_POSITION)
  const requestVersion = useRef(0)

  const resolveUser = useCallback(async () => {
    const version = ++requestVersion.current
    const { data } = await supabase.auth.getUser()
    if (version !== requestVersion.current) return
    const nextUserId = data.user?.id ?? null
    setUserId(nextUserId)
    let nextPosition = DEFAULT_CURRENCY_SYMBOL_POSITION
    if (nextUserId) {
      try {
        nextPosition = readCurrencySymbolPosition(window.localStorage, nextUserId)
      } catch {
        nextPosition = DEFAULT_CURRENCY_SYMBOL_POSITION
      }
    }
    setPositionState(nextPosition)
  }, [supabase])

  useEffect(() => {
    void Promise.resolve().then(resolveUser)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      requestVersion.current += 1
      setUserId(null)
      setPositionState(DEFAULT_CURRENCY_SYMBOL_POSITION)
      void resolveUser()
    })
    return () => {
      requestVersion.current += 1
      subscription.unsubscribe()
    }
  }, [resolveUser, supabase])

  const setPosition = useCallback((next: CurrencySymbolPosition) => {
    setPositionState(next)
    if (userId) {
      try {
        writeCurrencySymbolPosition(window.localStorage, userId, next)
      } catch {
        // Keep the preference active for this session when browser storage is unavailable.
      }
    }
  }, [userId])

  const format = useCallback((amount: number, currency: string, locale?: string) =>
    formatCurrency(amount, currency, locale, position), [position])

  const value = useMemo(() => ({ position, setPosition, format }), [position, setPosition, format])
  return <CurrencyFormatContext.Provider value={value}>{children}</CurrencyFormatContext.Provider>
}

export function useCurrencyFormat() {
  const context = useContext(CurrencyFormatContext)
  if (!context) throw new Error('useCurrencyFormat must be used within CurrencyFormatProvider')
  return context
}
