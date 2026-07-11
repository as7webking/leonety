'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BriefcaseBusiness, Building2, Store } from 'lucide-react'
import { EmptyState, PageContainer, PageHeader } from '@/components'
import { AppSelect } from '@/components/app-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCompany } from '@/contexts/company-context'
import { useI18n } from '@/contexts/i18n-context'

const providers = [
  { value: 'woocommerce', label: 'WooCommerce', href: '/app/settings/integrations/woocommerce', status: 'ready' },
  { value: 'shopify', label: 'Shopify', href: '', status: 'planned' },
  { value: 'opencart', label: 'OpenCart', href: '', status: 'planned' },
  { value: 'google_merchant', label: 'Google Merchant / Maps', href: '', status: 'planned' },
  { value: 'whatsapp_catalog', label: 'WhatsApp Business Catalog', href: '', status: 'planned' },
  { value: 'ubereats', label: 'Uber Eats', href: '', status: 'partner' },
  { value: 'lieferando', label: 'Lieferando', href: '', status: 'partner' },
] as const

export default function StoreIntegrationsPage() {
  const router = useRouter()
  const { currentCompany, loading } = useCompany()
  const { t } = useI18n()
  const [provider, setProvider] = useState('woocommerce')
  const selectedProvider = useMemo(() => providers.find((item) => item.value === provider) ?? providers[0], [provider])

  if (loading) return <PageContainer><PageHeader title={t('integrations.storeIntegrations')} /></PageContainer>

  if (!currentCompany) {
    return (
      <PageContainer>
        <EmptyState icon={Building2} title={t('common.noWorkspaceSelected')} action={{ label: t('common.goToOnboarding'), onClick: () => router.push('/app/onboarding') }} />
      </PageContainer>
    )
  }

  if (currentCompany.type !== 'business') {
    return (
      <PageContainer>
        <PageHeader title={t('integrations.storeIntegrations')} />
        <EmptyState icon={BriefcaseBusiness} title={t('common.businessOnlyTitle')} description={t('modules.businessOnlyDescription')} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={t('integrations.storeIntegrations')} description={`${t('integrations.description')} · ${currentCompany.name}`} />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{t('integrations.chooseProvider')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="space-y-1">
            <span className="text-sm font-medium">{t('integrations.provider')}</span>
            <AppSelect
              value={provider}
              onChange={setProvider}
              options={providers.map((item) => ({ value: item.value, label: item.label }))}
            />
          </label>
          {selectedProvider.href ? (
            <Link href={selectedProvider.href}>
              <Button>{t('integrations.openSettings')}</Button>
            </Link>
          ) : (
            <Button disabled>{selectedProvider.status === 'partner' ? t('integrations.partnerRequired') : t('integrations.comingSoon')}</Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((item) => (
          <Card key={item.value}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Store className="mb-3 h-5 w-5 text-slate-500" />
                  <h2 className="font-semibold text-slate-950">{item.label}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.status === 'ready'
                      ? t('integrations.readyDescription')
                      : item.status === 'partner'
                        ? t('integrations.partnerDescription')
                        : t('integrations.plannedDescription')}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                  {item.status === 'ready' ? t('woocommerce.connected') : item.status === 'partner' ? t('integrations.partnerRequired') : t('integrations.comingSoon')}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  )
}
