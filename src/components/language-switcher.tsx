'use client'

import { locales, type Locale } from '@/lib/i18n'
import { useI18n } from '@/contexts/i18n-context'
import { AppSelect } from '@/components/app-select'

const labels: Record<Locale, string> = {
  en: 'EN - English',
  de: 'DE - Deutsch',
  ru: 'RU - Русский',
  tr: 'TR - Türkçe',
  uk: 'UA - Українська',
  pl: 'PL - Polski',
  fr: 'FR - Français',
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()

  return (
    <div>
      <label htmlFor="language-switcher" className="sr-only">{t('language.label')}</label>
      <AppSelect
        value={locale}
        onChange={(value) => setLocale(value as Locale)}
        options={locales.map((item) => ({ value: item, label: labels[item] }))}
        ariaLabel={t('language.label')}
        className="w-28 sm:w-40"
      />
    </div>
  )
}
