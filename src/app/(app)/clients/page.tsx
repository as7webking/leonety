'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Edit, Search, Trash2, UserRoundPlus } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppSelect } from '@/components/app-select'
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
  interested_in: string | null
  notes: string | null
  status: ClientStatus
  created_at: string
  updated_at: string | null
}

interface ClientFormState {
  name: string
  phone: string
  interested_in: string
}

const emptyForm: ClientFormState = {
  name: '',
  phone: '',
  interested_in: '',
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

function formatStatus(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function validateClientForm(form: ClientFormState) {
  if (!form.name.trim()) return 'Client name is required.'
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
      const [clientRes, usageRes] = await Promise.all([
        supabase
          .from('clients')
          .select('*')
          .eq('company_id', currentCompany.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', currentCompany.id)
          .gte('created_at', monthRange.start)
          .lt('created_at', monthRange.end),
      ])

      if (clientRes.error) throw clientRes.error
      if (usageRes.error) throw usageRes.error

      setClients((clientRes.data ?? []) as ClientRecord[])
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
      phone: client.phone ?? '',
      interested_in: client.interested_in ?? '',
    })
    setShowForm(true)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage('')
    setErrorMessage('')

    if (!currentCompany) {
      setErrorMessage('Create or select a workspace first.')
      return
    }

    const validationError = validateClientForm(formData)
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    if (!editingClient && !isPro && monthlyUsage >= FREE_CLIENT_LIMIT) {
      setErrorMessage('You have reached the Free plan limit of 25 client records this month. Upgrade to Pro for unlimited client tracking.')
      return
    }

    const payload = {
      company_id: currentCompany.id,
      name: formData.name.trim(),
      phone: formData.phone.trim() || null,
      interested_in: formData.interested_in.trim() || null,
      updated_at: new Date().toISOString(),
    }

    try {
      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', editingClient.id)
          .eq('company_id', currentCompany.id)
        if (error) throw error
        setMessage('Client updated.')
      } else {
        const { error } = await supabase.from('clients').insert({
          ...payload,
          email: null,
          client_company: null,
          notes: null,
          status: 'lead',
        })
        if (error) throw error
        setMessage('Client created.')
      }

      resetForm()
      await loadClients()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save client')
    }
  }

  const handleDelete = async (client: ClientRecord) => {
    if (!currentCompany || !window.confirm(`Delete ${client.name}?`)) return

    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', client.id)
        .eq('company_id', currentCompany.id)

      if (error) throw error
      setMessage('Client deleted.')
      await loadClients()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete client')
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
          action={{ label: t('nav.workspaces'), onClick: () => router.push('/workspaces') }}
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
          {isPro ? 'Pro plan: unlimited client records.' : `Used ${monthlyUsage} of ${FREE_CLIENT_LIMIT} client records this month.`}
          {!isPro && monthlyUsage >= FREE_CLIENT_LIMIT && (
            <Link href="/upgrade" className="ml-2 font-medium text-blue-700 hover:underline">Upgrade to Pro</Link>
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
              { value: 'all', label: 'All statuses' },
              ...statusOptions.map((status) => ({ value: status, label: formatStatus(status) })),
            ]}
          />
        </div>
      </div>

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-green-800">{message}</div>}
      {errorMessage && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
          {errorMessage}
          {errorMessage.includes('Free plan limit') && (
            <Link href="/upgrade" className="ml-2 font-medium underline">Upgrade to Pro</Link>
          )}
        </div>
      )}

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingClient ? t('clients.edit') : t('clients.create')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('clients.name')}</span>
                <input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="w-full rounded-md border px-3 py-2" required />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('clients.phone')}</span>
                <input value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} className="w-full rounded-md border px-3 py-2" placeholder="+49 ..." />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t('clients.interestedIn')}</span>
                <input value={formData.interested_in} onChange={(event) => setFormData({ ...formData, interested_in: event.target.value })} className="w-full rounded-md border px-3 py-2" placeholder="Website, bookkeeping, consulting..." />
              </label>
              <div className="flex gap-2 md:col-span-3">
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
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{formatStatus(client.status)}</span>
                </div>
                <div className="space-y-1 text-sm text-slate-600">
                  {client.email && <p>{client.email}</p>}
                  {client.phone && <p>{client.phone}</p>}
                  {client.interested_in && <p><span className="font-medium">Interested in:</span> {client.interested_in}</p>}
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
