'use client'

import Link from 'next/link'
import { ArrowLeft, Building2 } from 'lucide-react'
import { EmployeeProfileForm } from '@/components/employees/employee-profile-form'
import { EmptyState, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'

export default function NewEmployeePage() {
  const { currentCompany, loading } = useCompany()
  const { t } = useI18n()
  if (!loading && !currentCompany) return <PageContainer><EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} /></PageContainer>
  if (!loading && currentCompany?.type !== 'business') return <PageContainer><EmptyState icon={Building2} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} /></PageContainer>
  return <PageContainer><Button asChild variant="ghost" size="sm" className="mb-4"><Link href="/app/employees"><ArrowLeft />{t('employees.profile.back')}</Link></Button><PageHeader title={t('employees.profile.createTitle')} description={t('employees.profile.createDescription')} />{currentCompany && <EmployeeProfileForm companyId={currentCompany.id} currency={currentCompany.currency} />}</PageContainer>
}
