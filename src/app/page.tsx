import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  Box,
  Check,
  Clock3,
  FileText,
  Globe2,
  Layers3,
  Package,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  Store,
  Timer,
  Users,
  WalletCards,
} from 'lucide-react'
import { PublicHeader } from '@/components/public-header'
import { T } from '@/components/t'
import { Button } from '@/components/ui/button'
import { planDefinitions, type AppPlan } from '@/lib/billing/plans'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const financeItems = [
  ['nav.income', 'landing.finance.incomeText', WalletCards],
  ['nav.expenses', 'landing.finance.expensesText', ReceiptText],
  ['nav.transactions', 'landing.finance.transactionsText', BarChart3],
  ['nav.time', 'landing.finance.timeText', Timer],
  ['landing.reports', 'landing.finance.reportsText', FileText],
] as const

const businessItems = [
  ['nav.clients', 'landing.business.clientsText', Users],
  ['nav.invoices', 'landing.business.invoicesText', FileText],
  ['nav.products', 'landing.business.productsText', Package],
  ['nav.inventory', 'landing.business.inventoryText', Box],
  ['nav.stockMovements', 'landing.business.stockText', Store],
] as const

const productPillars = [
  ['landing.product.cardFinance', 'landing.product.cardFinanceText', BarChart3],
  ['landing.product.cardBusiness', 'landing.product.cardBusinessText', Users],
  ['landing.product.cardCommerce', 'landing.product.cardCommerceText', Store],
] as const

const utilityCards = [
  ['landing.pwa.title', 'landing.pwa.text', Smartphone],
  ['landing.languages.title', 'landing.languages.text', Globe2],
  ['landing.security.title', 'landing.security.text', ShieldCheck],
] as const

const integrations = [
  ['WooCommerce', 'landing.integration.available', 'bg-emerald-50 text-emerald-700 ring-emerald-200'],
  ['Google Merchant', 'landing.integration.requiresSetup', 'bg-amber-50 text-amber-700 ring-amber-200'],
  ['Meta / Instagram', 'landing.integration.requiresSetup', 'bg-amber-50 text-amber-700 ring-amber-200'],
  ['TikTok Shop', 'landing.integration.beta', 'bg-blue-50 text-blue-700 ring-blue-200'],
  ['WhatsApp Business', 'landing.integration.requiresSetup', 'bg-amber-50 text-amber-700 ring-amber-200'],
  ['ISS POS', 'landing.integration.comingSoon', 'bg-slate-100 text-slate-600 ring-slate-200'],
] as const

const pricingPlans: Array<{
  plan: AppPlan
  descriptionKey: string
  features: string[]
}> = [
  {
    plan: 'free',
    descriptionKey: 'landing.pricing.freeText',
    features: ['landing.pricing.featureFinance', 'landing.pricing.featureTime', 'landing.pricing.featureCsv'],
  },
  {
    plan: 'starter',
    descriptionKey: 'landing.pricing.starterText',
    features: ['landing.pricing.featureReports', 'landing.pricing.featureClients', 'landing.pricing.featureInvoices'],
  },
  {
    plan: 'pro',
    descriptionKey: 'landing.pricing.proText',
    features: ['landing.pricing.featureInventory', 'landing.pricing.featureProducts', 'landing.pricing.featureIntegrations'],
  },
  {
    plan: 'business',
    descriptionKey: 'landing.pricing.businessText',
    features: ['landing.pricing.featureWorkspaces', 'landing.pricing.featureSupport', 'landing.pricing.featureControl'],
  },
]

function planSignupHref(plan: AppPlan) {
  return plan === 'free' ? '/signup' : `/signup?plan=${plan}`
}

function formatPlanPrice(plan: AppPlan) {
  const price = planDefinitions[plan].monthlyPriceEur
  return price === 0 ? '€0' : `€${price.toFixed(2)}`
}

function SectionIntro({ eyebrowKey, titleKey, textKey }: { eyebrowKey: string; titleKey: string; textKey: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b88a2a] sm:tracking-[0.32em]"><T k={eyebrowKey} /></p>
      <h2 className="mt-4 text-[clamp(1.9rem,4.8vw,3.5rem)] font-semibold leading-tight tracking-tight text-slate-950"><T k={titleKey} /></h2>
      <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg"><T k={textKey} /></p>
    </div>
  )
}

function DesktopPreview() {
  return (
    <div className="relative hidden min-w-0 rounded-[1.5rem] border border-white/70 bg-white/75 p-2 shadow-2xl shadow-[#b88a2a]/10 backdrop-blur lg:block">
      <div className="overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <div className="max-w-[14rem] truncate rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">leonety.app/workspace</div>
        </div>
        <div className="grid min-h-[430px] bg-white md:grid-cols-[190px_1fr]">
          <aside className="border-r border-slate-200 bg-slate-950 p-5 text-white">
            <div className="mb-8 flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-[#d7a642]" />
              <span className="font-semibold">Leonety</span>
            </div>
            {['nav.dashboard', 'nav.transactions', 'nav.clients', 'nav.invoices', 'nav.products'].map((key, index) => (
              <div key={key} className={`mb-2 rounded-xl px-3 py-2 text-sm ${index === 0 ? 'bg-white text-slate-950' : 'text-slate-300'}`}>
                <T k={key} />
              </div>
            ))}
          </aside>
          <div className="min-w-0 p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-slate-500"><T k="landing.preview.workspace" /></p>
                <h3 className="truncate text-2xl font-semibold text-slate-950"><T k="landing.preview.title" /></h3>
              </div>
              <div className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
                <T k="landing.preview.synced" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['nav.income', '12,450 €', 'text-emerald-700'],
                ['nav.expenses', '8,320 €', 'text-red-600'],
                ['landing.reports', '4,130 €', 'text-slate-950'],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="truncate text-xs font-medium uppercase tracking-[0.18em] text-slate-500"><T k={label} /></p>
                  <p className={`mt-3 text-2xl font-semibold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_260px]">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <p className="font-semibold text-slate-950"><T k="landing.preview.transactions" /></p>
                  <span className="text-sm text-slate-500"><T k="landing.preview.thisMonth" /></span>
                </div>
                {[
                  ['landing.preview.sampleCustomer', '+200.00 €', 'text-emerald-700'],
                  ['landing.preview.sampleSupplier', '-84.20 €', 'text-red-600'],
                  ['landing.preview.sampleTimeInvoice', '+640.00 €', 'text-emerald-700'],
                ].map(([nameKey, amount, color]) => (
                  <div key={nameKey} className="flex items-center justify-between border-t border-slate-100 py-3 text-sm">
                    <span className="truncate pr-3 text-slate-700"><T k={nameKey} /></span>
                    <span className={`font-semibold ${color}`}>{amount}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="font-semibold text-slate-950"><T k="landing.preview.channels" /></p>
                <div className="mt-4 space-y-2">
                  {['WooCommerce', 'Google Merchant', 'TikTok Shop'].map((name, index) => (
                    <div key={name} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <span className="truncate">{name}</span>
                      <span className={index === 0 ? 'shrink-0 text-emerald-700' : 'shrink-0 text-amber-700'}>
                        <T k={index === 0 ? 'landing.integration.available' : 'landing.integration.requiresSetup'} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MobilePreview() {
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:hidden">
      {[
        ['landing.preview.mobileFinance', '12,450 €', 'nav.income', 'bg-emerald-50 text-emerald-700'],
        ['landing.preview.mobileInventory', '18', 'nav.products', 'bg-amber-50 text-amber-700'],
        ['landing.preview.mobileInvoice', 'INV-2026', 'nav.invoices', 'bg-blue-50 text-blue-700'],
      ].map(([title, value, label, className]) => (
        <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className={`mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${className}`}>
            <T k={label} />
          </div>
          <p className="text-sm text-slate-500"><T k={title} /></p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
        </div>
      ))}
    </div>
  )
}

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const primarySignupHref = user ? '/app/dashboard' : '/signup'

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8f6f1] text-slate-950">
      <PublicHeader user={user} />
      <main>
        <section className="relative overflow-hidden border-b border-[#eadfca] bg-[radial-gradient(circle_at_top_left,#fff4d8,transparent_34%),linear-gradient(180deg,#fffaf0_0%,#f8f6f1_70%,#ffffff_100%)]">
          <div className="mx-auto grid w-[92%] max-w-7xl gap-10 py-12 sm:py-16 md:py-20 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:py-24">
            <div className="min-w-0">
              <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-[#e2c886] bg-white/80 px-3 py-1 text-sm font-medium text-slate-700 shadow-sm">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#d7a642]" />
                <span className="truncate"><T k="landing.hero.badge" /></span>
              </div>
              <h1 className="max-w-4xl text-[clamp(2.25rem,8vw,4.9rem)] font-semibold leading-[1.02] tracking-tight text-slate-950">
                <T k="landing.hero.title" />
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg sm:leading-8">
                <T k="landing.hero.text" />
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild className="bg-slate-950 text-white hover:bg-slate-800">
                  <Link href={primarySignupHref}><T k={user ? 'home.openApp' : 'home.startFree'} /><ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="border-slate-300 bg-white">
                  <Link href="/#product"><T k="landing.hero.secondaryCta" /></Link>
                </Button>
              </div>
              <div className="mt-7 grid max-w-2xl gap-3 text-sm text-slate-600 sm:grid-cols-3">
                {['landing.hero.pointFinance', 'landing.hero.pointCommerce', 'landing.hero.pointLanguages'].map((key) => (
                  <div key={key} className="flex min-w-0 items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-[#b88a2a]" />
                    <span className="min-w-0"><T k={key} /></span>
                  </div>
                ))}
              </div>
            </div>
            <DesktopPreview />
            <MobilePreview />
          </div>
        </section>

        <section id="product" className="bg-white py-16 sm:py-20 lg:py-24">
          <div className="mx-auto w-[92%] max-w-7xl">
            <SectionIntro eyebrowKey="public.product" titleKey="landing.product.title" textKey="landing.product.text" />
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {productPillars.map(([title, text, Icon]) => (
                <div key={title} className="rounded-[1.25rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <Icon className="h-10 w-10 rounded-2xl bg-[#fff4d8] p-2 text-[#9b711d]" />
                  <h3 className="mt-5 text-xl font-semibold"><T k={title} /></h3>
                  <p className="mt-3 leading-7 text-slate-600"><T k={text} /></p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="bg-slate-50 py-16 sm:py-20 lg:py-24">
          <div className="mx-auto w-[92%] max-w-7xl">
            <SectionIntro eyebrowKey="public.features" titleKey="landing.finance.title" textKey="landing.finance.text" />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {financeItems.map(([title, text, Icon]) => (
                <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <Icon className="h-9 w-9 rounded-xl bg-slate-100 p-2 text-slate-800" />
                  <h3 className="mt-4 font-semibold"><T k={title} /></h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600"><T k={text} /></p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20 lg:py-24">
          <div className="mx-auto w-[92%] max-w-7xl">
            <SectionIntro eyebrowKey="landing.business.eyebrow" titleKey="landing.business.title" textKey="landing.business.text" />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {businessItems.map(([title, text, Icon]) => (
                <div key={title} className="rounded-2xl border border-slate-200 bg-[#fbfaf7] p-5">
                  <Icon className="h-9 w-9 rounded-xl bg-white p-2 text-[#9b711d] ring-1 ring-[#eadfca]" />
                  <h3 className="mt-4 font-semibold"><T k={title} /></h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600"><T k={text} /></p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="integrations" className="bg-slate-950 py-16 text-white sm:py-20 lg:py-24">
          <div className="mx-auto grid w-[92%] max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#d7a642] sm:tracking-[0.32em]"><T k="public.integrations" /></p>
              <h2 className="mt-4 text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-tight tracking-tight"><T k="landing.integrations.title" /></h2>
              <p className="mt-5 text-base leading-8 text-slate-300 sm:text-lg"><T k="landing.integrations.text" /></p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {integrations.map(([name, statusKey, className]) => (
                <div key={name} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 font-semibold">{name}</h3>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${className}`}><T k={statusKey} /></span>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-slate-300"><T k="landing.integrations.cardText" /></p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20 lg:py-24">
          <div className="mx-auto grid w-[92%] max-w-7xl gap-10 lg:grid-cols-2 lg:items-center">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b88a2a] sm:tracking-[0.32em]"><T k="landing.multichannel.eyebrow" /></p>
              <h2 className="mt-4 text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-tight tracking-tight text-slate-950"><T k="landing.multichannel.title" /></h2>
              <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg"><T k="landing.multichannel.text" /></p>
            </div>
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 sm:p-5">
              {['WooCommerce', 'Google Merchant', 'Instagram', 'TikTok'].map((channel, index) => (
                <div key={channel} className="mb-3 flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm last:mb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff4d8] text-sm font-semibold text-[#9b711d]">{index + 1}</span>
                    <span className="truncate font-medium">{channel}</span>
                  </div>
                  <span className="shrink-0 text-sm text-slate-500"><T k={index === 0 ? 'landing.integration.available' : 'landing.integration.requiresSetup'} /></span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#fbfaf7] py-16 sm:py-20 lg:py-24">
          <div className="mx-auto grid w-[92%] max-w-7xl gap-6 lg:grid-cols-3">
            {utilityCards.map(([title, text, Icon]) => (
              <div key={title} className="rounded-[1.25rem] border border-[#eadfca] bg-white p-7 shadow-sm">
                <Icon className="h-10 w-10 rounded-2xl bg-slate-950 p-2 text-white" />
                <h2 className="mt-5 text-2xl font-semibold"><T k={title} /></h2>
                <p className="mt-3 leading-7 text-slate-600"><T k={text} /></p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="bg-white py-16 sm:py-20 lg:py-24">
          <div className="mx-auto w-[92%] max-w-7xl">
            <SectionIntro eyebrowKey="public.pricing" titleKey="landing.pricing.title" textKey="landing.pricing.text" />
            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {pricingPlans.map((plan) => {
                const definition = planDefinitions[plan.plan]
                const highlighted = Boolean(definition.recommended)
                return (
                  <div key={plan.plan} className={`flex min-w-0 flex-col rounded-[1.25rem] border p-6 shadow-sm ${highlighted ? 'border-[#d7a642] bg-[#fff9e8] ring-2 ring-[#d7a642]/20' : 'border-slate-200 bg-white'}`}>
                    {highlighted && <span className="mb-4 w-fit rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white"><T k="billing.recommended" /></span>}
                    <h3 className="text-xl font-semibold"><T k={`billing.status.${plan.plan}`} /></h3>
                    <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600"><T k={plan.descriptionKey} /></p>
                    <div className="mt-6 flex items-end gap-1">
                      <span className="text-4xl font-semibold">{formatPlanPrice(plan.plan)}</span>
                      <span className="pb-1 text-sm text-slate-500">/<T k="home.month" /></span>
                    </div>
                    <p className="mt-2 text-sm text-[#9b711d]"><T k={definition.trialDays > 0 ? 'billing.sevenDayTrial' : 'billing.freeForever'} /></p>
                    <Button asChild className="mt-6" variant={highlighted ? 'default' : 'outline'}>
                      <Link href={user ? '/app/upgrade' : planSignupHref(plan.plan)}>
                        <T k={definition.trialDays > 0 ? 'billing.startTrial' : 'home.startFree'} />
                      </Link>
                    </Button>
                    <ul className="mt-6 space-y-3 text-sm text-slate-600">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#b88a2a]" />
                          <T k={feature} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="bg-slate-50 py-16 sm:py-20 lg:py-24">
          <div className="mx-auto w-[92%] max-w-5xl">
            <SectionIntro eyebrowKey="landing.faq.eyebrow" titleKey="landing.faq.title" textKey="landing.faq.text" />
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {[
                ['landing.faq.bankQuestion', 'landing.faq.bankAnswer'],
                ['landing.faq.integrationsQuestion', 'landing.faq.integrationsAnswer'],
                ['landing.faq.languagesQuestion', 'landing.faq.languagesAnswer'],
                ['landing.faq.installQuestion', 'landing.faq.installAnswer'],
              ].map(([question, answer]) => (
                <div key={question} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h3 className="font-semibold text-slate-950"><T k={question} /></h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600"><T k={answer} /></p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="support" className="border-y border-slate-200 bg-slate-950 py-16 text-white sm:py-20">
          <div className="mx-auto flex w-[92%] max-w-7xl flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#d7a642] sm:tracking-[0.32em]"><T k="landing.cta.eyebrow" /></p>
              <h2 className="mt-4 text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-tight"><T k="landing.cta.title" /></h2>
              <p className="mt-5 text-base leading-8 text-slate-300 sm:text-lg"><T k="landing.cta.text" /></p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button size="lg" asChild className="bg-white text-slate-950 hover:bg-slate-100">
                <Link href={primarySignupHref}><T k={user ? 'home.openApp' : 'home.startFree'} /></Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <Link href="/login"><T k="home.login" /></Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
