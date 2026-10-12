'use client'

import { Mail } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'
import { MailClient } from '@/components/mail/mail-client'

export default function MailPage() {
  const { currentCompany } = useCompany()
  const { t } = useI18n()
  return <PageContainer>
    <PageHeader title={t('mail.title')} description={t('mail.description')}>
      <Mail className="h-5 w-5" aria-hidden="true" />
    </PageHeader>
    {currentCompany?.id ? <MailClient key={currentCompany.id} companyId={currentCompany.id} /> : <p className="text-sm text-muted-foreground">{t('common.noWorkspaceSelected')}</p>}
  </PageContainer>
}
