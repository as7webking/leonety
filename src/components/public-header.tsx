'use client'

import Link from "next/link"
import { LanguageSwitcher } from '@/components/language-switcher'
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
          <img src="/logo.png" alt="Leonety" className="h-10 w-10 object-contain" />
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <Link href="/#product" className="transition hover:text-slate-900">{t('public.product')}</Link>
          <Link href="/#features" className="transition hover:text-slate-900">{t('public.features')}</Link>
          <Link href="/#pricing" className="transition hover:text-slate-900">{t('public.pricing')}</Link>
          <Link href="/#workflows" className="transition hover:text-slate-900">{t('public.workflows')}</Link>
          <Link href="/#support" className="transition hover:text-slate-900">{t('public.support')}</Link>
          <Link href="/#help-center" className="transition hover:text-slate-900">{t('public.helpCenter')}</Link>
          <Link href="/privacy" className="transition hover:text-slate-900">{t('legal.privacy')}</Link>
          <Link href="/terms" className="transition hover:text-slate-900">{t('legal.terms')}</Link>
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link href={user ? '/profile' : '/login'} className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
            {user ? t('nav.profile') : t('nav.login')}
          </Link>
        </div>
      </div>
    </header>
  )
}
