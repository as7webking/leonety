'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useI18n } from '@/contexts/i18n-context'

export interface AddressSuggestion {
  id: string
  label: string
  street: string
  houseNumber: string
  postalCode: string
  city: string
  country: string
  state: string
}

interface AddressAutocompleteProps {
  country?: string
  onSelect: (suggestion: AddressSuggestion) => void
}

export function AddressAutocomplete({ country, onSelect }: AddressAutocompleteProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const normalizedQuery = query.trim()
    setActiveIndex(-1)

    if (normalizedQuery.length < 3) {
      abortRef.current?.abort()
      setSuggestions([])
      setLoading(false)
      setError('')
      return
    }

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller

    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({ q: normalizedQuery })
        if (country?.trim()) params.set('country', country.trim())
        const response = await fetch(`/api/address/search?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(payload.error ?? t('address.searchFailed'))
        }

        setSuggestions((payload.suggestions ?? []) as AddressSuggestion[])
      } catch (searchError) {
        if (searchError instanceof Error && searchError.name === 'AbortError') return
        setSuggestions([])
        setError(searchError instanceof Error ? searchError.message : t('address.searchFailed'))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 350)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [country, query, t])

  const chooseSuggestion = (suggestion: AddressSuggestion) => {
    onSelect(suggestion)
    setQuery(suggestion.label)
    setSuggestions([])
    setActiveIndex(-1)
  }

  return (
    <div className="relative space-y-1">
      <label className="block text-sm font-medium">{t('address.searchLabel')}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setSuggestions([])
              setActiveIndex(-1)
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((current) => Math.min(suggestions.length - 1, current + 1))
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex((current) => Math.max(0, current - 1))
            }
            if (event.key === 'Enter' && activeIndex >= 0 && suggestions[activeIndex]) {
              event.preventDefault()
              chooseSuggestion(suggestions[activeIndex])
            }
          }}
          className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder={t('address.searchPlaceholder')}
          aria-autocomplete="list"
        />
      </div>
      <p className="text-xs text-slate-500">{t('address.manualFallback')}</p>
      {loading && <p className="text-xs text-slate-500">{t('common.loading')}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
      {!loading && !error && query.trim().length >= 3 && suggestions.length === 0 && (
        <p className="text-xs text-slate-500">{t('address.noResults')}</p>
      )}
      {suggestions.length > 0 && (
        <div className="absolute z-[60] mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => chooseSuggestion(suggestion)}
              className={`block w-full px-3 py-2 text-left text-sm ${index === activeIndex ? 'bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
