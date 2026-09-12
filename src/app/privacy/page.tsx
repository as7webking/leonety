'use client'

import { LegalPage } from '@/components/legal-page'
import { useI18n } from '@/contexts/i18n-context'
import { publicLegalConfig } from '@/lib/legal-config'

const privacySections = [
  ['legal.privacy.controllerTitle', 'legal.privacy.controllerText'],
  ['legal.privacy.hostingTitle', 'legal.privacy.hostingText'],
  ['legal.privacy.accountTitle', 'legal.privacy.accountText'],
  ['legal.privacy.oauthTitle', 'legal.privacy.oauthText'],
  ['legal.privacy.workspaceTitle', 'legal.privacy.workspaceText'],
  ['legal.privacy.billingTitle', 'legal.privacy.billingText'],
  ['legal.privacy.aiTitle', 'legal.privacy.aiText'],
  ['legal.privacy.integrationsTitle', 'legal.privacy.integrationsText'],
  ['legal.privacy.supportTitle', 'legal.privacy.supportText'],
  ['legal.privacy.logsTitle', 'legal.privacy.logsText'],
  ['legal.privacy.storageTitle', 'legal.privacy.storageText'],
  ['legal.privacy.legalBasisTitle', 'legal.privacy.legalBasisText'],
  ['legal.privacy.transfersTitle', 'legal.privacy.transfersText'],
  ['legal.privacy.retentionTitle', 'legal.privacy.retentionText'],
  ['legal.privacy.rightsTitle', 'legal.privacy.rightsText'],
] as const

export default function PrivacyPage() {
  const { t } = useI18n()
  const contact = [
    publicLegalConfig.providerName,
    publicLegalConfig.address ?? t('legal.requiredBusinessAddress'),
    publicLegalConfig.contactEmail ?? t('legal.requiredContactEmail'),
  ].join(' · ')

  return (
    <LegalPage
      titleKey="legal.privacy.title"
      introKey="legal.privacy.intro"
      sections={privacySections.map(([titleKey, contentKey], index) => ({
        titleKey,
        content: <p>{index === 0 ? `${t(contentKey)} ${contact}` : t(contentKey)}</p>,
      }))}
    />
  )
}
