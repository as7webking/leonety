'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/contexts/i18n-context'
import { Logo } from '@/components/logo'

export function Footer() {
  const { t } = useI18n()
  const pathname = usePathname()
  const isAuthPage = pathname === '/login' || pathname === '/reset-password'
  const isAppPage = pathname === '/app' || pathname.startsWith('/app/')

  if (isAuthPage) {
    return (
      <footer className="border-t border-slate-200 bg-white py-5">
        <div className="mx-auto flex w-[90%] max-w-7xl flex-col items-center justify-between gap-2 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="font-medium text-slate-700">Leonety</span>
          </div>
          <p>© 2026 Leonety. {t('footer.rights')}</p>
        </div>
      </footer>
    )
  }

  if (isAppPage) {
    return (
      <footer data-app-fixed-footer className="fixed inset-x-0 bottom-0 z-40 box-border h-[calc(var(--app-footer-content-height)+env(safe-area-inset-bottom))] border-t border-slate-200 bg-slate-50 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] print:hidden">
        <div className="mx-auto grid h-[var(--app-footer-content-height)] w-[90%] max-w-7xl grid-rows-[1.25rem_1rem] content-center gap-1 text-[11px] leading-4 text-slate-500 sm:flex sm:items-center sm:justify-between sm:gap-3 sm:text-xs">
          <div className="order-2 flex min-w-0 items-center justify-center sm:order-1 sm:justify-start">
            <p className="truncate">© 2026 Leonety. {t('footer.rights')}</p>
          </div>
          <div className="order-1 grid min-w-0 grid-cols-3 items-center gap-2 text-center sm:order-2 sm:flex sm:justify-end sm:gap-3">
            <Link href="/privacy" className="truncate hover:text-slate-900">{t('legal.privacy')}</Link>
            <Link href="/terms" className="truncate hover:text-slate-900">{t('legal.terms')}</Link>
            <Link href="/impressum" className="truncate hover:text-slate-900">{t('legal.impressum')}</Link>
          </div>
        </div>
      </footer>
    )
  }

  return (
    <footer className="mt-auto border-t border-slate-200 bg-white py-12">
          <div className="container mx-auto px-4">
            <div className="grid gap-8 md:grid-cols-4">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <Logo size="md" />
                  <span className="text-lg font-semibold">Leonety</span>
                </div>
                <p className="text-sm text-slate-600">{t('footer.description')}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-4">{t('footer.product')}</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li><Link href="/#features" className="hover:text-slate-900 transition">{t('footer.features')}</Link></li>
                  <li><Link href="/pricing" className="hover:text-slate-900 transition">{t('footer.pricing')}</Link></li>
                  <li><Link href="/signup" className="hover:text-slate-900 transition">{t('footer.getStarted')}</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-4">{t('footer.support')}</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li><Link href="/#faq" className="hover:text-slate-900 transition">{t('public.helpCenter')}</Link></li>
                  <li><Link href="/#support" className="hover:text-slate-900 transition">{t('footer.contact')}</Link></li>
                  <li><a href="mailto:admin@ahmedsultanline.com" className="hover:text-slate-900 transition">{t('footer.emailUs')}</a></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-4">{t('footer.legal')}</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li><Link href="/privacy" className="hover:text-slate-900 transition">{t('legal.privacy')}</Link></li>
                  <li><Link href="/terms" className="hover:text-slate-900 transition">{t('legal.terms')}</Link></li>
                  <li><Link href="/cookies" className="hover:text-slate-900 transition">{t('legal.cookies')}</Link></li>
                  <li><Link href="/impressum" className="hover:text-slate-900 transition">{t('legal.impressum')}</Link></li>
                  <li><Link href="/delete-account" className="hover:text-slate-900 transition">{t('legal.deleteAccount')}</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-slate-200 mt-12 pt-8">
              <p className="text-center text-sm text-slate-600">© 2026 Leonety. {t('footer.rights')}</p>
            </div>
          </div>
        </footer>
  )
}
