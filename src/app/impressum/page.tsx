import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { getContactEmail } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'Impressum',
  description: 'Impressum for Leonety.',
}

export default function ImpressumPage() {
  const contactEmail = getContactEmail()

  return (
    <LegalPage
      title="Impressum"
      intro={
        <p>
          This page provides the basic provider information structure commonly expected for Germany/EU-facing services.
          Complete any missing business details before public launch.
        </p>
      }
      sections={[
        {
          title: '1. Provider',
          content: (
            <>
              <p>Leonety</p>
              <p>Provider name: To be added</p>
              <p>Address: To be added</p>
              <p>Country: To be added</p>
            </>
          ),
        },
        {
          title: '2. Contact',
          content: (
            <p>
              Email:{' '}
              {contactEmail ? (
                <a className="font-medium text-slate-900 underline" href={`mailto:${contactEmail}`}>
                  {contactEmail}
                </a>
              ) : (
                'To be added'
              )}
            </p>
          ),
        },
        {
          title: '3. Registration and Tax Information',
          content: (
            <p>
              Company registration number, VAT ID, and supervisory authority details should be added here only if they
              apply. No registration numbers are listed until they are confirmed.
            </p>
          ),
        },
        {
          title: '4. Responsibility for Content',
          content: (
            <p>
              The provider is responsible for its own content according to applicable law. User-entered workspace data
              remains the responsibility of the user who creates or manages that data.
            </p>
          ),
        },
      ]}
    />
  )
}
