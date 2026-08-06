import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { T } from '@/components/t'
import { getContactEmail } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'Delete Account',
  description: 'Account and data deletion request information for Leonety.',
}

export default function DeleteAccountPage() {
  const contactEmail = getContactEmail()
  const deletionHref = contactEmail
    ? `mailto:${contactEmail}?subject=Leonety%20account%20deletion%20request`
    : undefined

  return (
    <LegalPage
      titleKey="legal.delete.title"
      introKey="legal.delete.intro"
      sections={[
        {
          titleKey: 'legal.delete.requestTitle',
          content: (
            <p>
              <T k="legal.delete.sendEmailPrefix" />{' '}
              {deletionHref ? (
                <a className="font-medium text-slate-900 underline" href={deletionHref}>
                  {contactEmail}
                </a>
              ) : (
                <T k="legal.delete.configuredContactEmail" />
              )}{' '}
              <T k="legal.delete.sendEmailSuffix" />
            </p>
          ),
        },
        {
          titleKey: 'legal.delete.nextTitle',
          contentKey: 'legal.delete.nextContent',
        },
        {
          titleKey: 'legal.delete.recordsTitle',
          contentKey: 'legal.delete.recordsContent',
        },
      ]}
    />
  )
}
