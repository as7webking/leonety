'use client'

import { LegalPage } from '@/components/legal-page'
import { useI18n } from '@/contexts/i18n-context'
import { publicLegalConfig } from '@/lib/legal-config'

export default function ImpressumPage() {
  const { t } = useI18n()

  return (
    <LegalPage
      title={t('legal.impressum')}
      intro={<p>{t('legal.impressum.intro')}</p>}
      sections={[
        {
          title: t('legal.impressum.ddgTitle'),
          content: (
            <div className="space-y-2">
              <p>{publicLegalConfig.providerName}</p>
              <p>{publicLegalConfig.address ?? t('legal.requiredBusinessAddress')}</p>
            </div>
          ),
        },
        {
          title: t('legal.impressum.productTitle'),
          content: <p>{publicLegalConfig.productName}</p>,
        },
        {
          title: t('legal.impressum.activityTitle'),
          content: <p>{t(publicLegalConfig.activityKey)}</p>,
        },
        {
          title: t('legal.impressum.contactTitle'),
          content: publicLegalConfig.contactEmail
            ? <a className="font-medium text-slate-900 underline" href={`mailto:${publicLegalConfig.contactEmail}`}>{publicLegalConfig.contactEmail}</a>
            : <p>{t('legal.requiredContactEmail')}</p>,
        },
        {
          title: t('legal.impressum.responsibleTitle'),
          content: <p>{publicLegalConfig.providerName}</p>,
        },
        {
          title: t('legal.impressum.taxTitle'),
          content: (
            <div className="space-y-2">
              <p>{publicLegalConfig.vatId ?? t('legal.requiredVatId')}</p>
              <p>{t('legal.impressum.taxText')}</p>
            </div>
          ),
        },
        {
          title: t('legal.impressum.disputeTitle'),
          content: <p>{t('legal.impressum.disputeText')}</p>,
        },
        {
          title: t('legal.impressum.liabilityTitle'),
          content: <p>{t('legal.impressum.liabilityText')}</p>,
        },
        {
          title: t('legal.impressum.copyrightTitle'),
          content: <p>{t('legal.impressum.copyrightText')}</p>,
        },
      ]}
    />
  )
}
