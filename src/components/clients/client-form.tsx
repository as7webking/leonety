'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddressAutocomplete } from '@/components/address-autocomplete'
import { AppSelect } from '@/components/app-select'
import { CountrySelector } from '@/components/country-selector'
import { Button } from '@/components/ui/button'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { useAccountAccess } from '@/hooks/use-account-access'
import { clientToForm, emptyClientForm, type ClientFormValues, type ClientRecord } from '@/lib/client-crm'
import { formatCountryValue, resolveCountryCode } from '@/lib/countries'
import { createClient } from '@/lib/supabase-client'

interface ClientFormProps {
  client?: ClientRecord
  onSaved?: (clientId: string) => void
  onCancel?: () => void
}

const FREE_CLIENT_LIMIT = 25

export function ClientForm({ client, onSaved, onCancel }: ClientFormProps) {
  const router = useRouter()
  const { currentCompany } = useCompany()
  const { locale, t } = useI18n()
  const [supabase] = useState(() => createClient())
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const { accountAccess } = useAccountAccess(accountEmail)
  const [form, setForm] = useState<ClientFormValues>(() => client ? clientToForm(client) : emptyClientForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setAccountEmail(data.user?.email ?? null)
    })
    return () => { cancelled = true }
  }, [supabase])

  const setField = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    setError('')

    if (!currentCompany) {
      setError(t('common.noWorkspaceSelected'))
      return
    }
    if (form.clientType === 'person' && !form.name.trim()) {
      setError(t('clients.validation.nameRequired'))
      return
    }
    if (form.clientType === 'company' && !form.client_company.trim()) {
      setError(t('clients.validation.companyRequired'))
      return
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError(t('clients.validation.emailInvalid'))
      return
    }

    if (!client && accountAccess.plan !== 'pro' && !accountAccess.isAdmin) {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
      const { count, error: usageError } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', currentCompany.id)
        .gte('created_at', monthStart)
        .lt('created_at', nextMonth)
      if (usageError) {
        setError(t('clients.saveFailed'))
        return
      }
      if ((count ?? 0) >= FREE_CLIENT_LIMIT) {
        setError(t('clients.freeLimitReached'))
        return
      }
    }

    setSaving(true)
    const payload = {
      company_id: currentCompany.id,
      name: form.name.trim() || form.client_company.trim(),
      client_company: form.clientType === 'company' ? form.client_company.trim() || null : null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      street: form.street.trim() || null,
      house_number: form.house_number.trim() || null,
      postal_code: form.postal_code.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      tax_number: form.tax_number.trim() || null,
      interested_in: form.interested_in.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
      updated_at: new Date().toISOString(),
    }

    const save = async (value: Record<string, unknown>) => client
      ? await supabase.from('clients').update(value).eq('id', client.id).eq('company_id', currentCompany.id).select('id').single()
      : await supabase.from('clients').insert(value).select('id').single()

    let result = await save(payload)
    if (result.error && ['42703', 'PGRST204', 'PGRST205'].includes(result.error.code ?? '')) {
      const { street, house_number, postal_code, city, country, tax_number, ...basicPayload } = payload
      void street
      void house_number
      void postal_code
      void city
      void country
      void tax_number
      result = await save(basicPayload)
    }

    setSaving(false)
    if (result.error || !result.data) {
      setError(t('clients.saveFailed'))
      return
    }

    if (onSaved) onSaved(String(result.data.id))
    else router.push(`/app/clients/${result.data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</div>}

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-800">{t('clients.crm.clientType')}</span>
          <AppSelect
            value={form.clientType}
            onChange={(value) => setField('clientType', value as ClientFormValues['clientType'])}
            options={[
              { value: 'person', label: t('clients.crm.person') },
              { value: 'company', label: t('clients.crm.company') },
            ]}
          />
        </label>
        {form.clientType === 'company' && (
          <label className="min-w-0 space-y-1">
            <span className="text-sm font-medium text-slate-800">{t('clients.clientCompany')}</span>
            <input value={form.client_company} onChange={(event) => setField('client_company', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" required />
          </label>
        )}
        <label className="min-w-0 space-y-1">
          <span className="text-sm font-medium text-slate-800">{form.clientType === 'company' ? t('clients.crm.contactPersonOptional') : t('clients.name')}</span>
          <input value={form.name} onChange={(event) => setField('name', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" required={form.clientType === 'person'} />
        </label>
        <label className="min-w-0 space-y-1">
          <span className="text-sm font-medium text-slate-800">{t('clients.email')}</span>
          <input type="email" inputMode="email" value={form.email} onChange={(event) => setField('email', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
        </label>
        <label className="min-w-0 space-y-1">
          <span className="text-sm font-medium text-slate-800">{t('clients.phone')}</span>
          <input type="tel" inputMode="tel" value={form.phone} onChange={(event) => setField('phone', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
        </label>
        <div className="md:col-span-2">
          <AddressAutocomplete
            country={formatCountryValue(form.country, locale)}
            onSelect={(address) => setForm((current) => ({
              ...current,
              street: address.street || current.street,
              house_number: address.houseNumber || current.house_number,
              postal_code: address.postalCode || current.postal_code,
              city: address.city || current.city,
              country: resolveCountryCode(address.country) || address.country || current.country,
            }))}
          />
        </div>
        <label className="min-w-0 space-y-1">
          <span className="text-sm font-medium text-slate-800">{t('clients.street')}</span>
          <input value={form.street} onChange={(event) => setField('street', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
        </label>
        <label className="min-w-0 space-y-1">
          <span className="text-sm font-medium text-slate-800">{t('clients.houseNumber')}</span>
          <input value={form.house_number} onChange={(event) => setField('house_number', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
        </label>
        <label className="min-w-0 space-y-1">
          <span className="text-sm font-medium text-slate-800">{t('clients.postalCode')}</span>
          <input inputMode="numeric" value={form.postal_code} onChange={(event) => setField('postal_code', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
        </label>
        <label className="min-w-0 space-y-1">
          <span className="text-sm font-medium text-slate-800">{t('clients.city')}</span>
          <input value={form.city} onChange={(event) => setField('city', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
        </label>
        <CountrySelector label={t('clients.country')} value={form.country} onChange={(value) => setField('country', value)} />
        <label className="min-w-0 space-y-1">
          <span className="text-sm font-medium text-slate-800">{t('clients.taxNumber')}</span>
          <input value={form.tax_number} onChange={(event) => setField('tax_number', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-800">{t('clients.status')}</span>
          <AppSelect
            value={form.status === 'client' ? 'active' : form.status === 'inactive' ? 'inactive' : 'potential'}
            onChange={(value) => setField('status', value === 'active' ? 'client' : value === 'inactive' ? 'inactive' : 'lead')}
            options={[
              { value: 'active', label: t('clients.lifecycleActive') },
              { value: 'potential', label: t('clients.lifecyclePotential') },
              { value: 'inactive', label: t('clients.lifecycleInactive') },
            ]}
          />
        </label>
        <label className="min-w-0 space-y-1">
          <span className="text-sm font-medium text-slate-800">{t('clients.interestedIn')}</span>
          <input value={form.interested_in} onChange={(event) => setField('interested_in', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
        </label>
        <label className="min-w-0 space-y-1 md:col-span-2">
          <span className="text-sm font-medium text-slate-800">{t('clients.notes')}</span>
          <textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} className="min-h-32 w-full rounded-md border border-slate-300 px-3 py-2.5 text-base" />
        </label>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
        <Button type="button" variant="outline" onClick={() => onCancel ? onCancel() : router.push(client ? `/app/clients/${client.id}` : '/app/clients')} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? t('common.loading') : client ? t('common.saveChanges') : t('clients.crm.createClient')}
        </Button>
      </div>
    </form>
  )
}
