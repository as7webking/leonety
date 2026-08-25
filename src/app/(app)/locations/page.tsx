'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, Building2, Edit, MapPin, Plus, Trash2 } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { createClient } from '@/lib/supabase-client'

interface Location {
  id: string
  company_id: string
  name: string
  address: string | null
  city: string
  country: string
  notes: string | null
}

const emptyForm = { name: '', address: '', city: '', country: '', notes: '' }

export default function LocationsPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null)

  const loadLocations = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: loadError } = await supabase.from('locations').select('*').eq('company_id', currentCompany.id).order('name')
    if (loadError) {
      setError(loadError.code === '42P01' ? t('modules.databaseRequired') : loadError.message)
      setLocations([])
    } else {
      setLocations((data ?? []) as Location[])
    }
    setLoading(false)
  }, [currentCompany, supabase, t])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadLocations()
    })
    return () => { cancelled = true }
  }, [loadLocations])

  const resetForm = () => {
    setForm(emptyForm)
    setEditing(null)
    setShowForm(false)
  }

  const handleEdit = (location: Location) => {
    setEditing(location)
    setForm({
      name: location.name,
      address: location.address ?? '',
      city: location.city,
      country: location.country,
      notes: location.notes ?? '',
    })
    setShowForm(true)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany) return
    setMessage('')
    setError('')

    if (!form.name.trim() || !form.city.trim() || !form.country.trim()) {
      setError(t('locations.required'))
      return
    }

    const payload = {
      company_id: currentCompany.id,
      name: form.name.trim(),
      address: form.address.trim() || null,
      city: form.city.trim(),
      country: form.country.trim(),
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const result = editing
      ? await supabase.from('locations').update(payload).eq('id', editing.id).eq('company_id', currentCompany.id)
      : await supabase.from('locations').insert(payload)

    if (result.error) {
      setError(result.error.message)
      return
    }
    setMessage(editing ? t('locations.updated') : t('locations.created'))
    resetForm()
    await loadLocations()
  }

  const handleDelete = async () => {
    if (!currentCompany || !deleteTarget) return
    const { error: deleteError } = await supabase.from('locations').delete().eq('id', deleteTarget.id).eq('company_id', currentCompany.id)
    setDeleteTarget(null)
    if (deleteError) {
      setError(deleteError.code === '23503' ? t('locations.deleteBlocked') : deleteError.message)
      return
    }
    setMessage(t('locations.deleted'))
    await loadLocations()
  }

  if (companyLoading || loading) return <PageContainer><PageHeader title={t('locations.title')} /><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/onboarding') }} /></PageContainer>
  if (currentCompany.type !== 'business') return <PageContainer><PageHeader title={t('locations.title')} /><EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} /></PageContainer>

  return (
    <PageContainer>
      <PageHeader title={t('locations.title')} description={`${t('locations.description')} · ${currentCompany.name}`}>
        <Button onClick={() => showForm ? resetForm() : setShowForm(true)}><Plus className="h-4 w-4" />{showForm ? t('common.cancel') : t('locations.add')}</Button>
      </PageHeader>

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {showForm && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{editing ? t('locations.edit') : t('locations.add')}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1"><span className="text-sm font-medium">{t('locations.name')}</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border px-3 py-2" required /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('locations.address')}</span><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('locations.city')}</span><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full rounded-md border px-3 py-2" required /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('locations.country')}</span><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full rounded-md border px-3 py-2" required /></label>
              <label className="space-y-1 md:col-span-2"><span className="text-sm font-medium">{t('locations.notes')}</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-24 w-full rounded-md border px-3 py-2" /></label>
              <div className="flex gap-2 md:col-span-2"><Button type="submit">{t('common.save')}</Button><Button type="button" variant="outline" onClick={resetForm}>{t('common.cancel')}</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      {locations.length === 0 ? (
        <EmptyState icon={MapPin} title={t('locations.empty')} description={t('locations.emptyDescription')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {locations.map((location) => (
            <Card key={location.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="font-semibold">{location.name}</h2><p className="text-sm text-slate-500">{location.city}, {location.country}</p></div>
                  <MapPin className="h-5 w-5 text-slate-400" />
                </div>
                {location.address && <p className="mt-3 text-sm text-slate-600">{location.address}</p>}
                {location.notes && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{location.notes}</p>}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(location)}><Edit className="h-4 w-4" />{t('common.edit')}</Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteTarget(location)}><Trash2 className="h-4 w-4" />{t('common.delete')}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog open={Boolean(deleteTarget)} title={t('common.confirmDelete')} description={t('locations.deleteConfirm')} confirmLabel={t('common.deleteAnyway')} cancelLabel={t('common.cancel')} destructive onCancel={() => setDeleteTarget(null)} onConfirm={() => void handleDelete()} />
    </PageContainer>
  )
}
