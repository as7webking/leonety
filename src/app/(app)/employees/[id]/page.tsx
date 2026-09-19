'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Building2, CalendarDays, Edit } from 'lucide-react'
import { EmptyState, LoadingSkeleton, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { EmployeeDocumentManager } from '@/components/employees/employee-document-manager'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { formatCurrency } from '@/lib/currency'
import { employeeProfileColumns, isGermanyEmployeeProfile, type EmployeeProfile } from '@/lib/employee-profile'
import { getIntlLocale } from '@/lib/i18n'
import { createClient } from '@/lib/supabase-client'

function Value({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return <div><dt className="text-xs font-medium uppercase text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-900">{value}</dd></div>
}

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>()
  const { currentCompany, loading: companyLoading } = useCompany()
  const { locale, t } = useI18n()
  const [supabase] = useState(() => createClient())
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    if (!currentCompany || !params.id) return
    setLoading(true)
    const { data, error: loadError } = await supabase.from('employees').select(employeeProfileColumns).eq('id', params.id).eq('company_id', currentCompany.id).maybeSingle()
    setEmployee(data as EmployeeProfile | null)
    setError(loadError ? t('employees.profile.loadFailed') : '')
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

  const date = (value: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString(getIntlLocale(locale)) : null
  const money = (value: number | null) => value === null ? null : formatCurrency(value, employee.compensation_currency ?? currentCompany.currency ?? 'EUR', getIntlLocale(locale))
  const countryName = employee.country_code
    ? new Intl.DisplayNames([getIntlLocale(locale)], { type: 'region' }).of(employee.country_code) ?? employee.country_code
    : null
  const showGermanyExtension = isGermanyEmployeeProfile(employee)
  const section = (title: string, children: React.ReactNode) => <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent><dl className="grid gap-5 sm:grid-cols-2">{children}</dl></CardContent></Card>

  return (
    <PageContainer>
      <Button asChild variant="ghost" size="sm" className="mb-4"><Link href="/app/employees"><ArrowLeft />{t('employees.profile.back')}</Link></Button>
      <PageHeader title={employee.name} description={`${employee.job_title} · ${currentCompany.name}`}>
        <Button asChild variant="outline"><Link href="/app/shifts"><CalendarDays />{t('shifts.title')}</Link></Button>
        <Button asChild><Link href={`/app/employees/${employee.id}/edit`}><Edit />{t('common.edit')}</Link></Button>
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-2">
        {section(t('employees.profile.personal'), <><Value label={t('employees.profile.firstName')} value={employee.first_name} /><Value label={t('employees.profile.lastName')} value={employee.last_name} /><Value label={t('employees.profile.birthDate')} value={date(employee.birth_date)} /><Value label={t('employees.profile.birthPlace')} value={employee.birth_place} /><Value label={t('employees.profile.birthCountry')} value={employee.birth_country} /><Value label={t('employees.profile.nationality')} value={employee.nationality} /></>)}
        {section(t('employees.profile.contact'), <><Value label={t('employees.email')} value={employee.email} /><Value label={t('employees.phone')} value={employee.phone} /></>)}
        {section(t('employees.profile.address'), <><Value label={t('employees.profile.street')} value={[employee.street, employee.house_number].filter(Boolean).join(' ')} /><Value label={t('employees.profile.city')} value={[employee.postal_code, employee.city].filter(Boolean).join(' ')} /><Value label={t('employees.profile.country')} value={countryName} /></>)}
        {section(t('employees.profile.employment'), <><Value label={t('employees.jobTitle')} value={employee.job_title} /><Value label={t('employees.profile.startDate')} value={date(employee.employment_start_date)} /><Value label={t('employees.employmentType')} value={t(`employees.type.${employee.employment_type}`)} /><Value label={t('employees.status')} value={t(`employees.status.${employee.status}`)} /><Value label={t('employees.profile.term')} value={employee.is_permanent ? t('employees.profile.permanent') : `${t('employees.profile.fixedUntil')}: ${date(employee.fixed_term_end_date)}`} /></>)}
        {section(t('employees.profile.compensation'), <><Value label={t('employees.profile.hoursPerWeek')} value={employee.hours_per_week} /><Value label={t('employees.profile.compensationType')} value={employee.compensation_type ? t(`employees.profile.compensation.${employee.compensation_type}`) : null} /><Value label={t('employees.profile.hourlyWage')} value={money(employee.hourly_wage)} /><Value label={t('employees.profile.fixedSalary')} value={money(employee.fixed_salary)} /><Value label={t('employees.profile.annualVacation')} value={employee.annual_vacation_days} /></>)}
        {showGermanyExtension && section(t('employees.profile.countrySpecific'), <><Value label={t('employees.profile.taxId')} value={employee.tax_id} /><Value label={t('employees.profile.taxClass')} value={employee.tax_class} /><Value label={t('employees.profile.socialSecurityNumber')} value={employee.social_security_number} /><Value label={t('employees.profile.healthInsurance')} value={employee.health_insurance_provider} />{employee.employment_type === 'minijob' && <><Value label={t('employees.profile.minijobFlatTax')} value={employee.minijob_flat_tax_2_percent ? t('employees.profile.yes') : t('employees.profile.no')} /><Value label={t('employees.profile.pensionExemption')} value={employee.pension_insurance_exemption ? t('employees.profile.yes') : t('employees.profile.no')} /></>}</>)}
        {employee.notes && <div className="lg:col-span-2">{section(t('employees.notes'), <Value label={t('employees.notes')} value={<span className="whitespace-pre-wrap">{employee.notes}</span>} />)}</div>}
        <div className="lg:col-span-2"><EmployeeDocumentManager companyId={currentCompany.id} employeeId={employee.id} countryCode={employee.country_code} jobTitle={employee.job_title} /></div>
      </div>
    </PageContainer>
  )
}
