'use client'

import Link from 'next/link'
import { ArrowLeft, Building2 } from 'lucide-react'
import { ClientForm } from '@/components/clients/client-form'
import { EmptyState, PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'

export default function NewClientPage() {
  const { currentCompany, loading } = useCompany()
  const { t } = useI18n()

  if (!loading && !currentCompany) {
    return (
      <PageContainer>
        <EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} description={t('dashboard.noWorkspace')} />
      </PageContainer>
    )
  }
  if (!loading && currentCompany?.type !== 'business') {
    return <PageContainer><EmptyState icon={Building2} title={t('common.businessOnlyTitle')} description={t('common.businessOnlyDescription')} /></PageContainer>
  }

  return (
    <PageContainer>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/clients"><ArrowLeft className="h-4 w-4" />{t('clients.crm.backToClients')}</Link>
        </Button>
      </div>
      <PageHeader title={t('clients.crm.createClient')} description={t('clients.crm.createDescription')} />
      <Card className="mx-auto max-w-4xl">
        <CardContent className="p-4 sm:p-6">
          <ClientForm />
        </CardContent>
      </Card>
    </PageContainer>
  )
}
