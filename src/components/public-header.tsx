'use client'

import Link from "next/link"
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Logo } from '@/components/logo'
import { useI18n } from '@/contexts/i18n-context'

interface PublicHeaderProps {
  user?: { id: string } | null
}

export function PublicHeader({ user }: PublicHeaderProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const navigationItems = [
    ['/#product', 'public.product'],
    ['/#features', 'public.features'],
    ['/#integrations', 'public.integrations'],
    ['/#pricing', 'public.pricing'],
    ['/#support', 'public.support'],
  ] as const

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto grid h-16 w-[92%] max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3" aria-label="Leonety">
            <Logo size="md" />
            <span className="sr-only">Leonety</span>
          </Link>
        </div>

        <nav className="hidden items-center justify-center gap-5 text-sm font-medium text-slate-600 lg:flex xl:gap-7" aria-label={t('nav.primaryNavigation')}>
          {navigationItems.map(([href, key]) => (
            <Link key={href} href={href} className="whitespace-nowrap transition hover:text-slate-900">
              {t(key)}
            </Link>
          ))}
        </nav>

        <div className="hidden min-w-0 items-center justify-end gap-3 lg:flex">
          <LanguageSwitcher />
          <Link href={user ? '/app/profile' : '/login'} className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
            {user ? t('nav.profile') : t('nav.login')}
          </Link>
          {!user && (
            <Link href="/signup" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800">
              {t('home.startFree')}
            </Link>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 lg:hidden">
          <LanguageSwitcher />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-700"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-slate-200 bg-white lg:hidden">
          <nav className="mx-auto grid w-[92%] max-w-7xl gap-1 py-3" aria-label={t('nav.mobileAppNavigation')}>
            {navigationItems.map(([href, key]) => (
              <Link
                key={href}
                href={href}
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                {t(key)}
              </Link>
            ))}
            <div className="mt-2 grid gap-2 border-t border-slate-200 pt-3">
              <Link href={user ? '/app/profile' : '/login'} className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => setOpen(false)}>
                {user ? t('nav.profile') : t('nav.login')}
              </Link>
              {!user && (
                <Link href="/signup" className="rounded-md bg-slate-950 px-3 py-2 text-center text-sm font-medium text-white hover:bg-slate-800" onClick={() => setOpen(false)}>
                  {t('home.startFree')}
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
