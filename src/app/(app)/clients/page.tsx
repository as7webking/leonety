'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Edit, Search, Trash2, UserRoundPlus } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSelect } from '@/components/app-select'
import { AddressAutocomplete } from '@/components/address-autocomplete'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { useAccountAccess } from '@/hooks/use-account-access'
import { createClient } from '@/lib/supabase-client'

const FREE_CLIENT_LIMIT = 25

const statusOptions = [
  'lead',
  'interested',
  'proposal_sent',
  'client',
  'inactive',
] as const

type ClientStatus = typeof statusOptions[number]

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

function validateClientForm(form: ClientFormState, t: (key: string) => string) {
  if (!form.name.trim()) return t('clients.validation.nameRequired')
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return t('clients.validation.emailInvalid')
  return ''
}

export default function ClientsPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const { accountAccess } = useAccountAccess(accountEmail)
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null)
  const [formData, setFormData] = useState<ClientFormState>(emptyForm)
  const [monthlyUsage, setMonthlyUsage] = useState(0)
  const [supportsClientDetails, setSupportsClientDetails] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ClientStatus>('all')
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
        .select('id, company_id, name, email, phone, client_company, street, house_number, postal_code, city, country, tax_number, interested_in, notes, status, created_at, updated_at')
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
      const matchesSearch =
        !normalizedQuery ||
        [client.name, client.email, client.phone, client.client_company, client.interested_in, client.notes]
          .some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery))

      return matchesStatus && matchesSearch
    })
  }, [clients, query, statusFilter])

  const resetForm = () => {
    setFormData(emptyForm)
    setEditingClient(null)
    setShowForm(false)
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
        <Button onClick={() => { setShowForm((value) => !value); setEditingClient(null); setFormData(emptyForm) }}>
          <UserRoundPlus className="h-4 w-4" />
          {showForm ? t('common.cancel') : t('clients.add')}
        </Button>
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
        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px]">
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
        </div>
      </div>

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-green-800">{message}</div>}
      {errorMessage && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
          {errorMessage}
          {errorMessage.includes('Free plan limit') && (
            <Link href="/app/upgrade" className="ml-2 font-medium underline">Upgrade to Pro</Link>
          )}
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
                <input type="email" value={formData.email} onChange={(event) => setFormData({ ...formData, email: event.target.value })} className="w-full rounded-md border px-3 py-2" placeholder="client@example.com" />
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
