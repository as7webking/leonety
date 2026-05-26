'use client'

import { locales, type Locale } from '@/lib/i18n'
import { useI18n } from '@/contexts/i18n-context'

const labels: Record<Locale, string> = {
  en: 'EN',
  de: 'DE',
  ru: 'RU',
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()

  return (
    <div>
      <label htmlFor="language-switcher" className="sr-only">{t('language.label')}</label>
      <select
        id="language-switcher"
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="rounded-md border bg-background px-2 py-2 text-sm"
      >
        {locales.map((item) => (
          <option key={item} value={item}>{labels[item]}</option>
        ))}
      </select>
    </div>
  )
}
