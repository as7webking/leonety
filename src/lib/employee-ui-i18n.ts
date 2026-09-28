import type { Locale } from '@/lib/i18n'

const en = {
  'profile.lastSignIn': 'Last sign-in',
  'profile.monthsForUser': 'Months for {email}',
  'profile.invoiceNumberPrefixPlaceholder': 'INV / RE',
}

type EmployeeUiDictionary = Record<keyof typeof en, string>

export const employeeUiDictionaries: Record<Locale, EmployeeUiDictionary> = {
  en,
  de: {
    'profile.lastSignIn': 'Letzte Anmeldung',
    'profile.monthsForUser': 'Monate für {email}',
    'profile.invoiceNumberPrefixPlaceholder': 'RE / RG',
  },
  ru: {
    'profile.lastSignIn': 'Последний вход',
    'profile.monthsForUser': 'Месяцы для {email}',
    'profile.invoiceNumberPrefixPlaceholder': 'INV / СЧ',
  },
  tr: {
    'profile.lastSignIn': 'Son giriş',
    'profile.monthsForUser': '{email} için aylar',
    'profile.invoiceNumberPrefixPlaceholder': 'INV / FTR',
  },
  uk: {
    'profile.lastSignIn': 'Останній вхід',
    'profile.monthsForUser': 'Місяці для {email}',
    'profile.invoiceNumberPrefixPlaceholder': 'INV / РАХ',
  },
  pl: {
    'profile.lastSignIn': 'Ostatnie logowanie',
    'profile.monthsForUser': 'Miesiące dla {email}',
    'profile.invoiceNumberPrefixPlaceholder': 'INV / FV',
  },
  fr: {
    'profile.lastSignIn': 'Dernière connexion',
    'profile.monthsForUser': 'Mois pour {email}',
    'profile.invoiceNumberPrefixPlaceholder': 'INV / FAC',
  },
}
