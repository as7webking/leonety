import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { getContactEmail } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Leonety.',
}

export default function PrivacyPage() {
  const contactEmail = getContactEmail()

  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This Privacy Policy explains how Leonety handles personal data for account access, workspace management,
          income and expense tracking, time tracking, support, and service security.
        </p>
      }
      sections={[
        {
          title: '1. Contact',
          content: (
            <p>
              For privacy questions or data requests, contact us at{' '}
              {contactEmail ? (
                <a className="font-medium text-slate-900 underline" href={`mailto:${contactEmail}`}>
                  {contactEmail}
                </a>
              ) : (
                'the contact email configured by the service operator'
              )}
              .
            </p>
          ),
        },
        {
          title: '2. Data We Process',
          content: (
            <>
              <p>
                We process account data such as email address, profile name, authentication identifiers, workspace or
                company names, selected currencies, plan status, and access settings.
              </p>
              <p>
                We also process the data users enter into the product, including income records, expense records, time
                entries, active timer data, categories, descriptions, dates, and workspace settings.
              </p>
            </>
          ),
        },
        {
          title: '3. Why We Process Data',
          content: (
            <p>
              Data is processed to provide the Leonety service, authenticate users, secure accounts, save user records,
              manage workspaces, provide support, maintain reliability, and comply with legal obligations where they
              apply.
            </p>
          ),
        },
        {
          title: '4. Supabase and Infrastructure',
          content: (
            <p>
              Leonety uses Supabase for authentication, database services, and related backend infrastructure. Supabase
              may process authentication metadata, database records, logs, and security-related technical information
              needed to operate the service.
            </p>
          ),
        },
        {
          title: '5. Cookies and Local Storage',
          content: (
            <p>
              Leonety uses essential browser storage to keep users signed in, remember workspace selection, and store
              basic app preferences. Optional analytics may be added later only where legally permitted or with consent
              where required.
            </p>
          ),
        },
        {
          title: '6. Retention',
          content: (
            <p>
              Account and workspace data is kept while the account is active or while needed to provide the service,
              resolve disputes, maintain backups, comply with legal obligations, or protect the service from abuse.
            </p>
          ),
        },
        {
          title: '7. Your Rights',
          content: (
            <p>
              Depending on your location, you may have rights to access, correct, delete, restrict, object to processing,
              or request portability of your personal data. Send requests to the configured privacy contact email.
            </p>
          ),
        },
      ]}
    />
  )
}
