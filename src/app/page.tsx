import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, Globe, Shield, Zap, Check } from 'lucide-react'
import { PublicHeader } from '@/components/public-header'
import { T } from '@/components/t'

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <PublicHeader user={user} />
      <main>
        <section className="container mx-auto px-4 py-24 lg:py-32">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            <div className="space-y-8">
              <div className="max-w-xl space-y-4">
                <p className="text-sm uppercase tracking-[0.4em] text-slate-500"><T k="home.eyebrow" /></p>
                <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
                  <T k="home.heroTitle" />
                </h1>
                <p className="text-xl leading-8 text-slate-600">
                  <T k="home.heroText" />
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {user ? (
                  <>
                    <Button size="lg" asChild>
                      <Link href="/dashboard"><T k="home.openApp" /></Link>
                    </Button>
                    <Button size="lg" variant="outline" asChild>
                      <Link href="/profile"><T k="nav.profile" /></Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="lg" asChild>
                      <Link href="/onboarding"><T k="home.startFree" /></Link>
                    </Button>
                    <Button size="lg" variant="outline" asChild>
                      <Link href="/login"><T k="home.login" /></Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-6">
              <Card className="rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-xl shadow-slate-200/50">
                <CardHeader className="space-y-4">
                  <div className="flex items-center gap-3 text-slate-900">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                      <BarChart3 className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg"><T k="home.dashboardCard" /></CardTitle>
                      <CardDescription className="text-slate-600">
                        <T k="home.dashboardCardText" />
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-slate-100 p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500"><T k="nav.income" /></p>
                    <p className="mt-3 text-2xl font-semibold">12,450 €</p>
                  </div>
                  <div className="rounded-3xl bg-slate-100 p-5">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500"><T k="nav.expenses" /></p>
                    <p className="mt-3 text-2xl font-semibold">8,320 €</p>
                  </div>
                  <div className="rounded-3xl bg-slate-100 p-5 sm:col-span-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Net</p>
                    <p className="mt-3 text-3xl font-semibold text-slate-900">4,130 €</p>
                  </div>
                </CardContent>
              </Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
                  <p className="text-sm font-medium text-slate-900"><T k="home.incomeTracking" /></p>
                  <p className="mt-3 text-sm text-slate-600"><T k="home.incomeTrackingText" /></p>
                </div>
                <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
                  <p className="text-sm font-medium text-slate-900"><T k="home.expenseManagement" /></p>
                  <p className="mt-3 text-sm text-slate-600"><T k="home.expenseManagementText" /></p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="product" className="bg-slate-50 py-24">
          <div className="container mx-auto px-4">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="text-sm uppercase tracking-[0.4em] text-slate-500"><T k="public.product" /></p>
                <h2 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900"><T k="home.productTitle" /></h2>
                <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
                  <T k="home.productText" />
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="font-semibold text-slate-900">Unified workspace</p>
                  <p className="mt-3 text-sm text-slate-600">See income, expenses, and time in one place.</p>
                </div>
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="font-semibold text-slate-900">Fast setup</p>
                  <p className="mt-3 text-sm text-slate-600">Get started instantly with no confusing onboarding.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-24">
          <div className="container mx-auto px-4">
            <div className="text-center space-y-4 mb-16">
              <p className="text-sm uppercase tracking-[0.4em] text-slate-500"><T k="public.features" /></p>
              <h2 className="text-4xl font-semibold text-slate-900"><T k="home.featuresTitle" /></h2>
              <p className="text-lg leading-8 text-slate-600 max-w-2xl mx-auto">
                <T k="home.featuresText" />
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm text-center">
                <Globe className="mx-auto h-12 w-12 rounded-full bg-primary/10 p-3 text-primary" />
                <h3 className="mt-6 text-xl font-semibold text-slate-900">Multi-Currency Support</h3>
                <p className="mt-4 text-slate-600">Work globally with automatic currency conversion and real-time exchange rates.</p>
              </div>
              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm text-center">
                <Shield className="mx-auto h-12 w-12 rounded-full bg-primary/10 p-3 text-primary" />
                <h3 className="mt-6 text-xl font-semibold text-slate-900">Secure & Private</h3>
                <p className="mt-4 text-slate-600">Your financial data is protected with enterprise-grade security and user isolation.</p>
              </div>
              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm text-center">
                <Zap className="mx-auto h-12 w-12 rounded-full bg-primary/10 p-3 text-primary" />
                <h3 className="mt-6 text-xl font-semibold text-slate-900">Real-Time Insights</h3>
                <p className="mt-4 text-slate-600">Get instant financial overviews and trends without manual calculations.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="who-it-is-for" className="bg-slate-50 py-24">
          <div className="container mx-auto px-4">
            <div className="text-center space-y-4 mb-16">
              <p className="text-sm uppercase tracking-[0.4em] text-slate-500">Who it&apos;s for</p>
              <h2 className="text-4xl font-semibold text-slate-900">Built for your business model.</h2>
              <p className="text-lg leading-8 text-slate-600 max-w-2xl mx-auto">
                Whether you&apos;re freelancing solo or building a small team, Leonety scales with your needs.
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                <div className="h-12 w-12 rounded-full bg-slate-900/10 flex items-center justify-center mb-6">
                  <span className="text-2xl font-semibold text-slate-900">Λ</span>
                </div>
                <h3 className="text-xl font-semibold text-slate-900">Freelancers</h3>
                <p className="mt-4 text-slate-600">Track income from multiple clients, manage expenses, and stay on top of tax deadlines — all in one place.</p>
              </div>
              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                <div className="h-12 w-12 rounded-full bg-slate-900/10 flex items-center justify-center mb-6">
                  <span className="text-2xl font-semibold text-slate-900">∞</span>
                </div>
                <h3 className="text-xl font-semibold text-slate-900">Solo Founders</h3>
                <p className="mt-4 text-slate-600">Get clear insight into your business financials while you focus on product. See what&apos;s working and what needs attention.</p>
              </div>
              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                <div className="h-12 w-12 rounded-full bg-slate-900/10 flex items-center justify-center mb-6">
                  <span className="text-2xl font-semibold text-slate-900">◆</span>
                </div>
                <h3 className="text-xl font-semibold text-slate-900">Small Teams</h3>
                <p className="mt-4 text-slate-600">Collaborate with your team on shared finances, automate reporting, and keep everyone aligned on business metrics.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="bg-white py-24 sm:py-32">
          <div className="container mx-auto px-4">
            {/* Header */}
            <div className="text-center mb-16 space-y-4">
              <p className="text-sm uppercase tracking-[0.4em] text-slate-500">Pricing</p>
              <h2 className="text-4xl sm:text-5xl font-semibold text-slate-900">
                Transparent pricing for every business
              </h2>
              <p className="text-lg leading-8 text-slate-600 max-w-2xl mx-auto">
                Start free, grow at your pace. No credit card required, cancel anytime.
              </p>
            </div>

            {/* Pricing Grid */}
            <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {/* Free Plan */}
              <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
                <div className="min-h-[4.5rem]">
                  <h3 className="text-lg font-semibold text-slate-900">Free</h3>
                  <p className="mt-1 text-sm text-slate-600">Get started for free</p>
                </div>
                
                <div className="mb-8 min-h-[5.5rem]">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold text-slate-900">0 €</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Forever free</p>
                </div>

                <Link href="/onboarding" className="mb-8 inline-block w-full">
                  <button className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50">
                    Get started
                  </button>
                </Link>

                <ul className="flex flex-1 flex-col gap-4 text-sm text-slate-600">
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>Income tracking</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>Expense tracking</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>Time tracking</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>Basic dashboard</span>
                  </li>
                </ul>
              </div>

              {/* Starter Plan */}
              <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
                <div className="min-h-[4.5rem]">
                  <h3 className="text-lg font-semibold text-slate-900">Starter</h3>
                  <p className="mt-1 text-sm text-slate-600">Better summaries</p>
                </div>
                
                <div className="mb-8 min-h-[5.5rem]">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold text-slate-900">7 €</span>
                    <span className="text-slate-600">/month</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Billed monthly</p>
                </div>

                <Link href="/onboarding" className="mb-8 inline-block w-full">
                  <button className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50">
                    Start free
                  </button>
                </Link>

                <ul className="flex flex-1 flex-col gap-4 text-sm text-slate-600">
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>Everything in Free</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>Monthly summaries</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>CSV export</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>Better organization</span>
                  </li>
                </ul>
              </div>

              {/* Pro Plan - Highlighted */}
              <div className="relative flex h-full flex-col rounded-2xl border-2 border-blue-500 bg-gradient-to-br from-blue-50 to-white p-8 shadow-lg ring-1 ring-blue-100 transition-shadow hover:shadow-xl">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>

                <div className="min-h-[4.5rem]">
                  <h3 className="text-lg font-semibold text-slate-900">Pro</h3>
                  <p className="mt-1 text-sm font-medium text-blue-700">Recommended</p>
                </div>
                
                <div className="mb-8 min-h-[5.5rem]">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold text-slate-900">19 €</span>
                    <span className="text-slate-600">/month</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Billed monthly</p>
                </div>

                <Link href="/onboarding" className="mb-8 inline-block w-full">
                  <button className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700">
                    Start free trial
                  </button>
                </Link>

                <ul className="flex flex-1 flex-col gap-4 text-sm text-slate-700">
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <span>Everything in Starter</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <span>Advanced reporting</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <span>More control & customization</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <span>Priority email support</span>
                  </li>
                </ul>
              </div>

              {/* Business Plan */}
              <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
                <div className="min-h-[4.5rem]">
                  <h3 className="text-lg font-semibold text-slate-900">Business</h3>
                  <p className="mt-1 text-sm text-slate-600">For growing teams</p>
                </div>
                
                <div className="mb-8 min-h-[5.5rem]">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold text-slate-900">29 €</span>
                    <span className="text-slate-600">/month</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Billed monthly</p>
                </div>

                <Link href="/onboarding" className="mb-8 inline-block w-full">
                  <button className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50">
                    Start free
                  </button>
                </Link>

                <ul className="flex flex-1 flex-col gap-4 text-sm text-slate-600">
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>Everything in Pro</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>Multi-workspace support</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>Team collaboration</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>Priority support</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Trust Note */}
            <div className="text-center mt-12 pt-8 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                All plans include data security, automatic backups, and our commitment to transparency. 
                <span className="block text-xs text-slate-500 mt-2">No credit card required to start. Cancel anytime, no questions asked.</span>
              </p>
            </div>
          </div>
        </section>

        <section id="workflows" className="py-24">
          <div className="container mx-auto px-4">
            <div className="grid gap-8 lg:grid-cols-3">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                <p className="text-xl font-semibold text-slate-900">Automated workflows</p>
                <p className="mt-4 text-slate-600">Move income, expenses, and time through your workflow automatically.</p>
              </div>
              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                <p className="text-xl font-semibold text-slate-900">Client-ready reports</p>
                <p className="mt-4 text-slate-600">Create polished summaries for clients or internal review.</p>
              </div>
              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                <p className="text-xl font-semibold text-slate-900">Focus on work</p>
                <p className="mt-4 text-slate-600">Spend less time on bookkeeping and more time on business growth.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="support" className="border-t border-slate-200 bg-white py-24">
          <div className="container mx-auto px-4">
            <div className="grid gap-8 lg:grid-cols-3">
              <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-8 shadow-sm">
                <p className="text-xl font-semibold text-slate-900">Support</p>
                <p className="mt-4 text-slate-600">A help center and support that keeps you moving forward.</p>
              </div>
              <div id="help-center" className="rounded-[2rem] border border-slate-200 bg-slate-50 p-8 shadow-sm">
                <p className="text-xl font-semibold text-slate-900">Help Center</p>
                <p className="mt-4 text-slate-600">Search guides for onboarding, invoices, and time tracking.</p>
              </div>
              <div id="contact" className="rounded-[2rem] border border-slate-200 bg-slate-50 p-8 shadow-sm">
                <p className="text-xl font-semibold text-slate-900">Contact</p>
                <p className="mt-4 text-slate-600">Reach out directly when you need fast assistance.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="status" className="bg-slate-100 py-24">
          <div className="container mx-auto px-4 text-center">
            <p className="text-sm uppercase tracking-[0.4em] text-slate-500">Status</p>
            <h2 className="mt-5 text-4xl font-semibold text-slate-900">All systems operational</h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Leonety is monitored in real time to keep your finance workflow running without interruption.
            </p>
          </div>
        </section>

        
      </main>
    </div>
  )
}
