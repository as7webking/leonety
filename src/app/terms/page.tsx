import { LegalPage } from '@/components/legal-page'

const sections = [
  ['legal.terms.useTitle', 'legal.terms.useText'],
  ['legal.terms.accountsTitle', 'legal.terms.accountsText'],
  ['legal.terms.plansTitle', 'legal.terms.plansText'],
  ['legal.terms.integrationsTitle', 'legal.terms.integrationsText'],
  ['legal.terms.adviceTitle', 'legal.terms.adviceText'],
  ['legal.terms.availabilityTitle', 'legal.terms.availabilityText'],
] as const

export default function TermsPage() {
  return <LegalPage titleKey="legal.terms.title" introKey="legal.terms.intro" sections={sections.map(([titleKey, contentKey]) => ({ titleKey, contentKey }))} />
}
