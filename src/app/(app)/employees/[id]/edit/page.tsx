'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Building2 } from 'lucide-react'
import { EmployeeProfileForm } from '@/components/employees/employee-profile-form'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { employeeProfileColumns, employeeProfileColumnsWithNumber, type EmployeeProfile } from '@/lib/employee-profile'
import { createClient } from '@/lib/supabase-client'
import { isEmployeeNumberSchemaUnavailable } from '@/lib/employee-number'

export default function EditEmployeePage() {
  const params = useParams<{ id: string }>()
  const { currentCompany, loading: companyLoading } = useCompany()
  const { t } = useI18n()
  const [supabase] = useState(() => createClient())
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!currentCompany || !params.id) return
    setLoading(true)
    let result = await supabase.from('employees').select(employeeProfileColumnsWithNumber).eq('id', params.id).eq('company_id', currentCompany.id).maybeSingle()
    if (isEmployeeNumberSchemaUnavailable(result.error)) result = await supabase.from('employees').select(employeeProfileColumns).eq('id', params.id).eq('company_id', currentCompany.id).maybeSingle()
    const row = result.data as unknown as Record<string, unknown> | null
    setEmployee(row ? { ...row, employee_number: typeof row.employee_number === 'string' ? row.employee_number : null } as unknown as EmployeeProfile : null)
    setError(result.error ? t('employees.profile.loadFailed') : '')
    setLoading(false)
  }, [currentCompany, params.id, supabase, t])
  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [load])
  if (companyLoading || loading) return <PageContainer><LoadingSkeleton /></PageContainer>
  if (!currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} /></PageContainer>
  if (error || !employee) return <PageContainer><EmptyState title={t('employees.profile.notFound')} description={error} /></PageContainer>
  return <PageContainer><Button asChild variant="ghost" size="sm" className="mb-4"><Link href={`/app/employees/${employee.id}`}><ArrowLeft />{t('employees.profile.backToProfile')}</Link></Button><PageHeader title={t('employees.edit')} description={employee.name} /><EmployeeProfileForm key={`${currentCompany.id}:${employee.id}`} companyId={currentCompany.id} currency={currentCompany.currency} employee={employee} /></PageContainer>
}
