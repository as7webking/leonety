'use client'

import Link from 'next/link'
import { useI18n } from '@/contexts/i18n-context'

export function Footer() {
  const { t } = useI18n()

  return (
    <footer className="mt-auto border-t border-slate-200 bg-white py-12">
          <div className="container mx-auto px-4">
            <div className="grid gap-8 md:grid-cols-4">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <img src="/logo.png" alt="Leonety" className="h-10 w-10 object-contain" />
                  <span className="text-lg font-semibold">Leonety</span>
                </div>
                <p className="text-sm text-slate-600">{t('footer.description')}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-4">{t('footer.product')}</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li><Link href="/#features" className="hover:text-slate-900 transition">{t('footer.features')}</Link></li>
                  <li><Link href="/#pricing" className="hover:text-slate-900 transition">{t('footer.pricing')}</Link></li>
                  <li><Link href="/onboarding" className="hover:text-slate-900 transition">{t('footer.getStarted')}</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-4">{t('footer.support')}</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li><Link href="/#help-center" className="hover:text-slate-900 transition">{t('public.helpCenter')}</Link></li>
                  <li><Link href="/#contact" className="hover:text-slate-900 transition">{t('footer.contact')}</Link></li>
                  <li><a href="mailto:support@leonety.app" className="hover:text-slate-900 transition">{t('footer.emailUs')}</a></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-4">Legal</p>
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
