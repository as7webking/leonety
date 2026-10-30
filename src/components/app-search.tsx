'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { FilePlus2, PackagePlus, Plus, Search, Timer } from 'lucide-react'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { getGlobalQuickActions, type GlobalSearchGroup } from '@/lib/global-search'
import { normalizeAppMode } from '@/lib/app-mode'
import { trapFocusWithin } from '@/lib/dialog-focus'

interface SearchResult {
  id: string
  group: GlobalSearchGroup
  title: string
  detail: string
  href: string
}

interface QuickAction {
  id: string
  label: string
  href: string
  icon: typeof Plus
}

const groups: GlobalSearchGroup[] = ['clients', 'invoices', 'products', 'employees', 'contracts']
const groupLabelKeys: Record<GlobalSearchGroup, string> = {
  clients: 'nav.clients',
  invoices: 'nav.invoices',
  products: 'nav.products',
  employees: 'nav.employees',
  contracts: 'nav.contracts',
}

export function AppSearch({ commandLauncher = false }: { commandLauncher?: boolean }) {
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [resultsWorkspaceId, setResultsWorkspaceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const commandInputRef = useRef<HTMLInputElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const trimmedQuery = query.trim()
  const workspaceId = currentCompany?.id ?? null
  const visibleResults = useMemo(() => resultsWorkspaceId === workspaceId ? results : [], [results, resultsWorkspaceId, workspaceId])
  const groupedResults = useMemo(
    () => groups.map((group) => ({ group, items: visibleResults.filter((result) => result.group === group) }))
      .filter((section) => section.items.length > 0),
    [visibleResults]
  )
  const activeResult = activeIndex >= 0 ? visibleResults[activeIndex] : undefined
  const quickActions = useMemo<QuickAction[]>(() => {
    if (!currentCompany) return []
    const icons = { invoice: FilePlus2, client: Plus, product: PackagePlus, income: Plus, expense: Plus, timer: Timer }
    return getGlobalQuickActions(normalizeAppMode(currentCompany.type)).map((action) => ({
      ...action,
      label: t(action.labelKey),
      icon: icons[action.id],
    }))
  }, [currentCompany, t])
  const commandItems = useMemo(
    () => trimmedQuery ? visibleResults.map((result) => ({ href: result.href, id: `${result.group}-${result.id}` })) : quickActions,
    [quickActions, trimmedQuery, visibleResults]
  )

  const openCommand = useCallback(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setCommandOpen(true)
    setOpen(false)
    setQuery('')
    setActiveIndex(-1)
  }, [])

  const closeCommand = useCallback(() => {
    setCommandOpen(false)
    setQuery('')
    setOpen(false)
    setActiveIndex(-1)
    requestAnimationFrame(() => previousFocusRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!commandLauncher) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openCommand()
      }
    }
    const onOpenEvent = () => openCommand()
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('leonety:open-command', onOpenEvent)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('leonety:open-command', onOpenEvent)
    }
  }, [commandLauncher, openCommand])

  useEffect(() => {
    if (!commandOpen) return
    commandInputRef.current?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeCommand()
      } else if (event.key === 'ArrowDown' && commandItems.length) {
        event.preventDefault()
        setActiveIndex((current) => (current + 1) % commandItems.length)
      } else if (event.key === 'ArrowUp' && commandItems.length) {
        event.preventDefault()
        setActiveIndex((current) => current <= 0 ? commandItems.length - 1 : current - 1)
      } else if (event.key === 'Tab') {
        const dialog = commandInputRef.current?.closest('[role="dialog"]')
        if (dialog instanceof HTMLElement) trapFocusWithin(dialog, event)
      } else if (event.key === 'Enter' && activeIndex >= 0 && commandItems[activeIndex]) {
        event.preventDefault()
        router.push(commandItems[activeIndex].href)
        closeCommand()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, closeCommand, commandItems, commandOpen, router])

  const updateMenuPosition = useCallback(() => {
    const input = inputRef.current
    if (!input) return

    const rect = input.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const padding = 12
    const offset = 8
    const availableBelow = viewportHeight - rect.bottom - padding
    const availableAbove = rect.top - padding
    const openAbove = availableBelow < 260 && availableAbove > availableBelow
    const width = Math.min(Math.max(rect.width, 220), viewportWidth - padding * 2)
    const left = Math.min(Math.max(padding, rect.left), viewportWidth - width - padding)
    const maxHeight = Math.min(384, Math.max(80, Math.min(openAbove ? availableAbove : availableBelow, viewportHeight - padding * 2) - offset))
    const desiredTop = openAbove ? rect.top - offset - maxHeight : rect.bottom + offset
    const top = Math.max(padding, Math.min(desiredTop, viewportHeight - padding - maxHeight))

    setMenuStyle({
      position: 'fixed',
      left,
      top,
      width,
      maxHeight,
      zIndex: 150,
    })
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, updateMenuPosition])

  useLayoutEffect(() => {
    if (open) updateMenuPosition()
  }, [open, updateMenuPosition, trimmedQuery, visibleResults.length, loading, error])

  useEffect(() => {
    setResults([])
    setResultsWorkspaceId(workspaceId)
    setActiveIndex(-1)
    setError(false)
    if (!workspaceId || trimmedQuery.length < 2) {
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(false)
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ companyId: workspaceId, q: trimmedQuery })
        const response = await fetch(`/api/global-search?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('search_unavailable')
        const payload = await response.json() as { results?: SearchResult[] }
        if (!Array.isArray(payload.results)) throw new Error('search_unavailable')
        setResults(payload.results)
        setResultsWorkspaceId(workspaceId)
      } catch {
        if (!controller.signal.aborted) {
          setResults([])
          setResultsWorkspaceId(workspaceId)
          setError(true)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [trimmedQuery, workspaceId])

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (event.key === 'ArrowDown' && visibleResults.length) {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => (current + 1) % visibleResults.length)
    }
    if (event.key === 'ArrowUp' && visibleResults.length) {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => current <= 0 ? visibleResults.length - 1 : current - 1)
    }
    if (event.key === 'Enter' && activeResult) {
      event.preventDefault()
      router.push(activeResult.href)
      setOpen(false)
      setQuery('')
    }
  }

  const menu = open && !commandOpen && trimmedQuery.length > 0 && menuStyle && typeof document !== 'undefined' ? createPortal(
    <div
      ref={menuRef}
      id="app-search-results"
      style={menuStyle}
      className="overflow-auto rounded-md border border-slate-200 bg-white shadow-lg"
      role="listbox"
      aria-label={t('search.label')}
    >
      {trimmedQuery.length < 2 ? (
        <div className="px-4 py-3 text-sm text-slate-500">{t('search.minChars')}</div>
      ) : loading ? (
        <div className="px-4 py-3 text-sm text-slate-500" role="status">{t('search.loading')}</div>
      ) : error ? (
        <div className="px-4 py-3 text-sm text-red-700" role="alert">{t('search.failed')}</div>
      ) : groupedResults.length === 0 ? (
        <div className="px-4 py-3 text-sm text-slate-500" role="status">{t('search.noResults')}</div>
      ) : (
        <div className="py-2">
          {groupedResults.map((section) => (
            <div key={section.group} className="py-1">
              <div className="px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t(groupLabelKeys[section.group])}
              </div>
              {section.items.map((result) => {
                const index = visibleResults.findIndex((item) => item.group === result.group && item.id === result.id)
                return (
                  <a
                    key={`${result.group}-${result.id}`}
                    id={`app-search-option-${index}`}
                    href={result.href}
                    className={`block min-h-11 px-4 py-2 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${index === activeIndex ? 'bg-slate-100' : ''}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onClick={(event) => {
                      event.preventDefault()
                      router.push(result.href)
                      setOpen(false)
                      setQuery('')
                      setActiveIndex(-1)
                    }}
                  >
                    <span className="block truncate font-medium text-slate-900">{result.title}</span>
                    {result.detail && <span className="block truncate text-xs text-slate-500">{result.detail}</span>}
                  </a>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body
  ) : null

  const commandDialog = commandOpen && typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-[160] flex items-start justify-center overflow-y-auto bg-slate-950/40 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(12vh,env(safe-area-inset-top)+1rem)]" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCommand() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="app-command-title" className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <h2 id="app-command-title" className="sr-only">{t('search.label')}</h2>
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            ref={commandInputRef}
            type="search"
            role="combobox"
            aria-label={t('search.label')}
            aria-autocomplete="list"
            aria-expanded={Boolean(trimmedQuery && visibleResults.length)}
            aria-controls="app-command-results"
            aria-activedescendant={activeIndex >= 0 ? `app-command-option-${activeIndex}` : undefined}
            maxLength={80}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1) }}
            placeholder={t('search.placeholder')}
            className="h-14 min-w-0 flex-1 border-0 bg-transparent text-base outline-none focus:ring-0"
          />
          <button type="button" onClick={closeCommand} className="rounded border px-2 py-1 text-xs text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label={t('search.close')}>Esc</button>
        </div>
        <div id="app-command-results" className="max-h-[min(65dvh,32rem)] overflow-y-auto p-2" role="listbox" aria-label={trimmedQuery ? t('search.label') : t('search.quickActions')}>
          {!trimmedQuery ? (
            <>
              <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase text-slate-500">{t('search.quickActions')}</p>
              {companyLoading ? <p className="px-3 py-3 text-sm text-slate-500" role="status">{t('search.loading')}</p> : !currentCompany ? <p className="px-3 py-3 text-sm text-slate-500" role="status">{t('common.noWorkspaceSelected')}</p> : quickActions.map((action, index) => {
                const Icon = action.icon
                return <button key={action.id} id={`app-command-option-${index}`} type="button" role="option" aria-selected={index === activeIndex} onMouseEnter={() => setActiveIndex(index)} onClick={() => { router.push(action.href); closeCommand() }} className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${index === activeIndex ? 'bg-slate-100' : 'hover:bg-slate-50'}`}><Icon className="h-4 w-4 text-slate-500" aria-hidden="true" /><span>{action.label}</span></button>
              })}
            </>
          ) : trimmedQuery.length < 2 ? <p className="px-3 py-3 text-sm text-slate-500" role="status">{t('search.minChars')}</p>
            : loading ? <p className="px-3 py-3 text-sm text-slate-500" role="status">{t('search.loading')}</p>
              : error ? <p className="px-3 py-3 text-sm text-red-700" role="alert">{t('search.failed')}</p>
                : groupedResults.length === 0 ? <p className="px-3 py-3 text-sm text-slate-500" role="status">{t('search.noResults')}</p>
                  : groupedResults.map((section) => <div key={section.group} className="py-1"><p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t(groupLabelKeys[section.group])}</p>{section.items.map((result) => {
                    const index = visibleResults.findIndex((item) => item.group === result.group && item.id === result.id)
                    return <button key={`${result.group}-${result.id}`} id={`app-command-option-${index}`} type="button" role="option" aria-selected={index === activeIndex} onMouseEnter={() => setActiveIndex(index)} onClick={() => { router.push(result.href); closeCommand() }} className={`block min-h-11 w-full rounded-md px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 ${index === activeIndex ? 'bg-slate-100' : 'hover:bg-slate-50'}`}><span className="block truncate text-sm font-medium text-slate-900">{result.title}</span>{result.detail && <span className="block truncate text-xs text-slate-500">{result.detail}</span>}</button>
                  })}</div>)}
        </div>
        <div className="hidden items-center justify-between border-t px-4 py-2 text-xs text-slate-500 sm:flex"><span>{t('search.keyboardNavigation')}</span><span>{t('search.keyboardHints')}</span></div>
      </section>
    </div>,
    document.body
  ) : null

  return (
    <div ref={wrapperRef} className="relative w-full min-w-0">
      <label htmlFor="app-search" className="sr-only">{t('search.label')}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          id="app-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && trimmedQuery.length > 0}
          aria-controls="app-search-results"
          aria-activedescendant={activeIndex >= 0 ? `app-search-option-${activeIndex}` : undefined}
          maxLength={80}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(-1)
            setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={t('search.placeholder')}
          className="w-full min-w-0 rounded-md border bg-background py-2 pl-9 pr-20 text-sm"
        />
        <button type="button" onClick={openCommand} className="absolute right-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label={t('search.openQuickActions')}>{t('search.shortcut')}</button>
      </div>
      {menu}
      {commandDialog}
    </div>
  )
}
