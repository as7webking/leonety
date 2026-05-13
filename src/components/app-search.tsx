'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useCompany } from '@/contexts/company-context'

type SearchGroup = 'Income' | 'Expenses' | 'Time' | 'Workspaces'

interface SearchResult {
  id: string
  group: SearchGroup
  title: string
  detail: string
  href: string
}

interface IncomeRow {
  id: string
  description: string | null
  category: string | null
  amount: number | string
  date: string
  company_id: string
}

interface ExpenseRow {
  id: string
  description: string | null
  category: string | null
  amount: number | string
  date: string
  company_id: string
}

interface TimeRow {
  id: string
  description: string | null
  hours: number | string
  date: string
  company_id: string
}

const groups: SearchGroup[] = ['Income', 'Expenses', 'Time', 'Workspaces']

function matchesQuery(values: Array<string | number | null | undefined>, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  return values.some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery))
}

function formatHours(hoursValue: number) {
  const safeHoursValue = Math.max(0, Number(hoursValue) || 0)
  const totalMinutes = Math.round(safeHoursValue * 60)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    const parts = [`${days}d`]
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)
    return parts.join(' ')
  }

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

export function AppSearch() {
  const [supabase] = useState(() => createClient())
  const { companies, currentCompany } = useCompany()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const trimmedQuery = query.trim()

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    if (!currentCompany || trimmedQuery.length < 2) {
      setResults([])
      setLoading(false)
      setError('')
      return
    }

    let active = true

    const loadResults = async () => {
      setLoading(true)
      setError('')

      try {
        const [incomeRes, expenseRes, timeRes] = await Promise.all([
          supabase
            .from('incomes')
            .select('id, description, category, amount, date, company_id')
            .eq('company_id', currentCompany.id)
            .order('date', { ascending: false })
            .limit(100),
          supabase
            .from('expenses')
            .select('id, description, category, amount, date, company_id')
            .eq('company_id', currentCompany.id)
            .order('date', { ascending: false })
            .limit(100),
          supabase
            .from('time_entries')
            .select('id, description, hours, date, company_id')
            .eq('company_id', currentCompany.id)
            .order('date', { ascending: false })
            .limit(100),
        ])

        if (incomeRes.error) throw incomeRes.error
        if (expenseRes.error) throw expenseRes.error
        if (timeRes.error) throw timeRes.error

        const nextResults: SearchResult[] = []

        for (const company of companies) {
          if (matchesQuery([company.name, company.type, company.currency], trimmedQuery)) {
            nextResults.push({
              id: `workspace-${company.id}`,
              group: 'Workspaces',
              title: company.name,
              detail: `${company.type} workspace${company.currency ? ` · ${company.currency}` : ''}`,
              href: '/dashboard',
            })
          }
        }

        for (const income of (incomeRes.data ?? []) as IncomeRow[]) {
          if (matchesQuery([income.description, income.category, income.amount, income.date], trimmedQuery)) {
            nextResults.push({
              id: `income-${income.id}`,
              group: 'Income',
              title: income.description || 'Income entry',
              detail: [income.category, income.amount, income.date].filter(Boolean).join(' · '),
              href: '/income',
            })
          }
        }

        for (const expense of (expenseRes.data ?? []) as ExpenseRow[]) {
          if (matchesQuery([expense.description, expense.category, expense.amount, expense.date], trimmedQuery)) {
            nextResults.push({
              id: `expense-${expense.id}`,
              group: 'Expenses',
              title: expense.description || 'Expense entry',
              detail: [expense.category, expense.amount, expense.date].filter(Boolean).join(' · '),
              href: '/expenses',
            })
          }
        }

        for (const entry of (timeRes.data ?? []) as TimeRow[]) {
          const duration = formatHours(Number(entry.hours))
          if (matchesQuery([entry.description, entry.date, entry.hours, duration], trimmedQuery)) {
            nextResults.push({
              id: `time-${entry.id}`,
              group: 'Time',
              title: entry.description || 'Time entry',
              detail: `${duration} · ${entry.date}`,
              href: '/time',
            })
          }
        }

        if (active) {
          setResults(nextResults.slice(0, 20))
        }
      } catch (searchError) {
        if (active) {
          setError(searchError instanceof Error ? searchError.message : 'Search failed')
          setResults([])
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    const timeout = window.setTimeout(() => {
      void loadResults()
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [companies, currentCompany, supabase, trimmedQuery])

  const groupedResults = useMemo(
    () => groups.map((group) => ({
      group,
      items: results.filter((result) => result.group === group),
    })).filter((section) => section.items.length > 0),
    [results]
  )

  return (
    <div ref={wrapperRef} className="relative w-full md:w-64">
      <label htmlFor="app-search" className="sr-only">Search app</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id="app-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search workspace"
          className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
        />
      </div>

      {open && trimmedQuery.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {trimmedQuery.length < 2 ? (
            <div className="px-4 py-3 text-sm text-slate-500">Type at least 2 characters.</div>
          ) : loading ? (
            <div className="px-4 py-3 text-sm text-slate-500">Searching...</div>
          ) : error ? (
            <div className="px-4 py-3 text-sm text-red-700">{error}</div>
          ) : groupedResults.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500">No results found.</div>
          ) : (
            <div className="py-2">
              {groupedResults.map((section) => (
                <div key={section.group} className="py-1">
                  <div className="px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {section.group}
                  </div>
                  {section.items.map((result) => (
                    <Link
                      key={result.id}
                      href={result.href}
                      className="block px-4 py-2 text-sm hover:bg-slate-50"
                      onClick={() => setOpen(false)}
                    >
                      <span className="block font-medium text-slate-900">{result.title}</span>
                      <span className="block text-xs text-slate-500">{result.detail}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
