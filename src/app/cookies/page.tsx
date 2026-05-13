import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'

export const metadata: Metadata = {
  title: 'Cookie Notice',
  description: 'Cookie and local storage notice for Leonety.',
}

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Notice"
      intro={
        <p>
          This notice explains how Leonety uses essential browser storage for sign-in, security, and app preferences.
        </p>
      }
      sections={[
        {
          title: '1. Essential Storage',
          content: (
            <p>
              Leonety uses essential cookies and local storage to keep users signed in, remember selected workspaces,
              store cookie consent, and support core app functionality. The app cannot work reliably without this
              storage.
            </p>
          ),
        },
        {
          title: '2. Supabase Authentication',
          content: (
            <p>
              Supabase authentication may store session tokens or related authentication state in the browser so that
              users can remain signed in securely between page loads.
            </p>
          ),
        },
        {
          title: '3. Analytics',
          content: (
            <p>
              Leonety does not require a heavy analytics setup for this MVP. If optional analytics are added later, this
              notice will be updated and consent will be requested where required by law.
            </p>
          ),
        },
        {
          title: '4. Managing Storage',
          content: (
            <p>
              You can clear cookies and local storage in your browser settings. Clearing storage may sign you out and
              reset app preferences such as the selected workspace.
            </p>
          ),
        },
      ]}
    />
  )
}
