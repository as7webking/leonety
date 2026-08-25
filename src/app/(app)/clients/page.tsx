'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Edit, FileUp, Search, Trash2, UserRoundPlus, X } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSelect } from '@/components/app-select'
import { AddressAutocomplete } from '@/components/address-autocomplete'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { useAccountAccess } from '@/hooks/use-account-access'
import { createClient } from '@/lib/supabase-client'
import { getIntlLocale, type Locale } from '@/lib/i18n'

const FREE_CLIENT_LIMIT = 25

const statusOptions = [
  'lead',
  'interested',
  'proposal_sent',
  'client',
  'inactive',
] as const

type ClientStatus = typeof statusOptions[number]
type ClientSource = 'manual' | 'csv' | 'whatsapp' | 'google_contacts' | 'other'

interface ClientRecord {
  id: string
  company_id: string
  name: string
  email: string | null
  phone: string | null
  client_company: string | null
  street: string | null
  house_number: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  tax_number: string | null
  interested_in: string | null
  notes: string | null
  source: ClientSource | null
  external_id: string | null
  first_contact_at: string | null
  last_activity_at: string | null
  status: ClientStatus
  created_at: string
  updated_at: string | null
}

interface ClientFormState {
  name: string
  email: string
  phone: string
  client_company: string
  street: string
  house_number: string
  postal_code: string
  city: string
  country: string
  tax_number: string
  interested_in: string
  notes: string
  status: ClientStatus
}

interface ClientImportRow {
  name: string
  email: string
  phone: string
  client_company: string
  street: string
  house_number: string
  postal_code: string
  city: string
  country: string
  interested_in: string
  notes: string
  status: ClientStatus
  source: ClientSource
  external_id: string
  duplicate: boolean
  duplicateReason: string
}

const emptyForm: ClientFormState = {
  name: '',
  email: '',
  phone: '',
  client_company: '',
  street: '',
  house_number: '',
  postal_code: '',
  city: '',
  country: '',
  tax_number: '',
  interested_in: '',
  notes: '',
  status: 'lead',
}

const sourceOptions: ClientSource[] = ['manual', 'csv', 'whatsapp', 'google_contacts', 'other']

function getMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

function formatStatus(status: string, t: (key: string) => string) {
  return t(`clients.status.${status}`)
}

function formatSource(source: string | null | undefined, t: (key: string) => string) {
  return t(`clients.source.${source || 'manual'}`)
}

function formatClientDate(value: string | null | undefined, locale: Locale) {
  if (!value) return ''
  return new Intl.DateTimeFormat(getIntlLocale(locale), { dateStyle: 'medium' }).format(new Date(value))
}

function validateClientForm(form: ClientFormState, t: (key: string) => string) {
  if (!form.name.trim()) return t('clients.validation.nameRequired')
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return t('clients.validation.emailInvalid')
  return ''
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
    const next = line[index + 1]

    if (char === '"' && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values
}

function mapClientImportRow(row: Record<string, string>): ClientImportRow {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = row[key.toLowerCase()]
      if (value) return value.trim()
    }
    return ''
  }

  return {
    name: get('name', 'full name', 'client', 'fn'),
    email: get('email', 'e-mail', 'mail'),
    phone: get('phone', 'tel', 'telephone', 'mobile'),
    client_company: get('company', 'organization', 'org', 'client_company'),
    street: get('street', 'address', 'address line 1'),
    house_number: get('house number', 'house_number', 'number'),
    postal_code: get('postal code', 'postal_code', 'zip'),
    city: get('city'),
    country: get('country'),
    interested_in: get('interested_in', 'interested in', 'interest'),
    notes: get('notes', 'note'),
    status: 'lead',
    source: 'csv',
    external_id: get('external_id', 'external id', 'google resource id'),
    duplicate: false,
    duplicateReason: '',
  }
}

function mapGoogleContactImportRow(row: Record<string, string>): ClientImportRow {
  return {
    ...mapClientImportRow(row),
    source: 'google_contacts',
    external_id: row.external_id ?? '',
    notes: row.notes || '',
  }
}

function parseCsvClients(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase())

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const row = headers.reduce<Record<string, string>>((result, header, index) => ({
      ...result,
      [header]: values[index] ?? '',
    }), {})
    return mapClientImportRow(row)
  }).filter((row) => row.name || row.phone || row.email)
}

function parseVcfClients(text: string) {
  return text
    .split(/END:VCARD/i)
    .map((card) => {
      const lines = card.split(/\r?\n/)
      const row: Record<string, string> = {}
      for (const line of lines) {
        const separator = line.indexOf(':')
        if (separator === -1) continue
        const rawKey = line.slice(0, separator).split(';')[0].toLowerCase()
        const value = line.slice(separator + 1).trim()
        if (rawKey === 'fn') row.name = value
        if (rawKey === 'tel' && !row.phone) row.phone = value
        if (rawKey === 'email' && !row.email) row.email = value
        if (rawKey === 'org') row.company = value
        if (rawKey === 'note') row.notes = value
      }
      return mapClientImportRow(row)
    })
    .filter((row) => row.name || row.phone || row.email)
}

export default function ClientsPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { locale, t } = useI18n()
  const importFileInputRef = useRef<HTMLInputElement | null>(null)
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const { accountAccess } = useAccountAccess(accountEmail)
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<ClientImportRow[]>([])
  const [importingClients, setImportingClients] = useState(false)
  const [loadingGoogleContacts, setLoadingGoogleContacts] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null)
  const [formData, setFormData] = useState<ClientFormState>(emptyForm)
  const [monthlyUsage, setMonthlyUsage] = useState(0)
  const [supportsClientDetails, setSupportsClientDetails] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | ClientSource>('all')
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const isPro = accountAccess.plan === 'pro' || accountAccess.isAdmin

  const loadClients = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setErrorMessage('')

      const monthRange = getMonthRange()
      const extendedClientQuery = supabase
        .from('clients')
        .select('id, company_id, name, email, phone, client_company, street, house_number, postal_code, city, country, tax_number, interested_in, notes, source, external_id, first_contact_at, last_activity_at, status, created_at, updated_at')
        .eq('company_id', currentCompany.id)
        .order('created_at', { ascending: false })

      let clientRes: {
        data: unknown[] | null
        error: { code?: string; message?: string } | null
      } = await extendedClientQuery

      if (clientRes.error && ['42703', 'PGRST204', 'PGRST205'].includes(clientRes.error.code ?? '')) {
        setSupportsClientDetails(false)
        clientRes = await supabase
          .from('clients')
          .select('id, company_id, name, email, phone, client_company, interested_in, notes, status, created_at, updated_at')
          .eq('company_id', currentCompany.id)
          .order('created_at', { ascending: false })
      } else {
        setSupportsClientDetails(true)
      }

      const [, usageRes] = await Promise.all([
        Promise.resolve(clientRes),
        supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', currentCompany.id)
          .gte('created_at', monthRange.start)
          .lt('created_at', monthRange.end),
      ])

      if (clientRes.error) throw clientRes.error
      if (usageRes.error) throw usageRes.error

      setClients(((clientRes.data ?? []) as ClientRecord[]).map((client) => ({
        ...client,
        street: client.street ?? null,
        house_number: client.house_number ?? null,
        postal_code: client.postal_code ?? null,
        city: client.city ?? null,
        country: client.country ?? null,
        tax_number: client.tax_number ?? null,
        source: client.source ?? null,
        external_id: client.external_id ?? null,
        first_contact_at: client.first_contact_at ?? null,
        last_activity_at: client.last_activity_at ?? null,
      })))
      setMonthlyUsage(usageRes.count ?? 0)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load clients')
    } finally {
      setLoading(false)
    }
  }, [currentCompany, supabase])

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      setAccountEmail(data.user?.email ?? null)
    }

    void loadUser()
  }, [supabase])

  useEffect(() => {
    void loadClients()
  }, [loadClients])

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return clients.filter((client) => {
      const matchesStatus = statusFilter === 'all' || client.status === statusFilter
      const matchesSource = sourceFilter === 'all' || (client.source ?? 'manual') === sourceFilter
      const matchesSearch =
        !normalizedQuery ||
        [client.name, client.email, client.phone, client.client_company, client.interested_in, client.notes, client.source]
          .some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery))

      return matchesStatus && matchesSource && matchesSearch
    })
  }, [clients, query, sourceFilter, statusFilter])

  const resetForm = () => {
    setFormData(emptyForm)
    setEditingClient(null)
    setShowForm(false)
  }

  const markImportDuplicates = useCallback((rows: ClientImportRow[]) => {
    const existingPhones = new Set(clients.map((client) => normalizePhone(client.phone)).filter(Boolean))
    const existingEmails = new Set(clients.map((client) => String(client.email ?? '').trim().toLowerCase()).filter(Boolean))
    const existingExternalIds = new Set(clients.map((client) => String(client.external_id ?? '').trim()).filter(Boolean))
    const seenPhones = new Set<string>()
    const seenEmails = new Set<string>()
    const seenExternalIds = new Set<string>()

    return rows.map((row) => {
      const phone = normalizePhone(row.phone)
      const email = row.email.trim().toLowerCase()
      const externalId = row.external_id.trim()
      const duplicateByPhone = Boolean(phone && (existingPhones.has(phone) || seenPhones.has(phone)))
      const duplicateByEmail = Boolean(email && (existingEmails.has(email) || seenEmails.has(email)))
      const duplicateByExternalId = Boolean(externalId && (existingExternalIds.has(externalId) || seenExternalIds.has(externalId)))

      if (phone) seenPhones.add(phone)
      if (email) seenEmails.add(email)
      if (externalId) seenExternalIds.add(externalId)

      return {
        ...row,
        duplicate: duplicateByPhone || duplicateByEmail || duplicateByExternalId,
        duplicateReason: duplicateByExternalId
          ? t('clients.importDuplicateExternal')
          : duplicateByPhone
            ? t('clients.importDuplicatePhone')
            : duplicateByEmail
              ? t('clients.importDuplicateEmail')
              : '',
      }
    })
  }, [clients, t])

  const loadGoogleContactsPreview = useCallback(async () => {
    if (!currentCompany) return

    setLoadingGoogleContacts(true)
    setErrorMessage('')
    setMessage('')

    try {
      const response = await fetch(`/api/clients/google-contacts/preview?companyId=${encodeURIComponent(currentCompany.id)}`)
      const payload = await response.json().catch(() => ({})) as { contacts?: Array<Record<string, string>>; error?: string }

      if (!response.ok) {
        throw new Error(t('clients.googleContactsPreviewFailed'))
      }

      const rows = (payload.contacts ?? []).map(mapGoogleContactImportRow)
      setImportRows(markImportDuplicates(rows))
      setShowImport(true)
      if (rows.length === 0) {
        setErrorMessage(t('clients.importNoRows'))
      } else {
        setMessage(t('clients.googleContactsPreviewReady').replace('{count}', String(rows.length)))
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('clients.googleContactsPreviewFailed'))
    } finally {
      setLoadingGoogleContacts(false)
    }
  }, [currentCompany, markImportDuplicates, t])

  useEffect(() => {
    if (!currentCompany) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('googleContacts') === 'preview') {
      void loadGoogleContactsPreview()
      window.history.replaceState(null, '', window.location.pathname)
    }
    const googleContactsError = params.get('googleContactsError')
    if (googleContactsError) {
      setErrorMessage(t('clients.googleContactsAuthFailed'))
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [currentCompany, loadGoogleContactsPreview, t])

  const handleGoogleContactsStart = () => {
    if (!currentCompany) return
    window.location.href = `/api/clients/google-contacts/start?companyId=${encodeURIComponent(currentCompany.id)}`
  }

  const handleImportFile = async (file: File | null) => {
    if (!file) return
    setMessage('')
    setErrorMessage('')

    try {
      const text = await file.text()
      const lowerName = file.name.toLowerCase()
      const parsed = lowerName.endsWith('.vcf') || file.type === 'text/vcard'
        ? parseVcfClients(text)
        : parseCsvClients(text)
      setImportRows(markImportDuplicates(parsed))
      if (parsed.length === 0) {
        setErrorMessage(t('clients.importNoRows'))
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('clients.importFailed'))
    }
  }

  const handleImportClients = async () => {
    if (!currentCompany) return
    const rowsToImport = importRows.filter((row) => !row.duplicate && row.name.trim())
    if (rowsToImport.length === 0) {
      setErrorMessage(t('clients.importNoRows'))
      return
    }

    if (!isPro && monthlyUsage + rowsToImport.length > FREE_CLIENT_LIMIT) {
      setErrorMessage(t('clients.freeLimitReached'))
      return
    }

    setImportingClients(true)
    setMessage('')
    setErrorMessage('')

    const payload = rowsToImport.map((row) => ({
      company_id: currentCompany.id,
      name: row.name.trim(),
      email: row.email.trim() || null,
      phone: row.phone.trim() || null,
      client_company: row.client_company.trim() || null,
      interested_in: row.interested_in.trim() || null,
      notes: [row.notes.trim(), t('clients.importSourceNote')].filter(Boolean).join('\n') || null,
      status: row.status,
      ...(supportsClientDetails ? {
        source: row.source,
        external_id: row.external_id.trim() || null,
        street: row.street.trim() || null,
        house_number: row.house_number.trim() || null,
        postal_code: row.postal_code.trim() || null,
        city: row.city.trim() || null,
        country: row.country.trim() || null,
      } : {}),
    }))

    const { error } = await supabase.from('clients').insert(payload)
    setImportingClients(false)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setMessage(t('clients.importCompleted').replace('{count}', String(rowsToImport.length)))
    setImportRows([])
    setShowImport(false)
    await loadClients()
  }

  const handleEdit = (client: ClientRecord) => {
    setEditingClient(client)
    setFormData({
      name: client.name,
      email: client.email ?? '',
      phone: client.phone ?? '',
      client_company: client.client_company ?? '',
      street: client.street ?? '',
      house_number: client.house_number ?? '',
      postal_code: client.postal_code ?? '',
      city: client.city ?? '',
      country: client.country ?? '',
      tax_number: client.tax_number ?? '',
      interested_in: client.interested_in ?? '',
      notes: client.notes ?? '',
      status: client.status,
    })
    setShowForm(true)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    if (!currentCompany) {
      setErrorMessage(t('common.noWorkspaceSelected'))
      return
    }

    const validationError = validateClientForm(formData, t)
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    if (!editingClient && !isPro && monthlyUsage >= FREE_CLIENT_LIMIT) {
      setErrorMessage(t('clients.freeLimitReached'))
      return
    }

    const basePayload = {
      company_id: currentCompany.id,
      name: formData.name.trim(),
      email: formData.email.trim() || null,
      phone: formData.phone.trim() || null,
      client_company: formData.client_company.trim() || null,
      interested_in: formData.interested_in.trim() || null,
      notes: formData.notes.trim() || null,
      status: formData.status,
      updated_at: new Date().toISOString(),
    }
    const detailPayload = supportsClientDetails
      ? {
        street: formData.street.trim() || null,
        house_number: formData.house_number.trim() || null,
        postal_code: formData.postal_code.trim() || null,
        city: formData.city.trim() || null,
        country: formData.country.trim() || null,
        tax_number: formData.tax_number.trim() || null,
      }
      : {}
    const payload = { ...basePayload, ...detailPayload }

    try {
      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', editingClient.id)
          .eq('company_id', currentCompany.id)
        if (error) throw error
        setMessage(t('clients.updated'))
      } else {
        const { error } = await supabase.from('clients').insert({
          ...payload,
        })
        if (error) throw error
        setMessage(t('clients.created'))
      }

      resetForm()
      await loadClients()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('clients.saveFailed'))
    }
  }

  const handleDelete = async (client: ClientRecord) => {
    if (!currentCompany || !window.confirm(t('clients.deleteConfirm').replace('{name}', client.name))) return

    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', client.id)
        .eq('company_id', currentCompany.id)

      if (error) throw error
      setMessage(t('clients.deleted'))
      await loadClients()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('clients.deleteFailed'))
    }
  }

  if (companyLoading || loading) {
    return (
      <PageContainer>
        <PageHeader title={t('clients.title')} description={t('clients.description')} />
        <LoadingSkeleton />
      </PageContainer>
    )
  }

  if (!currentCompany) {
    return (
      <PageContainer>
        <PageHeader title={t('clients.title')} description={t('clients.description')} />
        <EmptyState
          icon={Building2}
          title={t('common.noWorkspaceSelected')}
          description={t('dashboard.noWorkspace')}
          action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/onboarding') }}
        />
      </PageContainer>
    )
  }

  if (currentCompany.type !== 'business') {
    return (
      <PageContainer>
        <PageHeader title={t('clients.title')} description={t('clients.description')} />
        <EmptyState
          icon={Building2}
          title={t('common.businessOnlyTitle')}
          description={t('common.businessOnlyDescription')}
          action={{ label: t('nav.workspaces'), onClick: () => router.push('/app/workspaces') }}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('clients.title')} description={`${t('clients.description')} · ${currentCompany.name}`}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <FileUp className="h-4 w-4" />
            {t('clients.importClients')}
          </Button>
          <Button onClick={() => { setShowForm((value) => !value); setEditingClient(null); setFormData(emptyForm) }}>
            <UserRoundPlus className="h-4 w-4" />
            {showForm ? t('common.cancel') : t('clients.add')}
          </Button>
        </div>
      </PageHeader>

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {isPro
            ? t('clients.proUsage')
            : t('clients.freeUsage').replace('{used}', String(monthlyUsage)).replace('{limit}', String(FREE_CLIENT_LIMIT))}
          {!isPro && monthlyUsage >= FREE_CLIENT_LIMIT && (
            <Link href="/app/upgrade" className="ml-2 font-medium text-blue-700 hover:underline">{t('workspaces.upgradePlan')}</Link>
          )}
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_minmax(10rem,12rem)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
              placeholder={t('clients.searchPlaceholder')}
            />
          </div>
          <AppSelect
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as 'all' | ClientStatus)}
            options={[
              { value: 'all', label: t('clients.allStatuses') },
              ...statusOptions.map((status) => ({ value: status, label: formatStatus(status, t) })),
            ]}
          />
          <AppSelect
            value={sourceFilter}
            onChange={(value) => setSourceFilter(value as 'all' | ClientSource)}
            options={[
              { value: 'all', label: t('clients.allSources') },
              ...sourceOptions.map((source) => ({ value: source, label: formatSource(source, t) })),
            ]}
          />
        </div>
      </div>

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-green-800">{message}</div>}
      {errorMessage && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
          {errorMessage}
          {errorMessage.includes('Free plan limit') && (
            <Link href="/app/upgrade" className="ml-2 font-medium underline">{t('workspaces.upgradePlan')}</Link>
          )}
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="client-import-title" className="flex max-h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[90vh] sm:max-w-4xl sm:rounded-xl">
            <div className="flex items-start justify-between gap-4 border-b p-4">
              <div>
                <h2 id="client-import-title" className="text-xl font-semibold text-slate-950">{t('clients.importClients')}</h2>
                <p className="mt-1 text-sm text-slate-500">{t('clients.importDescription')}</p>
              </div>
              <button type="button" onClick={() => setShowImport(false)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label={t('common.cancel')}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                {t('clients.importPrivacyNote')}
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{t('clients.googleContactsTitle')}</p>
                    <p className="mt-1 text-sm text-slate-500">{t('clients.googleContactsDescription')}</p>
                  </div>
                  <Button type="button" variant="outline" onClick={handleGoogleContactsStart} disabled={loadingGoogleContacts}>
                    {loadingGoogleContacts ? t('common.loading') : t('clients.googleContactsConnect')}
                  </Button>
                </div>
              </div>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".csv,.vcf,text/csv,text/vcard"
                onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)}
                className="hidden"
              />
              <Button type="button" variant="outline" onClick={() => importFileInputRef.current?.click()}>
                <FileUp className="h-4 w-4" />
                {t('common.chooseFile')}
              </Button>
              {importRows.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">{t('clients.name')}</th>
                        <th className="px-3 py-2">{t('clients.phone')}</th>
                        <th className="px-3 py-2">{t('clients.email')}</th>
                        <th className="px-3 py-2">{t('clients.interestedIn')}</th>
                        <th className="px-3 py-2">{t('clients.status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importRows.slice(0, 80).map((row, index) => (
                        <tr key={`${row.name}-${row.phone}-${index}`} className={row.duplicate ? 'bg-amber-50' : 'bg-white'}>
                          <td className="px-3 py-2">{row.name || '-'}</td>
                          <td className="px-3 py-2">{row.phone || '-'}</td>
                          <td className="px-3 py-2">{row.email || '-'}</td>
                          <td className="px-3 py-2">{row.interested_in || '-'}</td>
                          <td className="px-3 py-2">{row.duplicate ? row.duplicateReason : t('clients.importReady')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-between gap-3 border-t bg-white p-4">
              <p className="text-sm text-slate-500">
                {t('clients.importSummary')
                  .replace('{total}', String(importRows.length))
                  .replace('{ready}', String(importRows.filter((row) => !row.duplicate && row.name.trim()).length))}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setShowImport(false)}>{t('common.cancel')}</Button>
                <Button type="button" disabled={importingClients || importRows.filter((row) => !row.duplicate && row.name.trim()).length === 0} onClick={() => void handleImportClients()}>
                  {importingClients ? t('common.loading') : t('clients.importSelected')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingClient ? t('clients.edit') : t('clients.create')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('clients.name')}</span>
                <input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="w-full rounded-md border px-3 py-2" required />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('clients.clientCompany')}</span>
                <input value={formData.client_company} onChange={(event) => setFormData({ ...formData, client_company: event.target.value })} className="w-full rounded-md border px-3 py-2" />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('clients.email')}</span>
                <input type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} className="w-full rounded-md border px-3 py-2" placeholder={t('auth.emailPlaceholder')} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('clients.phone')}</span>
                <input value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} className="w-full rounded-md border px-3 py-2" placeholder="+49 ..." />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('clients.interestedIn')}</span>
                <input value={formData.interested_in} onChange={(event) => setFormData({ ...formData, interested_in: event.target.value })} className="w-full rounded-md border px-3 py-2" placeholder={t('clients.interestedPlaceholder')} />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('clients.status')}</span>
                <AppSelect
                  value={formData.status}
                  onChange={(value) => setFormData({ ...formData, status: value as ClientStatus })}
                  options={statusOptions.map((status) => ({ value: status, label: formatStatus(status, t) }))}
                />
              </label>
              {supportsClientDetails && (
                <>
                  <div className="md:col-span-2 xl:col-span-3">
                    <AddressAutocomplete
                      country={formData.country}
                      onSelect={(suggestion) => setFormData({
                        ...formData,
                        street: suggestion.street || formData.street,
                        house_number: suggestion.houseNumber || formData.house_number,
                        postal_code: suggestion.postalCode || formData.postal_code,
                        city: suggestion.city || formData.city,
                        country: suggestion.country || formData.country,
                      })}
                    />
                  </div>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">{t('clients.street')}</span>
                    <input value={formData.street} onChange={(event) => setFormData({ ...formData, street: event.target.value })} className="w-full rounded-md border px-3 py-2" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">{t('clients.houseNumber')}</span>
                    <input value={formData.house_number} onChange={(event) => setFormData({ ...formData, house_number: event.target.value })} className="w-full rounded-md border px-3 py-2" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">{t('clients.postalCode')}</span>
                    <input value={formData.postal_code} onChange={(event) => setFormData({ ...formData, postal_code: event.target.value })} className="w-full rounded-md border px-3 py-2" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">{t('clients.city')}</span>
                    <input value={formData.city} onChange={(event) => setFormData({ ...formData, city: event.target.value })} className="w-full rounded-md border px-3 py-2" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">{t('clients.country')}</span>
                    <input value={formData.country} onChange={(event) => setFormData({ ...formData, country: event.target.value })} className="w-full rounded-md border px-3 py-2" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium">{t('clients.taxNumber')}</span>
                    <input value={formData.tax_number} onChange={(event) => setFormData({ ...formData, tax_number: event.target.value })} className="w-full rounded-md border px-3 py-2" />
                  </label>
                </>
              )}
              <label className="space-y-1 md:col-span-2 xl:col-span-3">
                <span className="text-sm font-medium">{t('clients.notes')}</span>
                <textarea value={formData.notes} onChange={(event) => setFormData({ ...formData, notes: event.target.value })} className="min-h-24 w-full rounded-md border px-3 py-2" />
              </label>
              {!supportsClientDetails && (
                <p className="text-sm text-amber-700 md:col-span-2 xl:col-span-3">{t('clients.detailsMigrationRequired')}</p>
              )}
              <div className="flex gap-2 md:col-span-2 xl:col-span-3">
                <Button type="submit">{editingClient ? t('common.saveChanges') : t('clients.create')}</Button>
                <Button type="button" variant="outline" onClick={resetForm}>{t('common.cancel')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {filteredClients.length === 0 ? (
        <EmptyState title={t('clients.noClients')} description={t('clients.noClientsDescription')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client) => (
            <Card key={client.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-950">{client.name}</h3>
                    <p className="text-sm text-slate-500">{client.client_company || t('clients.noCompany')}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{formatStatus(client.status, t)}</span>
                </div>
                <div className="space-y-1 text-sm text-slate-600">
                  {client.email && <p>{client.email}</p>}
                  {client.phone && <p>{client.phone}</p>}
                  <p><span className="font-medium">{t('clients.source')}:</span> {formatSource(client.source, t)}</p>
                  {client.source === 'whatsapp' && (
                    <>
                      {client.first_contact_at && <p><span className="font-medium">{t('clients.firstContact')}:</span> {formatClientDate(client.first_contact_at, locale)}</p>}
                      {client.last_activity_at && <p><span className="font-medium">{t('clients.lastActivity')}:</span> {formatClientDate(client.last_activity_at, locale)}</p>}
                    </>
                  )}
                  {(client.street || client.house_number || client.postal_code || client.city || client.country) && (
                    <p>
                      {[client.street, client.house_number, client.postal_code, client.city, client.country].filter(Boolean).join(' ')}
                    </p>
                  )}
                  {client.tax_number && <p>{t('clients.taxNumber')}: {client.tax_number}</p>}
                  {client.interested_in && <p><span className="font-medium">{t('clients.interestedIn')}:</span> {client.interested_in}</p>}
                  {client.notes && <p className="line-clamp-3">{client.notes}</p>}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => handleEdit(client)}>
                    <Edit className="h-4 w-4" />
                    {t('common.edit')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => handleDelete(client)}>
                    <Trash2 className="h-4 w-4" />
                    {t('common.delete')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
