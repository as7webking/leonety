'use client'

import Link from "next/link"
import { LanguageSwitcher } from '@/components/language-switcher'
import { Logo } from '@/components/logo'
import { useI18n } from '@/contexts/i18n-context'

interface PublicHeaderProps {
  user?: { id: string } | null
}

export function PublicHeader({ user }: PublicHeaderProps) {
  const { t } = useI18n()

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Logo size="md" />
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <Link href="/#product" className="transition hover:text-slate-900">{t('public.product')}</Link>
          <Link href="/#features" className="transition hover:text-slate-900">{t('public.features')}</Link>
          <Link href="/#integrations" className="transition hover:text-slate-900">{t('public.integrations')}</Link>
          <Link href="/#pricing" className="transition hover:text-slate-900">{t('public.pricing')}</Link>
          <Link href="/#support" className="transition hover:text-slate-900">{t('public.support')}</Link>
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link href={user ? '/app/profile' : '/login'} className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
            {user ? t('nav.profile') : t('nav.login')}
          </Link>
          {!user && (
            <Link href="/onboarding" className="hidden rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 sm:inline-flex">
              {t('home.startFree')}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
