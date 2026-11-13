'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Save, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/i18n-context'
import { savedTableViewsI18n } from '@/lib/saved-table-views-i18n'
import { parseSavedTableViewCollection, parseSavedTableViewState, savedTableViewsStorageKey, serializeSavedTableViewCollection, type SavedTableKind, type SavedTableView, type SavedTableViewCollection, type SavedTableViewState } from '@/lib/saved-table-views'

interface SavedTableViewsProps<T extends SavedTableViewState> {
  kind: SavedTableKind
  userId: string | null
  workspaceId: string | null
  state: T
  applyDefault: boolean
  onApply: (state: T) => void
  compact?: boolean
}

export function SavedTableViews<T extends SavedTableViewState>({ kind, userId, workspaceId, state, applyDefault, onApply, compact = false }: SavedTableViewsProps<T>) {
  const { locale } = useI18n()
  const text = savedTableViewsI18n[locale]
  const scope = userId && workspaceId ? savedTableViewsStorageKey(kind, userId, workspaceId) : null
  const [collection, setCollection] = useState<SavedTableViewCollection<T>>({ views: [], defaultViewId: null })
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [entryMode, setEntryMode] = useState<'save' | 'rename' | null>(null)
  const [error, setError] = useState<'storage' | 'name' | ''>('')
  const scopeRef = useRef<string | null>(null)

  useEffect(() => {
    scopeRef.current = scope
    const timeout = window.setTimeout(() => {
      setCollection({ views: [], defaultViewId: null })
      setSelectedId('')
      setLoadedScope(null)
      setEntryMode(null)
      setError('')
      if (!scope) return
      try {
        const next = parseSavedTableViewCollection<T>(kind, window.localStorage.getItem(scope))
        setCollection(next)
        setSelectedId(next.defaultViewId ?? next.views[0]?.id ?? '')
        setLoadedScope(scope)
        if (applyDefault && next.defaultViewId) {
          const defaultView = next.views.find((view) => view.id === next.defaultViewId)
          if (defaultView) onApply(defaultView.state)
        }
      } catch {
        setLoadedScope(scope)
        setError('storage')
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [applyDefault, kind, onApply, scope])

  const persist = (next: SavedTableViewCollection<T>) => {
    if (!scope || scopeRef.current !== scope) return false
    try {
      window.localStorage.setItem(scope, serializeSavedTableViewCollection(next))
      setCollection(next)
      setError('')
      return true
    } catch {
      setError('storage')
      return false
    }
  }

  const selected = collection.views.find((view) => view.id === selectedId)
  const submitEntry = () => {
    const nextName = name.trim().slice(0, 60)
    if (!nextName) {
      setError('name')
      return
    }
    if (entryMode === 'rename' && editingId) {
      const next = { ...collection, views: collection.views.map((view) => view.id === editingId ? { ...view, name: nextName, updatedAt: Date.now() } : view) }
      if (persist(next)) setSelectedId(editingId)
    } else {
      const parsedState = parseSavedTableViewState(kind, state)
      if (!parsedState) return
      const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const view: SavedTableView<T> = { id, name: nextName, state: parsedState as T, updatedAt: Date.now() }
      const next = { ...collection, views: [view, ...collection.views].slice(0, 30) }
      if (persist(next)) setSelectedId(id)
    }
    setEntryMode(null)
    setEditingId(null)
    setName('')
  }

  const deleteSelected = () => {
    if (!selected) return
    const views = collection.views.filter((view) => view.id !== selected.id)
    const defaultViewId = collection.defaultViewId === selected.id ? null : collection.defaultViewId
    if (persist({ views, defaultViewId })) setSelectedId(defaultViewId ?? views[0]?.id ?? '')
  }

  const toggleDefault = () => {
    if (!selected) return
    persist({ ...collection, defaultViewId: collection.defaultViewId === selected.id ? null : selected.id })
  }

  if (!scope || loadedScope !== scope) return null

  return (
    <section className={`mb-4 flex min-w-0 flex-col gap-2 rounded-md border border-slate-200 bg-white ${compact ? 'p-2' : 'p-3'} sm:flex-row sm:flex-wrap sm:items-center`} aria-label={text.title}>
      <span className="shrink-0 text-sm font-medium text-slate-700">{text.title}</span>
      <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} aria-label={text.choose} className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm sm:max-w-xs">
        <option value="">{text.choose}</option>
        {collection.views.map((view) => <option key={view.id} value={view.id}>{view.name}{collection.defaultViewId === view.id ? ` · ${text.default}` : ''}</option>)}
      </select>
      <div className={`flex min-w-0 flex-wrap gap-2 ${compact ? 'items-center' : ''}`}>
        <Button type="button" size="sm" variant="outline" className={compact ? 'min-h-10' : undefined} onClick={() => { if (selected) { onApply(selected.state); setError('') } }} disabled={!selected}><Check className="h-4 w-4" />{text.apply}</Button>
        <Button type="button" size="sm" variant="outline" className={compact ? 'min-h-10' : undefined} onClick={() => { setEntryMode('save'); setEditingId(null); setName(''); setError('') }}><Save className="h-4 w-4" />{text.saveCurrent}</Button>
        {compact ? <details className="relative min-w-0 rounded-md border border-slate-200 bg-white">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{text.moreActions}<ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /></summary>
          <div className="absolute right-0 z-20 mt-1 grid min-w-48 gap-1 rounded-md border border-slate-200 bg-white p-2 shadow-lg">
            <Button type="button" size="sm" variant="ghost" className="min-h-10 justify-start" onClick={() => { if (selected) { setEntryMode('rename'); setEditingId(selected.id); setName(selected.name); setError('') } }} disabled={!selected}>{text.rename}</Button>
            <Button type="button" size="sm" variant="ghost" className="min-h-10 justify-start" onClick={toggleDefault} disabled={!selected}><Star className="h-4 w-4" />{collection.defaultViewId === selected?.id ? text.default : text.setDefault}</Button>
            <Button type="button" size="sm" variant="ghost" className="min-h-10 justify-start text-red-700 hover:text-red-800" onClick={deleteSelected} disabled={!selected}><Trash2 className="h-4 w-4" />{text.delete}</Button>
          </div>
        </details> : <>
          <Button type="button" size="sm" variant="outline" onClick={() => { if (selected) { setEntryMode('rename'); setEditingId(selected.id); setName(selected.name); setError('') } }} disabled={!selected}>{text.rename}</Button>
          <Button type="button" size="sm" variant="outline" onClick={toggleDefault} disabled={!selected}><Star className="h-4 w-4" />{collection.defaultViewId === selected?.id ? text.default : text.setDefault}</Button>
          <Button type="button" size="sm" variant="outline" className={compact ? 'text-red-700 hover:text-red-800' : undefined} onClick={deleteSelected} disabled={!selected} aria-label={text.delete}><Trash2 className="h-4 w-4" /><span className="sm:sr-only">{text.delete}</span></Button>
        </>}
      </div>
      {entryMode && <form className="flex min-w-0 w-full flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); submitEntry() }}>
        <label className="sr-only" htmlFor={`${kind}-saved-view-name`}>{text.name}</label>
        <input id={`${kind}-saved-view-name`} autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm" placeholder={text.name} />
        <Button type="submit" size="sm">{text.save}</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setEntryMode(null)}>{text.cancel}</Button>
      </form>}
      {error && <p role="status" className="w-full text-sm text-amber-800">{error === 'storage' ? text.storageUnavailable : text.nameRequired}</p>}
    </section>
  )
}
