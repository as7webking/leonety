'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, Building2, Edit, Eye, Search, Trash2, UserPlus } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { employeeStatuses, type EmployeeStatus, type EmploymentType } from '@/lib/employee-profile'
import { createClient } from '@/lib/supabase-client'

interface EmployeeListItem {
  id: string
  name: string
  first_name: string | null
  last_name: string | null
  job_title: string
  employment_type: EmploymentType
  status: EmployeeStatus
  employment_start_date: string | null
}

export default function EmployeesPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [employees, setEmployees] = useState<EmployeeListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | EmployeeStatus>('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<EmployeeListItem | null>(null)

  const loadEmployees = useCallback(async () => {
    if (!currentCompany) { setLoading(false); return }
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('employees')
      .select('id, name, first_name, last_name, job_title, employment_type, status, employment_start_date')
      .eq('company_id', currentCompany.id)
      .order('name')
    if (loadError) {
      setError(['42703', 'PGRST204'].includes(loadError.code ?? '') ? t('employees.profile.migrationRequired') : t('employees.profile.loadFailed'))
      setEmployees([])
    } else setEmployees((data ?? []) as EmployeeListItem[])
    setLoading(false)
  }, [currentCompany, supabase, t])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) void loadEmployees() })
    return () => { cancelled = true }
  }, [loadEmployees])

  const filteredEmployees = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return employees.filter((employee) => (statusFilter === 'all' || employee.status === statusFilter)
      && (!normalized || [employee.name, employee.first_name, employee.last_name, employee.job_title]
        .some((value) => String(value ?? '').toLowerCase().includes(normalized))))
  }, [employees, query, statusFilter])

  const handleDelete = async () => {
    if (!currentCompany || !deleteTarget) return
    const { error: deleteError } = await supabase.from('employees').delete().eq('id', deleteTarget.id).eq('company_id', currentCompany.id)
    setDeleteTarget(null)
    if (deleteError) {
      setError(deleteError.code === '23503' ? t('employees.deleteBlocked') : t('employees.profile.deleteFailed'))
      return
    }
    setMessage(t('employees.deleted'))
    await loadEmployees()
  }

  if (companyLoading || loading) return <PageContainer><PageHeader title={t('employees.title')} /><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/onboarding') }} /></PageContainer>
  if (currentCompany.type !== 'business') return <PageContainer><PageHeader title={t('employees.title')} /><EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} /></PageContainer>

  return (
    <PageContainer>
      <PageHeader title={t('employees.title')} description={`${t('employees.description')} · ${currentCompany.name}`}>
        <Button asChild><Link href="/app/employees/new"><UserPlus />{t('employees.add')}</Link></Button>
      </PageHeader>
      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full rounded-md border py-2 pl-9 pr-3 text-base sm:text-sm" placeholder={t('employees.search')} /></div>
        <AppSelect value={statusFilter} onChange={(value) => setStatusFilter(value as 'all' | EmployeeStatus)} options={[{ value: 'all', label: t('common.all') }, ...employeeStatuses.map((status) => ({ value: status, label: t(`employees.status.${status}`) }))]} />
      </div>
      {message && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {filteredEmployees.length === 0 ? <EmptyState title={t('employees.empty')} description={t('employees.emptyDescription')} /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredEmployees.map((employee) => (
            <Card key={employee.id}><CardContent className="p-5">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold">{employee.name}</h2><p className="truncate text-sm text-slate-500">{employee.job_title}</p></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs">{t(`employees.status.${employee.status}`)}</span></div>
              <div className="mt-3 space-y-1 text-sm text-slate-600"><p>{t(`employees.type.${employee.employment_type}`)}</p>{employee.employment_start_date && <p>{t('employees.profile.startDate')}: {employee.employment_start_date}</p>}<p>{currentCompany.name}</p></div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline"><Link href={`/app/employees/${employee.id}`}><Eye />{t('employees.profile.open')}</Link></Button>
                <Button asChild size="sm" variant="outline"><Link href={`/app/employees/${employee.id}/edit`}><Edit />{t('common.edit')}</Link></Button>
                <Button size="sm" variant="outline" onClick={() => setDeleteTarget(employee)}><Trash2 />{t('common.delete')}</Button>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
      <ConfirmDialog open={Boolean(deleteTarget)} title={t('common.confirmDelete')} description={t('employees.deleteConfirm')} confirmLabel={t('common.deleteAnyway')} cancelLabel={t('common.cancel')} destructive onCancel={() => setDeleteTarget(null)} onConfirm={() => void handleDelete()} />
    </PageContainer>
  )
}
