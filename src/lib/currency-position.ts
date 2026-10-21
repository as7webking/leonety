import type { CurrencySymbolPosition } from '@/lib/currency'

export const DEFAULT_CURRENCY_SYMBOL_POSITION: CurrencySymbolPosition = 'automatic'

export function currencySymbolPositionStorageKey(userId: string) {
  return `leonety-currency-symbol-position:${userId}`
}

export function parseCurrencySymbolPosition(value: string | null | undefined): CurrencySymbolPosition {
  return value === 'before' || value === 'after' ? value : DEFAULT_CURRENCY_SYMBOL_POSITION
}

export function readCurrencySymbolPosition(storage: Pick<Storage, 'getItem'>, userId: string) {
  return parseCurrencySymbolPosition(storage.getItem(currencySymbolPositionStorageKey(userId)))
}

export function writeCurrencySymbolPosition(
  storage: Pick<Storage, 'setItem'>,
  userId: string,
  position: CurrencySymbolPosition
) {
  storage.setItem(currencySymbolPositionStorageKey(userId), position)
}
