import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal-page'

export const metadata: Metadata = {
  title: 'Cookie Notice',
  description: 'Cookie and local storage notice for Leonety.',
}

export default function CookiesPage() {
  return (
    <LegalPage
      titleKey="legal.cookies.title"
      introKey="legal.cookies.intro"
      sections={[
        {
          titleKey: 'legal.cookies.essentialTitle',
          contentKey: 'legal.cookies.essentialContent',
        },
        {
          titleKey: 'legal.cookies.authTitle',
          contentKey: 'legal.cookies.authContent',
        },
        {
          titleKey: 'legal.cookies.analyticsTitle',
          contentKey: 'legal.cookies.analyticsContent',
        },
        {
          titleKey: 'legal.cookies.manageTitle',
          contentKey: 'legal.cookies.manageContent',
        },
      ]}
    />
  )
}
