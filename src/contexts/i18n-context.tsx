'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { LOCALE_COOKIE, defaultLocale, dictionaries, normalizeLocale, type Locale } from '@/lib/i18n'

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)
const STORAGE_KEY = LOCALE_COOKIE
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

function humanizeMissingKey(key: string) {
  return key
    .split('.')
    .pop()
    ?.replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || ''
}

export function I18nProvider({
  children,
  initialLocale = defaultLocale,
}: {
  children: React.ReactNode
  initialLocale?: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  useEffect(() => {
    document.documentElement.lang = locale
    window.localStorage.setItem(STORAGE_KEY, locale)
  }, [locale])

  const setLocale = (nextLocale: Locale) => {
    const normalizedLocale = normalizeLocale(nextLocale)
    setLocaleState(normalizedLocale)
    document.cookie = `${LOCALE_COOKIE}=${normalizedLocale}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`
  }

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (key: string) => dictionaries[locale][key] ?? dictionaries.en[key] ?? humanizeMissingKey(key),
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
