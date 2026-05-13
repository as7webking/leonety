import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'
import { getContactEmail } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for Leonety.',
}

export default function TermsPage() {
  const contactEmail = getContactEmail()

  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These Terms govern access to Leonety, an MVP SaaS product for workspace-based bookkeeping, income and expense
          tracking, and time tracking.
        </p>
      }
      sections={[
        {
          title: '1. Use of the Service',
          content: (
            <p>
              You may use Leonety only for lawful business or personal productivity purposes. You are responsible for the
              accuracy of the data you enter and for keeping your account credentials secure.
            </p>
          ),
        },
        {
          title: '2. Accounts and Workspaces',
          content: (
            <p>
              Users can create and manage workspaces subject to plan limits. Workspace owners are responsible for the
              records, settings, and activity inside their workspaces.
            </p>
          ),
        },
        {
          title: '3. Plans and Access',
          content: (
            <p>
              Free and paid plan features may differ. During the MVP phase, Pro access may be manually reviewed and
              activated by an administrator before automated payments are introduced.
            </p>
          ),
        },
        {
          title: '4. Acceptable Use',
          content: (
            <p>
              You must not misuse the service, attempt unauthorized access, upload illegal content, disrupt the platform,
              reverse engineer protected systems, or use Leonety to violate applicable laws.
            </p>
          ),
        },
        {
          title: '5. No Professional Advice',
          content: (
            <p>
              Leonety helps organize business records, but it does not provide tax, legal, accounting, or financial
              advice. Users should verify records and consult qualified professionals where needed.
            </p>
          ),
        },
        {
          title: '6. Availability and Changes',
          content: (
            <p>
              Leonety is provided as an evolving MVP. Features may change, be improved, or be temporarily unavailable
              due to maintenance, security updates, or third-party infrastructure issues.
            </p>
          ),
        },
        {
          title: '7. Liability',
          content: (
            <p>
              To the maximum extent permitted by applicable law, Leonety is provided without guarantees of uninterrupted
              availability, error-free operation, or specific business outcomes.
            </p>
          ),
        },
        {
          title: '8. Contact',
          content: (
            <p>
              Questions about these Terms can be sent to{' '}
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
      ]}
    />
  )
}
