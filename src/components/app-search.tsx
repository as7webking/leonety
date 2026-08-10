'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase-client'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'

type SearchGroup = 'income' | 'expenses' | 'time' | 'clients' | 'invoices' | 'workspaces'

interface SearchResult {
  id: string
  group: SearchGroup
  title: string
  titleKey?: string
  detail: string
  detailKey?: string
  detailParams?: Record<string, string>
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

interface ClientRow {
  id: string
  name: string
  phone: string | null
  interested_in: string | null
  status: string
  company_id: string
}

interface InvoiceRow {
  id: string
  invoice_number: string
  status: string
  total: number | string
  currency: string
  company_id: string
}

const groups: SearchGroup[] = ['income', 'expenses', 'time', 'clients', 'invoices', 'workspaces']

const groupLabelKeys: Record<SearchGroup, string> = {
  income: 'nav.income',
  expenses: 'nav.expenses',
  time: 'nav.time',
  clients: 'nav.clients',
  invoices: 'nav.invoices',
  workspaces: 'nav.workspaces',
}

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
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
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
      setError(false)
      return
    }

    let active = true

    const loadResults = async () => {
      setLoading(true)
      setError(false)

      try {
        const [incomeRes, expenseRes, timeRes, clientRes, invoiceRes] = await Promise.all([
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
          supabase
            .from('clients')
            .select('id, name, phone, interested_in, status, company_id')
            .eq('company_id', currentCompany.id)
            .order('created_at', { ascending: false })
            .limit(100),
          supabase
            .from('invoices')
            .select('id, invoice_number, status, total, currency, company_id')
            .eq('company_id', currentCompany.id)
            .order('created_at', { ascending: false })
            .limit(100),
        ])

        if (incomeRes.error) throw incomeRes.error
        if (expenseRes.error) throw expenseRes.error
        if (timeRes.error) throw timeRes.error
        if (clientRes.error && clientRes.error.code !== '42P01') throw clientRes.error
        if (invoiceRes.error && invoiceRes.error.code !== '42P01') throw invoiceRes.error

        const nextResults: SearchResult[] = []

        for (const company of companies) {
          if (matchesQuery([company.name, company.type, company.currency], trimmedQuery)) {
            nextResults.push({
              id: `workspace-${company.id}`,
              group: 'workspaces',
              title: company.name,
              detail: '',
              detailKey: 'search.workspaceDetail',
              detailParams: {
                type: company.type,
                currency: company.currency ? ` · ${company.currency}` : '',
              },
              href: '/app/dashboard',
            })
          }
        }

        for (const income of (incomeRes.data ?? []) as IncomeRow[]) {
          if (matchesQuery([income.description, income.category, income.amount, income.date], trimmedQuery)) {
            nextResults.push({
              id: `income-${income.id}`,
              group: 'income',
              title: income.description || '',
              titleKey: income.description ? undefined : 'search.incomeEntry',
              detail: [income.category, income.amount, income.date].filter(Boolean).join(' · '),
              href: '/app/income',
            })
          }
        }

        for (const expense of (expenseRes.data ?? []) as ExpenseRow[]) {
          if (matchesQuery([expense.description, expense.category, expense.amount, expense.date], trimmedQuery)) {
            nextResults.push({
              id: `expense-${expense.id}`,
              group: 'expenses',
              title: expense.description || '',
              titleKey: expense.description ? undefined : 'search.expenseEntry',
              detail: [expense.category, expense.amount, expense.date].filter(Boolean).join(' · '),
              href: '/app/expenses',
            })
          }
        }

        for (const entry of (timeRes.data ?? []) as TimeRow[]) {
          const duration = formatHours(Number(entry.hours))
          if (matchesQuery([entry.description, entry.date, entry.hours, duration], trimmedQuery)) {
            nextResults.push({
              id: `time-${entry.id}`,
              group: 'time',
              title: entry.description || '',
              titleKey: entry.description ? undefined : 'search.timeEntry',
              detail: `${duration} · ${entry.date}`,
              href: '/app/time',
            })
          }
        }

        for (const client of (clientRes.data ?? []) as ClientRow[]) {
          if (matchesQuery([client.name, client.phone, client.interested_in, client.status], trimmedQuery)) {
            nextResults.push({
              id: `client-${client.id}`,
              group: 'clients',
              title: client.name,
              detail: [client.phone, client.interested_in, client.status].filter(Boolean).join(' · '),
              href: '/app/clients',
            })
          }
        }

        for (const invoice of (invoiceRes.data ?? []) as InvoiceRow[]) {
          if (matchesQuery([invoice.invoice_number, invoice.status, invoice.total, invoice.currency], trimmedQuery)) {
            nextResults.push({
              id: `invoice-${invoice.id}`,
              group: 'invoices',
              title: invoice.invoice_number,
              detail: [invoice.status, `${invoice.total} ${invoice.currency}`].filter(Boolean).join(' · '),
              href: '/app/invoices',
            })
          }
        }

        if (active) {
          setResults(nextResults.slice(0, 20))
        }
      } catch (searchError) {
        if (active) {
          console.error('Search failed:', searchError)
          setError(true)
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

  const renderDetail = (result: SearchResult) => {
    if (!result.detailKey) return result.detail
    return Object.entries(result.detailParams ?? {}).reduce(
      (value, [key, replacement]) => value.replace(`{${key}}`, replacement),
      t(result.detailKey),
    )
  }

  const groupedResults = useMemo(
    () => groups.map((group) => ({
      group,
      items: results.filter((result) => result.group === group),
    })).filter((section) => section.items.length > 0),
    [results]
  )

  return (
    <div ref={wrapperRef} className="relative w-full min-w-0">
      <label htmlFor="app-search" className="sr-only">{t('search.label')}</label>
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
          placeholder={t('search.placeholder')}
          className="w-full min-w-0 rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
        />
      </div>

      {open && trimmedQuery.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 min-w-0 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {trimmedQuery.length < 2 ? (
            <div className="px-4 py-3 text-sm text-slate-500">{t('search.minChars')}</div>
          ) : loading ? (
            <div className="px-4 py-3 text-sm text-slate-500">{t('search.loading')}</div>
          ) : error ? (
            <div className="px-4 py-3 text-sm text-red-700">{t('search.failed')}</div>
          ) : groupedResults.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-500">{t('search.noResults')}</div>
          ) : (
            <div className="py-2">
              {groupedResults.map((section) => (
                <div key={section.group} className="py-1">
                  <div className="px-4 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t(groupLabelKeys[section.group])}
                  </div>
                  {section.items.map((result) => (
                    <Link
                      key={result.id}
                      href={result.href}
                      className="block px-4 py-2 text-sm hover:bg-slate-50"
                      onClick={() => setOpen(false)}
                    >
                      <span className="block font-medium text-slate-900">{result.titleKey ? t(result.titleKey) : result.title}</span>
                      <span className="block text-xs text-slate-500">{renderDetail(result)}</span>
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
