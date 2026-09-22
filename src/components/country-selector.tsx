'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { useI18n } from '@/contexts/i18n-context'
import { calculateAppSelectPosition } from '@/lib/app-select-position'
import {
  countryCodes,
  getCountryName,
  getCountrySearchTerms,
  normalizeCountrySearch,
  resolveCountryCode,
  type CountryCode,
} from '@/lib/countries'

interface CountrySelectorProps {
  label: string
  value: string
  onChange: (value: string) => void
  kind?: 'country' | 'nationality'
  required?: boolean
  customValue?: string
  onCustomValueChange?: (value: string) => void
  className?: string
}

export function CountrySelector({
  label,
  value,
  onChange,
  kind = 'country',
  required,
  customValue,
  onCustomValueChange,
  className = '',
}: CountrySelectorProps) {
  const { locale, t } = useI18n()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [manualMode, setManualMode] = useState(Boolean(customValue || (value && !resolveCountryCode(value))))
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const selectedCode = resolveCountryCode(value)
  const legacyCustomValue = !selectedCode ? value : ''
  const effectiveCustomValue = customValue ?? legacyCustomValue
  const showManual = !selectedCode && (manualMode || Boolean(effectiveCustomValue))
  const selectedLabel = selectedCode
    ? getCountryName(selectedCode, locale)
    : effectiveCustomValue || t(kind === 'nationality' ? 'countrySelector.selectNationality' : 'countrySelector.selectCountry')

  const options = useMemo(() => countryCodes
    .map((code) => ({ code, label: getCountryName(code, locale) }))
    .sort((left, right) => left.label.localeCompare(right.label, locale)), [locale])

  const filteredOptions = useMemo(() => {
    const needle = normalizeCountrySearch(query)
    if (!needle) return options
    return options.filter(({ code }) => getCountrySearchTerms(code, locale).some((term) => term.includes(needle)))
  }, [locale, options, query])

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const position = calculateAppSelectPosition({
      rect,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      optionCount: Math.min(filteredOptions.length + 2, 8),
      placement: 'auto',
    })
    const width = Math.min(Math.max(position.width, 280), window.innerWidth - 24)
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12))
    setMenuStyle({
      position: 'fixed', left, top: position.top, bottom: position.bottom,
      width, maxWidth: 'calc(100vw - 24px)', maxHeight: position.maxHeight,
      zIndex: 160,
    })
  }, [filteredOptions.length])

  useLayoutEffect(() => {
    if (!open) return
    updateMenuPosition()
    requestAnimationFrame(() => searchRef.current?.focus())
  }, [open, updateMenuPosition])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    const reposition = () => updateMenuPosition()
    window.addEventListener('pointerdown', closeOnOutsideClick)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsideClick)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, updateMenuPosition])

  const close = () => {
    setOpen(false)
    setQuery('')
    requestAnimationFrame(() => buttonRef.current?.focus())
  }

  const chooseCode = (code: CountryCode | '') => {
    onChange(code)
    onCustomValueChange?.('')
    setManualMode(false)
    close()
  }

  const chooseOther = () => {
    if (selectedCode) onChange('')
    setManualMode(true)
    close()
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter' && filteredOptions[activeIndex]) {
      event.preventDefault()
      chooseCode(filteredOptions[activeIndex].code)
    }
  }

  const menu = open && menuStyle && typeof document !== 'undefined' ? createPortal(
    <div ref={menuRef} style={menuStyle} className="flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
      <div className="relative border-b border-slate-200 p-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={searchRef}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-options`}
          aria-activedescendant={filteredOptions[activeIndex] ? `${id}-${filteredOptions[activeIndex].code}` : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder={t(kind === 'nationality' ? 'countrySelector.searchNationality' : 'countrySelector.searchCountry')}
          className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
      </div>
      <div id={`${id}-options`} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
        {!required && !query && (
          <button type="button" role="option" aria-selected={!value && !effectiveCustomValue} onClick={() => chooseCode('')} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">
            <span className="w-4">{!value && !effectiveCustomValue ? <Check className="h-4 w-4" /> : null}</span>{t('countrySelector.notSpecified')}
          </button>
        )}
        {filteredOptions.map((option, index) => (
          <button
            id={`${id}-${option.code}`}
            key={option.code}
            type="button"
            role="option"
            aria-selected={selectedCode === option.code}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => chooseCode(option.code)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${index === activeIndex ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
          >
            <span className="w-4">{selectedCode === option.code ? <Check className="h-4 w-4" /> : null}</span>
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            <span className="text-xs text-slate-400">{option.code}</span>
          </button>
        ))}
        {filteredOptions.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-500">{t('countrySelector.noResults')}</p>}
        <div className="mt-1 border-t border-slate-200 pt-1">
          <button type="button" role="option" aria-selected={showManual} onClick={chooseOther} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
            <span className="w-4">{showManual ? <Check className="h-4 w-4" /> : null}</span>{t('countrySelector.other')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null

  return (
    <div ref={rootRef} className={`min-w-0 space-y-1 ${className}`}>
      <span id={`${id}-label`} className="block text-sm font-medium">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        aria-labelledby={`${id}-label`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { setQuery(''); setOpen((current) => !current) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(true)
          }
          if (event.key === 'Escape') setOpen(false)
        }}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-left text-sm text-slate-900 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        <span className={`truncate ${!selectedCode && !effectiveCustomValue ? 'text-slate-500' : ''}`}>{selectedLabel}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-500" />
      </button>
      {showManual && (
        <label className="block space-y-1 pt-1">
          <span className="text-xs font-medium text-slate-700">{t(kind === 'nationality' ? 'countrySelector.specifyNationality' : 'countrySelector.specifyCountry')}</span>
          <input
            value={effectiveCustomValue}
            required={required}
            onChange={(event) => onCustomValueChange ? onCustomValueChange(event.target.value) : onChange(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base sm:text-sm"
          />
        </label>
      )}
      {menu}
    </div>
  )
}
