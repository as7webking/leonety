'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, Building2, Edit, Search, Trash2, UserPlus } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { createClient } from '@/lib/supabase-client'

const employmentTypes = ['full_time', 'part_time', 'minijob', 'freelance', 'contractor', 'other'] as const
const employeeStatuses = ['active', 'inactive', 'on_leave'] as const

type EmploymentType = typeof employmentTypes[number]
type EmployeeStatus = typeof employeeStatuses[number]

interface Employee {
  id: string
  company_id: string
  name: string
  email: string | null
  phone: string | null
  job_title: string
  employment_type: EmploymentType
  status: EmployeeStatus
  notes: string | null
  created_at: string
}

interface EmployeeForm {
  name: string
  email: string
  phone: string
  job_title: string
  employment_type: EmploymentType
  status: EmployeeStatus
  notes: string
}

const emptyForm: EmployeeForm = {
  name: '',
  email: '',
  phone: '',
  job_title: '',
  employment_type: 'full_time',
  status: 'active',
  notes: '',
}

export default function EmployeesPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState<EmployeeForm>(emptyForm)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | EmployeeStatus>('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)

  const loadEmployees = useCallback(async () => {
    if (!currentCompany) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('employees')
      .select('*')
      .eq('company_id', currentCompany.id)
      .order('name')

    if (loadError) {
      setError(loadError.code === '42P01' ? t('modules.databaseRequired') : loadError.message)
      setEmployees([])
    } else {
      setEmployees((data ?? []) as Employee[])
    }
    setLoading(false)
  }, [currentCompany, supabase, t])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadEmployees()
    })
    return () => { cancelled = true }
  }, [loadEmployees])

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return employees.filter((employee) => (
      (statusFilter === 'all' || employee.status === statusFilter) &&
      (!normalizedQuery || [employee.name, employee.email, employee.phone, employee.job_title]
        .some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery)))
    ))
  }, [employees, query, statusFilter])

  const resetForm = () => {
    setForm(emptyForm)
    setEditing(null)
    setShowForm(false)
  }

  const handleEdit = (employee: Employee) => {
    setEditing(employee)
    setForm({
      name: employee.name,
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      job_title: employee.job_title,
      employment_type: employee.employment_type,
      status: employee.status,
      notes: employee.notes ?? '',
    })
    setShowForm(true)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentCompany) return
    setMessage('')
    setError('')

    if (!form.name.trim() || !form.job_title.trim()) {
      setError(t('employees.required'))
      return
    }

    const payload = {
      company_id: currentCompany.id,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      job_title: form.job_title.trim(),
      employment_type: form.employment_type,
      status: form.status,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const result = editing
      ? await supabase.from('employees').update(payload).eq('id', editing.id).eq('company_id', currentCompany.id)
      : await supabase.from('employees').insert(payload)

    if (result.error) {
      setError(result.error.message)
      return
    }

    setMessage(editing ? t('employees.updated') : t('employees.created'))
    resetForm()
    await loadEmployees()
  }

  const handleDelete = async () => {
    if (!currentCompany || !deleteTarget) return
    const { error: deleteError } = await supabase
      .from('employees')
      .delete()
      .eq('id', deleteTarget.id)
      .eq('company_id', currentCompany.id)

    setDeleteTarget(null)
    if (deleteError) {
      setError(deleteError.code === '23503' ? t('employees.deleteBlocked') : deleteError.message)
      return
    }
    setMessage(t('employees.deleted'))
    await loadEmployees()
  }

  if (companyLoading || loading) {
    return <PageContainer><PageHeader title={t('employees.title')} /><LoadingSkeleton /></PageContainer>
  }

  if (!currentCompany) {
    return (
      <PageContainer>
        <EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/onboarding') }} />
      </PageContainer>
    )
  }

  if (currentCompany.type !== 'business') {
    return (
      <PageContainer>
        <PageHeader title={t('employees.title')} />
        <EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('employees.title')} description={`${t('employees.description')} · ${currentCompany.name}`}>
        <Button onClick={() => showForm ? resetForm() : setShowForm(true)}>
          <UserPlus className="h-4 w-4" />
          {showForm ? t('common.cancel') : t('employees.add')}
        </Button>
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-md border py-2 pl-9 pr-3 text-sm" placeholder={t('employees.search')} />
        </div>
        <AppSelect
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as 'all' | EmployeeStatus)}
          options={[
            { value: 'all', label: t('common.all') },
            ...employeeStatuses.map((status) => ({ value: status, label: t(`employees.status.${status}`) })),
          ]}
        />
      </div>

      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {showForm && (
        <Card className="mb-6">
          <CardHeader><CardTitle>{editing ? t('employees.edit') : t('employees.add')}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1"><span className="text-sm font-medium">{t('employees.name')}</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border px-3 py-2" required /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('employees.jobTitle')}</span><input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} className="w-full rounded-md border px-3 py-2" required /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('employees.email')}</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('employees.phone')}</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-md border px-3 py-2" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('employees.employmentType')}</span><AppSelect value={form.employment_type} onChange={(value) => setForm({ ...form, employment_type: value as EmploymentType })} options={employmentTypes.map((type) => ({ value: type, label: t(`employees.type.${type}`) }))} /></label>
              <label className="space-y-1"><span className="text-sm font-medium">{t('employees.status')}</span><AppSelect value={form.status} onChange={(value) => setForm({ ...form, status: value as EmployeeStatus })} options={employeeStatuses.map((status) => ({ value: status, label: t(`employees.status.${status}`) }))} /></label>
              <label className="space-y-1 md:col-span-2"><span className="text-sm font-medium">{t('employees.notes')}</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-24 w-full rounded-md border px-3 py-2" /></label>
              <div className="flex gap-2 md:col-span-2"><Button type="submit">{t('common.save')}</Button><Button type="button" variant="outline" onClick={resetForm}>{t('common.cancel')}</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      {filteredEmployees.length === 0 ? (
        <EmptyState title={t('employees.empty')} description={t('employees.emptyDescription')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEmployees.map((employee) => (
            <Card key={employee.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><h2 className="font-semibold">{employee.name}</h2><p className="text-sm text-slate-500">{employee.job_title}</p></div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{t(`employees.status.${employee.status}`)}</span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  <p>{t(`employees.type.${employee.employment_type}`)}</p>
                  {employee.email && <p>{employee.email}</p>}
                  {employee.phone && <p>{employee.phone}</p>}
                  {employee.notes && <p className="line-clamp-2">{employee.notes}</p>}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(employee)}><Edit className="h-4 w-4" />{t('common.edit')}</Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteTarget(employee)}><Trash2 className="h-4 w-4" />{t('common.delete')}</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('common.confirmDelete')}
        description={t('employees.deleteConfirm')}
        confirmLabel={t('common.deleteAnyway')}
        cancelLabel={t('common.cancel')}
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />
    </PageContainer>
  )
}
