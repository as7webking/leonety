import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
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
      title="Delete Account or Request Data Deletion"
      intro={
        <p>
          Leonety does not run automatic account deletion from the public website yet. This prevents accidental deletion
          of bookkeeping records while the MVP is still manual-review based.
        </p>
      }
      sections={[
        {
          title: '1. How to Request Deletion',
          content: (
            <p>
              Send an email to{' '}
              {deletionHref ? (
                <a className="font-medium text-slate-900 underline" href={deletionHref}>
                  {contactEmail}
                </a>
              ) : (
                'the contact email configured by the service operator'
              )}{' '}
              from the email address connected to your Leonety account. Include the workspace names you want reviewed.
            </p>
          ),
        },
        {
          title: '2. What Happens Next',
          content: (
            <p>
              We will verify the request, review whether legal or security retention requirements apply, and then delete
              or anonymize eligible account and workspace data where possible.
            </p>
          ),
        },
        {
          title: '3. Important Records',
          content: (
            <p>
              If your workspace contains business, tax, or bookkeeping records, export or save any records you need
              before requesting deletion. Deletion may be permanent once completed.
            </p>
          ),
        },
      ]}
    />
  )
}
