'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { defaultLocale, dictionaries, normalizeLocale, type Locale } from '@/lib/i18n'

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)
const STORAGE_KEY = 'leonety-locale'

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedLocale = normalizeLocale(window.localStorage.getItem(STORAGE_KEY))
      setLocaleState(storedLocale)
      document.documentElement.lang = storedLocale
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale)
    window.localStorage.setItem(STORAGE_KEY, nextLocale)
    document.documentElement.lang = nextLocale
  }

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (key: string) => dictionaries[locale][key] ?? dictionaries.en[key] ?? key,
  }), [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)

  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }

  return context
}
