'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { MailboxSettings } from '@/components/mail/mailbox-settings'
import { useI18n } from '@/contexts/i18n-context'
import { useCompany } from '@/contexts/company-context'

export default function MailboxSettingsPage() {
  const { t } = useI18n()
  const { currentCompany } = useCompany()
  return <PageContainer>
    <Button asChild variant="ghost" size="sm" className="mb-3"><Link href="/app/settings"><ArrowLeft className="mr-2 h-4 w-4" />{t('settings.title')}</Link></Button>
    <PageHeader title={t('mail.settingsTitle')} description={t('mail.settingsDescription')} />
    {currentCompany?.id ? <MailboxSettings key={currentCompany.id} /> : <p className="text-sm text-muted-foreground">{t('common.noWorkspaceSelected')}</p>}
  </PageContainer>
}
