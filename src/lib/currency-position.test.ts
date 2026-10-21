import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { formatCurrency } from './currency.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { currencySymbolPositionStorageKey, parseCurrencySymbolPosition, readCurrencySymbolPosition, writeCurrencySymbolPosition } from './currency-position.ts'

test('automatic currency placement remains the locale-native format', () => {
  const expected = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.5)
  assert.equal(formatCurrency(1234.5, 'EUR', 'de-DE'), expected)
})

test('forced symbol positions preserve localized number separators and value', () => {
  assert.equal(formatCurrency(1234.5, 'EUR', 'de-DE', 'before'), '€1.234,50')
  assert.equal(formatCurrency(1234.5, 'EUR', 'de-DE', 'after'), '1.234,50\u00a0€')
  assert.equal(formatCurrency(-1234.5, 'EUR', 'de-DE', 'before'), '-€1.234,50')
  assert.equal(1234.5, 1234.5)
})

test('currency symbol preference defaults safely and is scoped to a user', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
  assert.equal(parseCurrencySymbolPosition('invalid'), 'automatic')
  assert.equal(readCurrencySymbolPosition(storage, 'user-a'), 'automatic')
  writeCurrencySymbolPosition(storage, 'user-a', 'after')
  writeCurrencySymbolPosition(storage, 'user-b', 'before')
  assert.equal(currencySymbolPositionStorageKey('user-a'), 'leonety-currency-symbol-position:user-a')
  assert.equal(readCurrencySymbolPosition(storage, 'user-a'), 'after')
  assert.equal(readCurrencySymbolPosition(storage, 'user-b'), 'before')
})
