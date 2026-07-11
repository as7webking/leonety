'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { PublicHeader } from '@/components/public-header'
import { useI18n } from '@/contexts/i18n-context'

const links = [
  { href: '/', labelKey: 'nav.dashboard', publicLabel: 'Home' },
  { href: '/pricing', labelKey: 'public.pricing', publicLabel: 'Pricing' },
  { href: '/login', labelKey: 'nav.login', publicLabel: 'Login' },
  { href: '/privacy', labelKey: 'legal.privacy', publicLabel: 'Privacy' },
  { href: '/terms', labelKey: 'legal.terms', publicLabel: 'Terms' },
  { href: '/app/dashboard', labelKey: 'nav.dashboard', publicLabel: 'Dashboard' },
  { href: '/app/products', labelKey: 'nav.products', publicLabel: 'Products' },
  { href: '/app/invoices', labelKey: 'nav.invoices', publicLabel: 'Invoices' },
  { href: '/app/settings/integrations', labelKey: 'integrations.storeIntegrations', publicLabel: 'Store integrations' },
]

export default function NotFound() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const filteredLinks = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return links.slice(0, 6)

    return links.filter((link) => (
      t(link.labelKey).toLowerCase().includes(normalized) ||
      link.publicLabel.toLowerCase().includes(normalized) ||
      link.href.toLowerCase().includes(normalized)
    ))
  }, [query, t])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader />
      <main className="mx-auto flex min-h-[70vh] w-[90%] max-w-3xl flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-500">404</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{t('notFound.title')}</h1>
        <p className="mt-4 max-w-xl text-slate-600">{t('notFound.description')}</p>

        <div className="mt-8 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-lg border border-slate-200 py-3 pl-10 pr-3 text-left text-sm outline-none focus:border-blue-500"
              placeholder={t('notFound.searchPlaceholder')}
            />
          </label>
          <div className="mt-4 grid gap-2 text-left sm:grid-cols-2">
            {filteredLinks.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-950">
                {t(link.labelKey)}
                <span className="block text-xs text-slate-400">{link.href}</span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
