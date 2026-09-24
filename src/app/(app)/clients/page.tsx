'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, Building2, ChevronLeft, ChevronRight, FileSignature, FileText, FileUp, Search, UserRoundPlus, X } from 'lucide-react'
import { DesktopPageUtilities, EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { useAccountAccess } from '@/hooks/use-account-access'
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock'
import { formatCurrencyGroups, type ClientRecord } from '@/lib/client-crm'
import { getFilteredClientTotal, normalizeClientStatusFilter, planClientPage, type ClientStatusFilter, type ClientStatusGroup } from '@/lib/client-status-filter'
import { buildClientInvoicesHref } from '@/lib/client-invoice-navigation'
import { getIntlLocale } from '@/lib/i18n'
import { createClient } from '@/lib/supabase-client'

const PAGE_SIZE = 20
const FREE_CLIENT_LIMIT = 25

type ClientSort = 'name' | 'newest' | 'activity'

interface ClientMetrics {
  invoiceCount: number
  contractCount: number
  paid: Record<string, number>
  unpaid: Record<string, number>
  lastActivity: string | null
}

interface ImportRow {
  name: string
  email: string
  phone: string
  client_company: string
  source: 'csv' | 'google_contacts'
  external_id: string
  duplicate: boolean
}

function sanitizeSearch(value: string) {
  return value.replace(/[,()%]/g, ' ').trim().slice(0, 100)
}

function normalizePhone(value: string | null | undefined) {
  return String(value ?? '').replace(/[^\d+]/g, '')
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"' && line[index + 1] === '"') {
      current += '"'
      index += 1
    } else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) {
      values.push(current.trim())
      current = ''
    } else current += char
  }
  values.push(current.trim())
  return values
}

function parseImportFile(text: string, isVcard: boolean): ImportRow[] {
  if (isVcard) {
    return text.split(/END:VCARD/i).map((card) => {
      const row: ImportRow = { name: '', email: '', phone: '', client_company: '', source: 'csv', external_id: '', duplicate: false }
      for (const line of card.split(/\r?\n/)) {
        const separator = line.indexOf(':')
        if (separator < 0) continue
        const key = line.slice(0, separator).split(';')[0].toLowerCase()
        const value = line.slice(separator + 1).trim()
        if (key === 'fn') row.name = value
        if (key === 'email' && !row.email) row.email = value
        if (key === 'tel' && !row.phone) row.phone = value
        if (key === 'org') row.client_company = value
      }
      return row
    }).filter((row) => row.name || row.email || row.phone)
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase())
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const get = (...names: string[]) => {
      const index = headers.findIndex((header) => names.includes(header))
      return index >= 0 ? values[index] ?? '' : ''
    }
    return {
      name: get('name', 'full name', 'client', 'fn'),
      email: get('email', 'e-mail', 'mail'),
      phone: get('phone', 'telephone', 'tel', 'mobile'),
      client_company: get('company', 'organization', 'org', 'client_company'),
      source: 'csv' as const,
      external_id: get('external_id', 'external id', 'google resource id'),
      duplicate: false,
    }
  }).filter((row) => row.name || row.email || row.phone)
}

export default function ClientsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentCompany, loading: companyLoading } = useCompany()
  const { locale, t } = useI18n()
  const [supabase] = useState(() => createClient())
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const { accountAccess } = useAccountAccess(accountEmail)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [metrics, setMetrics] = useState<Record<string, ClientMetrics>>({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>(() => normalizeClientStatusFilter(searchParams.get('status')))
  const [statusCounts, setStatusCounts] = useState({ active: 0, inactive: 0 })
  const [sort, setSort] = useState<ClientSort>('name')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  useBodyScrollLock(showImport)

  useEffect(() => {
    let cancelled = false
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setAccountEmail(data.user?.email ?? null)
    })
    return () => { cancelled = true }
  }, [supabase])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const nextFilter = normalizeClientStatusFilter(searchParams.get('status'))
    setStatusFilter((current) => current === nextFilter ? current : nextFilter)
    setPage(0)
  }, [searchParams])

  const changeStatusFilter = (nextFilter: ClientStatusFilter) => {
    setStatusFilter(nextFilter)
    setPage(0)
    const params = new URLSearchParams(searchParams.toString())
    if (nextFilter === 'all') params.delete('status')
    else params.set('status', nextFilter)
    const queryString = params.toString()
    router.replace(queryString ? `/app/clients?${queryString}` : '/app/clients', { scroll: false })
  }

  const loadMetrics = useCallback(async (clientRows: ClientRecord[]) => {
    if (!currentCompany || clientRows.length === 0) {
      setMetrics({})
      return
    }
    const ids = clientRows.map((client) => client.id)
    const [invoiceResult, contractResult] = await Promise.all([
      supabase.from('invoices').select('id, client_id, total, currency, status, created_at, issue_date').eq('company_id', currentCompany.id).in('client_id', ids),
      supabase.from('contracts').select('id, client_id, created_at, updated_at').eq('company_id', currentCompany.id).in('client_id', ids),
    ])
    const next = Object.fromEntries(clientRows.map((client) => [client.id, {
      invoiceCount: 0,
      contractCount: 0,
      paid: {},
      unpaid: {},
      lastActivity: client.last_activity_at || client.updated_at || client.created_at,
    }])) as Record<string, ClientMetrics>

    if (!invoiceResult.error) {
      const invoiceIds = (invoiceResult.data ?? []).map((invoice) => invoice.id)
      const paymentResult = invoiceIds.length > 0
        ? await supabase.from('invoice_payments').select('invoice_id, amount, currency').eq('company_id', currentCompany.id).in('invoice_id', invoiceIds)
        : { data: [], error: null }
      const paymentsByInvoice = new Map<string, number>()
      if (!paymentResult.error) {
        for (const payment of paymentResult.data ?? []) {
          paymentsByInvoice.set(payment.invoice_id, (paymentsByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount || 0))
        }
      }
      for (const invoice of invoiceResult.data ?? []) {
        if (!invoice.client_id || !next[invoice.client_id]) continue
        const item = next[invoice.client_id]
        item.invoiceCount += 1
        const amount = Number(invoice.total || 0)
        const allocated = paymentsByInvoice.get(invoice.id)
        const paidAmount = allocated ?? (invoice.status === 'paid' ? amount : 0)
        const unpaidAmount = invoice.status === 'sent' || invoice.status === 'overdue' ? Math.max(0, amount - paidAmount) : 0
        if (paidAmount > 0) item.paid[invoice.currency] = (item.paid[invoice.currency] ?? 0) + paidAmount
        if (unpaidAmount > 0) item.unpaid[invoice.currency] = (item.unpaid[invoice.currency] ?? 0) + unpaidAmount
        const activityDate = invoice.issue_date || invoice.created_at
        if (!item.lastActivity || new Date(activityDate) > new Date(item.lastActivity)) item.lastActivity = activityDate
      }
    }
    if (!contractResult.error) {
      for (const contract of contractResult.data ?? []) {
        if (!contract.client_id || !next[contract.client_id]) continue
        const item = next[contract.client_id]
        item.contractCount += 1
        const activityDate = contract.updated_at || contract.created_at
        if (!item.lastActivity || new Date(activityDate) > new Date(item.lastActivity)) item.lastActivity = activityDate
      }
    }
    setMetrics(next)
  }, [currentCompany, supabase])

  const loadClients = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const search = sanitizeSearch(debouncedQuery)
    const extendedColumns = 'id, company_id, name, email, phone, client_company, street, house_number, postal_code, city, country, tax_number, interested_in, notes, source, external_id, first_contact_at, last_activity_at, status, created_at, updated_at'
    const basicColumns = 'id, company_id, name, email, phone, client_company, interested_in, notes, status, created_at, updated_at'

    const countGroup = async (group: ClientStatusGroup, searchValue: string, extended = true): Promise<number> => {
      let request = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('company_id', currentCompany.id)
      request = group === 'inactive' ? request.eq('status', 'inactive') : request.neq('status', 'inactive')
      if (searchValue) {
        const fields = extended ? ['name', 'client_company', 'email', 'phone', 'tax_number'] : ['name', 'client_company', 'email', 'phone']
        request = request.or(fields.map((field) => `${field}.ilike.%${searchValue}%`).join(','))
      }
      const result = await request
      if (result.error && extended && ['42703', 'PGRST204', 'PGRST205'].includes(result.error.code ?? '')) {
        return countGroup(group, searchValue, false)
      }
      if (result.error) throw result.error
      return result.count ?? 0
    }

    const execute = async (group: ClientStatusGroup, from: number, to: number, extended: boolean) => {
      let request = supabase.from('clients').select(extended ? extendedColumns : basicColumns).eq('company_id', currentCompany.id)
      request = group === 'inactive' ? request.eq('status', 'inactive') : request.neq('status', 'inactive')
      if (search) {
        const fields = extended ? ['name', 'client_company', 'email', 'phone', 'tax_number'] : ['name', 'client_company', 'email', 'phone']
        request = request.or(fields.map((field) => `${field}.ilike.%${search}%`).join(','))
      }
      if (sort === 'name') request = request.order('name', { ascending: true })
      else if (sort === 'activity' && extended) request = request.order('last_activity_at', { ascending: false, nullsFirst: false })
      else request = request.order('created_at', { ascending: false })
      return request.range(from, to)
    }

    try {
      const [activeTotal, inactiveTotal] = await Promise.all([
        countGroup('active', ''),
        countGroup('inactive', ''),
      ])
      setStatusCounts({ active: activeTotal, inactive: inactiveTotal })

      const filteredCounts = search
        ? await Promise.all([countGroup('active', search), countGroup('inactive', search)]).then(([active, inactive]) => ({ active, inactive }))
        : { active: activeTotal, inactive: inactiveTotal }
      const filteredTotal = getFilteredClientTotal(statusFilter, filteredCounts.active, filteredCounts.inactive)
      const safePage = Math.min(page, Math.max(0, Math.ceil(filteredTotal / PAGE_SIZE) - 1))
      if (safePage !== page) {
        setPage(safePage)
        return
      }
      const segments = planClientPage({ filter: statusFilter, activeCount: filteredCounts.active, inactiveCount: filteredCounts.inactive, page: safePage, pageSize: PAGE_SIZE })
      const results = await Promise.all(segments.map(async (segment) => {
        let result = await execute(segment.group, segment.from, segment.to, true)
        if (result.error && ['42703', 'PGRST204', 'PGRST205'].includes(result.error.code ?? '')) {
          result = await execute(segment.group, segment.from, segment.to, false)
        }
        if (result.error) throw result.error
        return result.data ?? []
      }))
      const rows = results.flat().map((row) => ({
        street: null,
        house_number: null,
        postal_code: null,
        city: null,
        country: null,
        tax_number: null,
        source: null,
        external_id: null,
        first_contact_at: null,
        last_activity_at: null,
        ...(row as unknown as Record<string, unknown>),
      })) as ClientRecord[]
      setClients(rows)
      setTotal(filteredTotal)
      await loadMetrics(rows)
    } catch {
      setError(t('clients.crm.loadFailed'))
      setClients([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [currentCompany, debouncedQuery, loadMetrics, page, sort, statusFilter, supabase, t])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadClients()
    })
    return () => { cancelled = true }
  }, [loadClients])

  const markDuplicates = useCallback(async (rows: ImportRow[]) => {
    if (!currentCompany) return rows
    let result = await supabase.from('clients').select('email, phone, external_id').eq('company_id', currentCompany.id)
    if (result.error && ['42703', 'PGRST204', 'PGRST205'].includes(result.error.code ?? '')) {
      result = await supabase.from('clients').select('email, phone').eq('company_id', currentCompany.id) as typeof result
    }
    const emails = new Set((result.data ?? []).map((item) => String(item.email ?? '').trim().toLowerCase()).filter(Boolean))
    const phones = new Set((result.data ?? []).map((item) => normalizePhone(item.phone)).filter(Boolean))
    const externalIds = new Set((result.data ?? []).map((item) => String(item.external_id ?? '')).filter(Boolean))
    return rows.map((row) => ({ ...row, duplicate: Boolean((row.email && emails.has(row.email.trim().toLowerCase())) || (row.phone && phones.has(normalizePhone(row.phone))) || (row.external_id && externalIds.has(row.external_id))) }))
  }, [currentCompany, supabase])

  const readImportFile = async (file: File | null) => {
    if (!file) return
    const rows = parseImportFile(await file.text(), file.name.toLowerCase().endsWith('.vcf') || file.type === 'text/vcard')
    setImportRows(await markDuplicates(rows))
  }

  const importClients = async () => {
    if (!currentCompany || importing) return
    const rows = importRows.filter((row) => !row.duplicate && row.name.trim())
    if (rows.length === 0) return
    if (accountAccess.plan !== 'pro' && !accountAccess.isAdmin) {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
      const { count } = await supabase.from('clients').select('id', { count: 'exact', head: true }).eq('company_id', currentCompany.id).gte('created_at', monthStart).lt('created_at', nextMonth)
      if ((count ?? 0) + rows.length > FREE_CLIENT_LIMIT) {
        setError(t('clients.freeLimitReached'))
        return
      }
    }
    setImporting(true)
    const payload = rows.map((row) => ({
      company_id: currentCompany.id,
      name: row.name.trim(),
      email: row.email.trim() || null,
      phone: row.phone.trim() || null,
      client_company: row.client_company.trim() || null,
      status: 'lead',
      source: row.source,
      external_id: row.external_id || null,
    }))
    let { error: importError } = await supabase.from('clients').insert(payload)
    if (importError && ['42703', 'PGRST204', 'PGRST205'].includes(importError.code ?? '')) {
      const fallback = await supabase.from('clients').insert(payload.map(({ source, external_id, ...row }) => {
        void source
        void external_id
        return row
      }))
      importError = fallback.error
    }
    setImporting(false)
    if (importError) setError(t('clients.importFailed'))
    else {
      setMessage(t('clients.importCompleted').replace('{count}', String(rows.length)))
      setImportRows([])
      setShowImport(false)
      await loadClients()
    }
  }

  const startGoogleContacts = () => {
    if (!currentCompany || googleLoading) return
    setGoogleLoading(true)
    window.location.href = `/api/clients/google-contacts/start?companyId=${encodeURIComponent(currentCompany.id)}`
  }

  const loadGooglePreview = useCallback(async () => {
    if (!currentCompany) return
    setGoogleLoading(true)
    const response = await fetch(`/api/clients/google-contacts/preview?companyId=${encodeURIComponent(currentCompany.id)}`)
    const payload = await response.json().catch(() => ({})) as { contacts?: Array<Record<string, string>> }
    setGoogleLoading(false)
    if (!response.ok) {
      setError(t('clients.googleContactsPreviewFailed'))
      return
    }
    const rows = (payload.contacts ?? []).map((item) => ({
      name: item.name ?? '',
      email: item.email ?? '',
      phone: item.phone ?? '',
      client_company: item.client_company ?? '',
      source: 'google_contacts' as const,
      external_id: item.external_id ?? '',
      duplicate: false,
    }))
    setImportRows(await markDuplicates(rows))
    setShowImport(true)
  }, [currentCompany, markDuplicates, t])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const preview = params.get('googleContacts') === 'preview'
    const authFailed = Boolean(params.get('googleContactsError'))
    void Promise.resolve().then(() => {
      if (preview) void loadGooglePreview()
      if (authFailed) setError(t('clients.googleContactsAuthFailed'))
    })
    if (params.has('googleContacts') || params.has('googleContactsError')) window.history.replaceState(null, '', window.location.pathname)
  }, [loadGooglePreview, t])

  const archive = async (client: ClientRecord) => {
    if (!currentCompany || !window.confirm(t('clients.crm.archiveConfirm'))) return
    const { error: archiveError } = await supabase.from('clients').update({ status: 'inactive', updated_at: new Date().toISOString() }).eq('id', client.id).eq('company_id', currentCompany.id)
    if (archiveError) setError(t('clients.crm.archiveFailed'))
    else await loadClients()
  }

  const restore = async (client: ClientRecord) => {
    if (!currentCompany) return
    const { error: restoreError } = await supabase.from('clients').update({ status: 'client', updated_at: new Date().toISOString() }).eq('id', client.id).eq('company_id', currentCompany.id)
    if (restoreError) setError(t('clients.crm.restoreFailed'))
    else await loadClients()
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const intlLocale = getIntlLocale(locale)
  const activeClients = clients.filter((client) => client.status !== 'inactive')
  const inactiveClients = clients.filter((client) => client.status === 'inactive')
  const allClientCount = statusCounts.active + statusCounts.inactive
  const hasSearch = Boolean(debouncedQuery.trim())
  const emptyState = hasSearch
    ? { title: t('clients.crm.noSearchResults'), description: t('clients.crm.noSearchResultsDescription') }
    : allClientCount === 0
      ? { title: t('clients.crm.noClientsYet'), description: t('clients.crm.noClientsYetDescription') }
      : statusFilter === 'active'
        ? { title: t('clients.crm.noActive'), description: t('clients.crm.noActiveDescription') }
        : statusFilter === 'inactive'
          ? { title: t('clients.crm.noInactive'), description: t('clients.crm.noInactiveDescription') }
          : { title: t('clients.crm.noClientsYet'), description: t('clients.crm.noClientsYetDescription') }

  if (companyLoading) return <PageContainer><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} description={t('dashboard.noWorkspace')} /></PageContainer>
  if (currentCompany.type !== 'business') return <PageContainer><EmptyState icon={Building2} title={t('common.businessOnlyTitle')} description={t('common.businessOnlyDescription')} /></PageContainer>

  return (
    <PageContainer>
      <PageHeader title={t('clients.title')} description={`${t('clients.crm.databaseDescription')} · ${currentCompany.name}`}>
        <div className="flex flex-wrap gap-2 lg:hidden">
          <Button variant="outline" onClick={() => setShowImport(true)}><FileUp className="h-4 w-4" />{t('clients.importClients')}</Button>
          <Button asChild><Link href="/app/clients/new"><UserRoundPlus className="h-4 w-4" />{t('clients.crm.createClient')}</Link></Button>
        </div>
        <Button className="hidden lg:inline-flex" asChild><Link href="/app/clients/new"><UserRoundPlus className="h-4 w-4" />{t('clients.crm.createClient')}</Link></Button>
      </PageHeader>

      <DesktopPageUtilities title={t('pageUtilities.title')}>
        <Button variant="outline" onClick={() => setShowImport(true)}><FileUp className="h-4 w-4" />{t('clients.importClients')}</Button>
      </DesktopPageUtilities>

      <div className="mb-3 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_12rem]">
        <label className="relative min-w-0">
          <span className="sr-only">{t('clients.searchPlaceholder')}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} className="w-full rounded-md border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base" placeholder={t('clients.searchPlaceholder')} />
        </label>
        <AppSelect value={sort} onChange={(value) => { setSort(value as ClientSort); setPage(0) }} options={[{ value: 'name', label: t('clients.crm.sortName') }, { value: 'newest', label: t('clients.crm.sortNewest') }, { value: 'activity', label: t('clients.crm.sortActivity') }]} />
      </div>

      <div className="mb-5 grid w-full grid-cols-3 gap-1 rounded-md border border-slate-200 bg-slate-100 p-1 sm:w-fit" aria-label={t('clients.status')}>
        {(['all', 'active', 'inactive'] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={statusFilter === item}
            onClick={() => changeStatusFilter(item)}
            className={`min-w-0 rounded px-3 py-2 text-sm font-medium transition ${statusFilter === item ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}
          >
            <span className="block truncate">{t(`clients.crm.filter.${item}`)}</span>
            <span className="text-xs tabular-nums text-slate-500">{item === 'all' ? allClientCount : statusCounts[item]}</span>
          </button>
        ))}
      </div>

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {loading ? <LoadingSkeleton /> : clients.length === 0 ? <EmptyState title={emptyState.title} description={emptyState.description} /> : (
        <>
          <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white xl:block">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr>
                <th className="px-4 py-3 font-medium">{t('clients.crm.client')}</th><th className="px-4 py-3 font-medium">{t('clients.crm.contact')}</th><th className="px-4 py-3 font-medium">{t('clients.crm.invoices')}</th><th className="px-4 py-3 font-medium">{t('clients.crm.unpaid')}</th><th className="px-4 py-3 font-medium">{t('clients.crm.paid')}</th><th className="px-4 py-3 font-medium">{t('clients.crm.contracts')}</th><th className="px-4 py-3 font-medium">{t('clients.crm.lastActivity')}</th><th className="px-4 py-3"><span className="sr-only">{t('clients.crm.actions')}</span></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {statusFilter === 'all' && activeClients.length > 0 && <ClientGroupRow label={t('clients.crm.activeSection')} count={statusCounts.active} />}
                {activeClients.map((client) => <ClientRow key={client.id} client={client} metric={metrics[client.id]} locale={intlLocale} fallbackCurrency={currentCompany.currency ?? 'EUR'} t={t} archive={archive} restore={restore} />)}
                {statusFilter === 'all' && inactiveClients.length > 0 && <ClientGroupRow label={t('clients.crm.inactiveSection')} count={statusCounts.inactive} inactive />}
                {inactiveClients.map((client) => <ClientRow key={client.id} client={client} metric={metrics[client.id]} locale={intlLocale} fallbackCurrency={currentCompany.currency ?? 'EUR'} t={t} archive={archive} restore={restore} />)}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 xl:hidden">
            {statusFilter === 'all' && activeClients.length > 0 && <ClientGroupHeading label={t('clients.crm.activeSection')} count={statusCounts.active} />}
            {activeClients.map((client) => <ClientCard key={client.id} client={client} metric={metrics[client.id]} locale={intlLocale} fallbackCurrency={currentCompany.currency ?? 'EUR'} t={t} archive={archive} restore={restore} />)}
            {statusFilter === 'all' && inactiveClients.length > 0 && <ClientGroupHeading label={t('clients.crm.inactiveSection')} count={statusCounts.inactive} inactive />}
            {inactiveClients.map((client) => <ClientCard key={client.id} client={client} metric={metrics[client.id]} locale={intlLocale} fallbackCurrency={currentCompany.currency ?? 'EUR'} t={t} archive={archive} restore={restore} />)}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">{t('clients.crm.pagination').replace('{page}', String(page + 1)).replace('{pages}', String(pageCount)).replace('{total}', String(total))}</p>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft className="h-4 w-4" />{t('clients.crm.previous')}</Button><Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>{t('clients.crm.next')}<ChevronRight className="h-4 w-4" /></Button></div>
          </div>
        </>
      )}

      {showImport && <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 pt-[max(1rem,env(safe-area-inset-top))]" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="client-import-title" className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-md bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b p-4"><div><h2 id="client-import-title" className="text-lg font-semibold">{t('clients.importClients')}</h2><p className="mt-1 text-sm text-slate-500">{t('clients.importDescription')}</p></div><button type="button" className="rounded-md p-2 hover:bg-slate-100" onClick={() => setShowImport(false)} aria-label={t('clients.crm.close')}><X className="h-5 w-5" /></button></div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"><div className="flex flex-wrap gap-2"><input ref={fileInputRef} type="file" accept=".csv,.vcf,text/csv,text/vcard" className="hidden" onChange={(event) => void readImportFile(event.target.files?.[0] ?? null)} /><Button variant="outline" onClick={() => fileInputRef.current?.click()}><FileUp className="h-4 w-4" />{t('common.chooseFile')}</Button><Button variant="outline" onClick={startGoogleContacts} disabled={googleLoading}>{googleLoading ? t('common.loading') : t('clients.googleContactsConnect')}</Button></div>
          {importRows.length > 0 && <div className="overflow-x-auto rounded-md border"><table className="min-w-[600px] w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-3 py-2">{t('clients.name')}</th><th className="px-3 py-2">{t('clients.email')}</th><th className="px-3 py-2">{t('clients.phone')}</th><th className="px-3 py-2">{t('clients.status')}</th></tr></thead><tbody className="divide-y">{importRows.slice(0,100).map((row,index)=><tr key={`${row.email}-${row.phone}-${index}`} className={row.duplicate?'bg-amber-50':''}><td className="px-3 py-2">{row.name||'—'}</td><td className="px-3 py-2">{row.email||'—'}</td><td className="px-3 py-2">{row.phone||'—'}</td><td className="px-3 py-2">{row.duplicate?t('clients.crm.possibleDuplicate'):t('clients.importReady')}</td></tr>)}</tbody></table></div>}
        </div><div className="flex flex-wrap items-center justify-end gap-2 border-t p-4"><Button variant="outline" onClick={() => setShowImport(false)}>{t('common.cancel')}</Button><Button disabled={importing || !importRows.some((row) => !row.duplicate && row.name.trim())} onClick={() => void importClients()}>{importing ? t('common.loading') : t('clients.importSelected')}</Button></div>
      </div></div>}
    </PageContainer>
  )
}

function ClientGroupRow({ label, count, inactive = false }: { label: string; count: number; inactive?: boolean }) {
  return <tr className={inactive ? 'border-t-2 border-slate-300 bg-slate-100' : 'bg-slate-50'}><td colSpan={8} className="px-4 py-2 text-xs font-semibold uppercase text-slate-600"><span>{label}</span><span className="ml-2 font-normal tabular-nums text-slate-500">{count}</span></td></tr>
}

function ClientGroupHeading({ label, count, inactive = false }: { label: string; count: number; inactive?: boolean }) {
  return <div className={`flex items-center gap-2 px-1 pt-1 text-xs font-semibold uppercase text-slate-600 ${inactive ? 'mt-2 border-t-2 border-slate-300 pt-4' : ''}`}><span>{label}</span><span className="font-normal tabular-nums text-slate-500">{count}</span></div>
}

function ClientRow({ client, metric, locale, fallbackCurrency, t, archive, restore }: { client: ClientRecord; metric?: ClientMetrics; locale: string; fallbackCurrency: string; t: (key: string) => string; archive: (client: ClientRecord) => Promise<void>; restore: (client: ClientRecord) => Promise<void> }) {
  const invoiceCount = metric?.invoiceCount ?? 0
  const inactive = client.status === 'inactive'
  return <tr className={inactive ? 'bg-slate-50/80 text-slate-700' : ''}><td className="px-4 py-4"><Link href={`/app/clients/${client.id}`} className={`font-medium hover:text-blue-700 ${inactive ? 'text-slate-700' : 'text-slate-950'}`}>{client.client_company || client.name}</Link>{client.client_company && <p className="mt-1 text-xs text-slate-500">{client.name}</p>}</td><td className="max-w-52 px-4 py-4 text-slate-600"><p className="truncate">{client.email || '—'}</p><p>{client.phone || '—'}</p></td><td className="px-4 py-4">{invoiceCount > 0 ? <Link href={buildClientInvoicesHref(client.id)} className="font-medium text-blue-700 hover:underline" aria-label={`${t('clients.crm.invoices')}: ${client.client_company || client.name}`}>{invoiceCount}</Link> : 0}</td><td className="px-4 py-4 font-medium text-amber-700">{formatCurrencyGroups(metric?.unpaid ?? {}, locale, fallbackCurrency)}</td><td className="px-4 py-4 font-medium text-emerald-700">{formatCurrencyGroups(metric?.paid ?? {}, locale, fallbackCurrency)}</td><td className="px-4 py-4">{metric?.contractCount ?? 0}</td><td className="px-4 py-4 text-slate-600">{metric?.lastActivity ? new Intl.DateTimeFormat(locale).format(new Date(metric.lastActivity)) : '—'}</td><td className="px-4 py-4"><RowActions client={client} t={t} archive={archive} restore={restore} /></td></tr>
}

function ClientCard({ client, metric, locale, fallbackCurrency, t, archive, restore }: { client: ClientRecord; metric?: ClientMetrics; locale: string; fallbackCurrency: string; t: (key: string) => string; archive: (client: ClientRecord) => Promise<void>; restore: (client: ClientRecord) => Promise<void> }) {
  const inactive = client.status === 'inactive'
  return <Card className={inactive ? 'border-slate-200 bg-slate-50/80' : ''}><CardContent className="space-y-4 p-4"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><Link href={`/app/clients/${client.id}`} className={`block truncate font-semibold ${inactive ? 'text-slate-700' : 'text-slate-950'}`}>{client.client_company || client.name}</Link>{client.client_company && <p className="truncate text-sm text-slate-500">{client.name}</p>}</div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{t(`clients.status.${client.status}`)}</span></div><div className="grid grid-cols-2 gap-3 text-sm"><SmallMetric label={t('clients.crm.invoices')} value={String(metric?.invoiceCount ?? 0)} /><SmallMetric label={t('clients.crm.contracts')} value={String(metric?.contractCount ?? 0)} /><SmallMetric label={t('clients.crm.unpaid')} value={formatCurrencyGroups(metric?.unpaid ?? {}, locale, fallbackCurrency)} /><SmallMetric label={t('clients.crm.paid')} value={formatCurrencyGroups(metric?.paid ?? {}, locale, fallbackCurrency)} /></div><div className="min-w-0 text-sm text-slate-600"><p className="truncate">{client.email || '—'}</p><p>{client.phone || '—'}</p><p className="mt-1">{t('clients.crm.lastActivity')}: {metric?.lastActivity ? new Intl.DateTimeFormat(locale).format(new Date(metric.lastActivity)) : '—'}</p></div><RowActions client={client} t={t} archive={archive} restore={restore} /></CardContent></Card>
}

function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-md bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words font-medium text-slate-900">{value}</p></div> }

function RowActions({ client, t, archive, restore }: { client: ClientRecord; t: (key: string) => string; archive: (client: ClientRecord) => Promise<void>; restore: (client: ClientRecord) => Promise<void> }) {
  return <div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><Link href={`/app/clients/${client.id}`}>{t('clients.crm.open')}</Link></Button><Button asChild size="sm" variant="outline"><Link href={buildClientInvoicesHref(client.id, { create: true })}><FileText className="h-4 w-4" /><span className="sr-only">{t('clients.crm.createInvoice')}</span></Link></Button><Button asChild size="sm" variant="outline"><Link href={`/app/contracts/new?clientId=${client.id}`}><FileSignature className="h-4 w-4" /><span className="sr-only">{t('clients.crm.createContract')}</span></Link></Button>{client.status === 'inactive' ? <Button size="sm" variant="outline" onClick={() => void restore(client)}>{t('clients.crm.restore')}</Button> : <Button size="sm" variant="outline" onClick={() => void archive(client)}><Archive className="h-4 w-4" /><span className="sr-only">{t('clients.crm.archive')}</span></Button>}</div>
}
