'use client'

import Link from 'next/link'
import { Bell, BriefcaseBusiness, Building2, UserRound } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components'
import { WorkspaceSettingsPanel } from '@/components/settings/workspace-settings-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'

export default function SettingsPage() {
  const { currentCompany } = useCompany()
  const { t } = useI18n()

  return (
    <PageContainer>
      <PageHeader title={t('settings.title')} description={t('settings.description')} />

      <div className="space-y-6">
        <WorkspaceSettingsPanel />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.connectedServices')}</CardTitle>
              <CardDescription>{t('settings.connectedServicesDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {currentCompany?.type === 'business' && (
                <Button asChild variant="outline"><Link href="/app/settings/integrations"><BriefcaseBusiness className="mr-2 h-4 w-4" />{t('settings.openIntegrations')}</Link></Button>
              )}
              <Button asChild variant="outline"><Link href="/app/settings/notifications"><Bell className="mr-2 h-4 w-4" />{t('settings.openNotifications')}</Link></Button>
              <Button asChild variant="outline"><Link href="/app/workspaces"><Building2 className="mr-2 h-4 w-4" />{t('settings.manageWorkspaces')}</Link></Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.accountProfile')}</CardTitle>
              <CardDescription>{t('settings.accountProfileDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline"><Link href="/app/profile"><UserRound className="mr-2 h-4 w-4" />{t('settings.openProfile')}</Link></Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}
