'use client'

import { LegalPage } from '@/components/legal-page'
import { useI18n } from '@/contexts/i18n-context'
import { getContactEmail } from '@/lib/contact'

export default function ImpressumPage() {
  const { t } = useI18n()
  const contactEmail = getContactEmail()

  return (
    <LegalPage
      title={t('legal.impressum')}
      intro={<p>{t('legal.impressum.intro')}</p>}
      sections={[
        {
          title: t('legal.impressum.operatorTitle'),
          content: (
            <div className="space-y-2">
              <p>{t('legal.impressum.operatorName')}</p>
              <p>{t('legal.requiredBusinessAddress')}</p>
            </div>
          ),
        },
        {
          title: t('legal.impressum.productTitle'),
          content: <p>Leonety</p>,
        },
        {
          title: t('legal.impressum.activityTitle'),
          content: <p>{t('legal.impressum.activityText')}</p>,
        },
        {
          title: t('legal.impressum.contactTitle'),
          content: contactEmail
            ? <a className="font-medium text-slate-900 underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>
            : <p>{t('legal.requiredContactEmail')}</p>,
        },
        {
          title: t('legal.impressum.responsibleTitle'),
          content: <p>{t('legal.impressum.operatorName')}</p>,
        },
        {
          title: t('legal.impressum.taxTitle'),
          content: (
            <div className="space-y-2">
              <p>{t('legal.requiredVatId')}</p>
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
