export type SupportedCurrencyCode =
  | 'EUR'
  | 'GBP'
  | 'CHF'
  | 'DKK'
  | 'NOK'
  | 'SEK'
  | 'PLN'
  | 'CZK'
  | 'HUF'
  | 'RON'
  | 'RUB'
  | 'USD'
  | 'CAD'
  | 'AUD'
  | 'JPY'
  | 'TRY'
  | 'AMD'
  | 'GEL'
  | 'AZN'
  | 'UAH'
  | 'KZT'

export interface CurrencyOption {
  code: SupportedCurrencyCode
  label: string
  locale: string
}

const defaultRates: Record<SupportedCurrencyCode, number> = {
  USD: 1,
  EUR: 0.91,
  GBP: 0.8,
  CHF: 0.89,
  DKK: 6.95,
  NOK: 10.27,
  SEK: 9.72,
  PLN: 4.2,
  CZK: 24.8,
  HUF: 353,
  RON: 4.43,
  RUB: 92,
  CAD: 1.37,
  AUD: 1.54,
  JPY: 144.41,
  TRY: 32.4,
  AMD: 388,
  GEL: 2.69,
  AZN: 1.7,
  UAH: 39.3,
  KZT: 446,
}

export const currencyOptions: CurrencyOption[] = [
  { code: 'EUR', label: 'Euro', locale: 'de-DE' },
  { code: 'GBP', label: 'British Pound', locale: 'en-GB' },
  { code: 'CHF', label: 'Swiss Franc', locale: 'de-CH' },
  { code: 'DKK', label: 'Danish Krone', locale: 'da-DK' },
  { code: 'NOK', label: 'Norwegian Krone', locale: 'nb-NO' },
  { code: 'SEK', label: 'Swedish Krona', locale: 'sv-SE' },
  { code: 'PLN', label: 'Polish Zloty', locale: 'pl-PL' },
  { code: 'CZK', label: 'Czech Koruna', locale: 'cs-CZ' },
  { code: 'HUF', label: 'Hungarian Forint', locale: 'hu-HU' },
  { code: 'RON', label: 'Romanian Leu', locale: 'ro-RO' },
  { code: 'RUB', label: 'Russian Ruble', locale: 'ru-RU' },
  { code: 'USD', label: 'US Dollar', locale: 'en-US' },
  { code: 'CAD', label: 'Canadian Dollar', locale: 'en-CA' },
  { code: 'AUD', label: 'Australian Dollar', locale: 'en-AU' },
  { code: 'JPY', label: 'Japanese Yen', locale: 'ja-JP' },
  { code: 'TRY', label: 'Turkish Lira', locale: 'tr-TR' },
  { code: 'AMD', label: 'Armenian Dram', locale: 'hy-AM' },
  { code: 'GEL', label: 'Georgian Lari', locale: 'ka-GE' },
  { code: 'AZN', label: 'Azerbaijani Manat', locale: 'az-AZ' },
  { code: 'UAH', label: 'Ukrainian Hryvnia', locale: 'uk-UA' },
  { code: 'KZT', label: 'Kazakhstani Tenge', locale: 'kk-KZ' },
]

const optionMap = new Map(currencyOptions.map((option) => [option.code, option]))

export function isSupportedCurrency(code: string): code is SupportedCurrencyCode {
  return optionMap.has(code.toUpperCase() as SupportedCurrencyCode)
}

export function normalizeCurrencyCode(code: string | null | undefined, fallback: SupportedCurrencyCode = 'USD'): SupportedCurrencyCode {
  const normalized = code?.trim().toUpperCase()
  return normalized && isSupportedCurrency(normalized) ? normalized : fallback
}

export function getCurrencyOption(code: string | null | undefined) {
  return optionMap.get(normalizeCurrencyCode(code))
}

export function getExchangeRates(overrides?: Partial<Record<SupportedCurrencyCode, number>> | null) {
  return {
    ...defaultRates,
    ...(overrides ?? {}),
  }
}

export function convertToCurrency(
  amount: number,
  from: string,
  to: string,
  overrides?: Partial<Record<SupportedCurrencyCode, number>> | null
) {
  const rates = getExchangeRates(overrides)
  const fromCurrency = normalizeCurrencyCode(from)
  const toCurrency = normalizeCurrencyCode(to)
  const fromRate = rates[fromCurrency] ?? 1
  const toRate = rates[toCurrency] ?? 1
  const base = amount / fromRate
  return Number((base * toRate).toFixed(2))
}

export function formatCurrency(amount: number, currency: string, locale?: string) {
  const normalizedCurrency = normalizeCurrencyCode(currency)
  const currencyLocale = locale ?? getCurrencyOption(normalizedCurrency)?.locale ?? 'en-US'

  return new Intl.NumberFormat(currencyLocale, {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function getSavedAmountInWorkspaceCurrency(params: {
  amount: number
  transactionCurrency: string
  workspaceCurrency: string
  savedExchangeRate?: number | null
}) {
  const { amount, transactionCurrency, workspaceCurrency, savedExchangeRate } = params

  if (typeof savedExchangeRate === 'number' && Number.isFinite(savedExchangeRate) && savedExchangeRate > 0) {
    return Number((amount * savedExchangeRate).toFixed(2))
  }

  return convertToCurrency(amount, transactionCurrency, workspaceCurrency)
}
