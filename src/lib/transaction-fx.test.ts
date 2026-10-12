import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { getStoredWorkspaceAmount, multiplyMoneyByRate, roundDecimalToScale } from './decimal-money.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { transactionFxDictionaries } from './transaction-fx-i18n.ts'

test('FX multiplication uses decimal arithmetic and target currency precision', () => {
  assert.equal(multiplyMoneyByRate('100.00', '0.863', 'EUR'), '86.30')
  assert.equal(multiplyMoneyByRate('100.00', '1.5', 'JPY'), '150')
  assert.equal(multiplyMoneyByRate('1.01', '0.5', 'EUR'), '0.51')
  assert.equal(multiplyMoneyByRate('99.00', '99', 'EUR'), '9801.00')
  assert.equal(multiplyMoneyByRate('1.00', '1e-7', 'EUR'), '0.00')
  assert.equal(roundDecimalToScale('0.8630123456', 8), '0.86301235')
  assert.equal(multiplyMoneyByRate('100.00', roundDecimalToScale('0.8630123456', 8), 'EUR'), '86.30')
})

test('legacy foreign records without a stored conversion are never recalculated', () => {
  assert.equal(getStoredWorkspaceAmount({ amount: '100.00', currency: 'USD', workspace_currency: 'EUR' }), null)
  assert.equal(getStoredWorkspaceAmount({ amount: '100.00', currency: 'EUR', workspace_currency: 'EUR' }), '100.00')
  assert.equal(getStoredWorkspaceAmount({ amount: '100.00', currency: 'USD', workspace_currency: 'EUR', workspace_amount: '86.30' }), '86.30')
})

test('currency snapshot messages exist in every supported locale', () => {
  const locales = ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const
  const expected = Object.keys(transactionFxDictionaries.en).sort()
  for (const locale of locales) {
    assert.deepEqual(Object.keys(transactionFxDictionaries[locale]).sort(), expected, locale)
  }
})
