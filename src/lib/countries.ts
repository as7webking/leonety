import type { Locale } from '@/lib/i18n'

export const countryCodes = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR',
  'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL',
  'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO',
  'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA',
  'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT',
  'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN',
  'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
  'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU',
  'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO',
  'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE',
  'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
  'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS',
  'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM',
  'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH',
  'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM',
  'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT',
  'ZA', 'ZM', 'ZW',
] as const

export type CountryCode = typeof countryCodes[number]

const countryCodeSet = new Set<string>(countryCodes)
const lookupLocales = ['en-US', 'de-DE', 'ru-RU', 'tr-TR', 'uk-UA', 'pl-PL', 'fr-FR'] as const
const intlLocales: Record<Locale, string> = {
  en: 'en-US', de: 'de-DE', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA', pl: 'pl-PL', fr: 'fr-FR',
}

function normalizeLookup(value: string) {
  return value.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

function displayNames(locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    return null
  }
}

export function getCountryName(code: string, locale: Locale) {
  const normalized = code.trim().toUpperCase()
  if (!countryCodeSet.has(normalized)) return code
  return displayNames(intlLocales[locale])?.of(normalized) ?? normalized
}

export function resolveCountryCode(value: string | null | undefined): CountryCode | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const upper = trimmed.toUpperCase()
  if (countryCodeSet.has(upper)) return upper as CountryCode
  if (upper === 'UK') return 'GB'

  const needle = normalizeLookup(trimmed)
  for (const locale of lookupLocales) {
    const names = displayNames(locale)
    if (!names) continue
    for (const code of countryCodes) {
      if (normalizeLookup(names.of(code) ?? '') === needle) return code
    }
  }
  return null
}

export function formatCountryValue(value: string | null | undefined, locale: Locale) {
  if (!value) return ''
  const code = resolveCountryCode(value)
  return code ? getCountryName(code, locale) : value
}

export function getCountrySearchTerms(code: CountryCode, locale: Locale) {
  const terms = new Set<string>([code, getCountryName(code, locale), getCountryName(code, 'en')])
  for (const lookupLocale of lookupLocales) {
    const name = displayNames(lookupLocale)?.of(code)
    if (name) terms.add(name)
  }
  return [...terms].map(normalizeLookup)
}

export function normalizeCountrySearch(value: string) {
  return normalizeLookup(value)
}
