'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components'
import { WorkspaceLegalSettings } from '@/components/settings/workspace-legal-settings'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/contexts/i18n-context'

export default function WorkspaceLegalSettingsPage() {
  const { t } = useI18n()

  return (
    <PageContainer>
      <div className="mb-4">
        <Button asChild variant="ghost" className="h-auto min-h-10 max-w-full whitespace-normal px-2 text-left">
          <Link href="/app/settings"><ArrowLeft className="h-4 w-4" />{t('nav.settings')}</Link>
        </Button>
      </div>
      <PageHeader title={t('workspaceLegal.settingsTitle')} description={t('workspaceLegal.settingsDescription')} />
      <WorkspaceLegalSettings />
    </PageContainer>
  )
}
