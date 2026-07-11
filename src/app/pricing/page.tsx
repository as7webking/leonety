import Link from 'next/link'
import { Check } from 'lucide-react'
import { PublicHeader } from '@/components/public-header'
import { T } from '@/components/t'

const plans = [
  {
    name: 'Free',
    price: '0 €',
    description: 'home.freePlanText',
    cta: 'footer.getStarted',
    href: '/onboarding',
    features: ['home.incomeTrackingFeature', 'home.expenseTrackingFeature', 'home.timeTrackingFeature', 'home.basicDashboardFeature'],
  },
  {
    name: 'Starter',
    price: '7 €',
    description: 'home.starterPlanText',
    cta: 'home.startFree',
    href: '/onboarding',
    features: ['home.everythingFree', 'home.monthlySummaries', 'home.csvExport', 'home.betterOrganization'],
  },
  {
    name: 'Pro',
    price: '19 €',
    description: 'home.proPlanText',
    cta: 'home.startTrial',
    href: '/upgrade',
    featured: true,
    features: ['home.everythingStarter', 'home.advancedReporting', 'home.moreControl', 'home.priorityEmail'],
  },
  {
    name: 'Business',
    price: '29 €',
    description: 'home.businessPlanText',
    cta: 'home.startFree',
    href: '/upgrade',
    features: ['home.everythingPro', 'home.multiWorkspace', 'home.teamCollaboration', 'home.prioritySupport'],
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <PublicHeader />
      <main className="container mx-auto px-4 py-16 sm:py-24">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-slate-500"><T k="public.pricing" /></p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl"><T k="home.pricingTitle" /></h1>
          <p className="mt-5 text-lg leading-8 text-slate-600"><T k="home.pricingText" /></p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <section
              key={plan.name}
              className={`relative flex h-full flex-col rounded-2xl border bg-white p-8 shadow-sm ${
                plan.featured ? 'border-blue-500 ring-1 ring-blue-100' : 'border-slate-200'
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                  <T k="home.mostPopular" />
                </span>
              )}
              <div className="min-h-20">
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="mt-1 text-sm text-slate-600"><T k={plan.description} /></p>
              </div>
              <div className="my-8">
                <span className="text-4xl font-bold">{plan.price}</span>
                {plan.price !== '0 €' && <span className="text-slate-600"> / <T k="home.month" /></span>}
                <p className="mt-2 text-sm text-slate-500">{plan.price === '0 €' ? <T k="home.foreverFree" /> : <T k="home.billedMonthly" />}</p>
              </div>
              <Link
                href={plan.href}
                className={`mb-8 rounded-lg px-4 py-3 text-center text-sm font-medium ${
                  plan.featured ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border border-slate-300 text-slate-900 hover:bg-slate-50'
                }`}
              >
                <T k={plan.cta} />
              </Link>
              <ul className="flex flex-1 flex-col gap-4 text-sm text-slate-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className={`mt-0.5 h-5 w-5 shrink-0 ${plan.featured ? 'text-blue-500' : 'text-slate-400'}`} />
                    <span><T k={feature} /></span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mx-auto mt-12 max-w-2xl border-t border-slate-200 pt-8 text-center text-sm text-slate-600">
          <T k="home.pricingTrust" />
          <span className="mt-2 block text-xs text-slate-500"><T k="home.pricingNoCard" /></span>
        </p>
      </main>
    </div>
  )
}
