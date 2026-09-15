import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildKassenbuch, getKassenbuchText, type KassenbuchTransaction } from './kassenbuch.ts'

function transaction(overrides: Partial<KassenbuchTransaction>): KassenbuchTransaction {
  return {
    id: '1',
    type: 'income',
    date: '2026-09-10',
    amount: 100,
    currency: 'EUR',
    payment_method: 'cash',
    ...overrides,
  }
}

test('calculates daily closing balances and carries them forward', () => {
  const result = buildKassenbuch({
    currency: 'EUR',
    openingTransactions: [transaction({ id: 'opening', date: '2026-09-01', amount: 1000 })],
    periodTransactions: [
      transaction({ id: 'a', date: '2026-09-10', amount: 100 }),
      transaction({ id: 'b', type: 'expense', date: '2026-09-10', amount: 25 }),
      transaction({ id: 'c', type: 'expense', date: '2026-09-11', amount: 50 }),
      transaction({ id: 'd', date: '2026-09-11', amount: 20 }),
    ],
  })

  assert.equal(result.openingBalanceMinor, 100000)
  assert.deepEqual(
    result.rows.filter((row) => row.kind === 'daily-closing').map((row) => row.balanceMinor),
    [107500, 104500],
  )
  assert.equal(result.closingBalanceMinor, 104500)
  assert.equal(result.rows.at(-1)?.kind === 'daily-closing' ? result.rows.at(-1)?.balanceMinor : null, result.closingBalanceMinor)
  assert.equal(result.incomeTotalMinor, 12000)
  assert.equal(result.expenseTotalMinor, 7500)
})

test('handles only income, only expenses, same-day rows and an empty period', () => {
  const income = buildKassenbuch({
    currency: 'EUR', openingTransactions: [],
    periodTransactions: [transaction({ id: 'b', amount: 10 }), transaction({ id: 'a', amount: 20 })],
  })
  assert.equal(income.closingBalanceMinor, 3000)
  assert.equal(income.rows.at(-1)?.kind, 'daily-closing')

  const expense = buildKassenbuch({
    currency: 'EUR', openingTransactions: [],
    periodTransactions: [transaction({ type: 'expense', amount: 12.34 })],
  })
  assert.equal(expense.closingBalanceMinor, -1234)

  const empty = buildKassenbuch({ currency: 'EUR', openingTransactions: [], periodTransactions: [] })
  assert.deepEqual(empty.rows, [])
  assert.deepEqual(empty.months, [])
  assert.equal(empty.closingBalanceMinor, 0)
})

test('groups one, two and three months without resetting balances or creating empty months', () => {
  const result = buildKassenbuch({
    currency: 'EUR',
    openingTransactions: [transaction({ id: 'opening', date: '2026-08-31', amount: 1000 })],
    periodTransactions: [
      transaction({ id: 'sep', date: '2026-09-30', amount: 500 }),
      transaction({ id: 'oct', date: '2026-10-15', amount: 300 }),
      transaction({ id: 'nov', type: 'expense', date: '2026-11-01', amount: 200 }),
    ],
  })

  assert.deepEqual(result.months.map((month) => month.key), ['2026-09', '2026-10', '2026-11'])
  assert.deepEqual(result.months.map((month) => month.openingBalanceMinor), [100000, 150000, 180000])
  assert.deepEqual(result.months.map((month) => month.closingBalanceMinor), [150000, 180000, 160000])
  assert.equal(result.closingBalanceMinor, 160000)
})

test('groups a December to January year boundary', () => {
  const result = buildKassenbuch({
    currency: 'EUR',
    openingTransactions: [],
    periodTransactions: [
      transaction({ id: 'dec', date: '2026-12-31', amount: 10 }),
      transaction({ id: 'jan', date: '2027-01-01', amount: 5 }),
    ],
  })

  assert.deepEqual(result.months.map((month) => month.key), ['2026-12', '2027-01'])
  assert.equal(result.months[1]?.openingBalanceMinor, 1000)
  assert.equal(result.months[1]?.closingBalanceMinor, 1500)
})

test('does not create a section for an empty month', () => {
  const result = buildKassenbuch({
    currency: 'EUR',
    openingTransactions: [],
    periodTransactions: [
      transaction({ id: 'sep', date: '2026-09-30', amount: 10 }),
      transaction({ id: 'nov', date: '2026-11-01', amount: 5 }),
    ],
  })

  assert.deepEqual(result.months.map((month) => month.key), ['2026-09', '2026-11'])
  assert.equal(result.months[1]?.openingBalanceMinor, 1000)
})

test('excludes known non-cash methods, includes unclassified legacy rows, and preserves adjustments', () => {
  const result = buildKassenbuch({
    currency: 'EUR',
    openingTransactions: [],
    periodTransactions: [
      transaction({ id: 'cash', amount: 100 }),
      transaction({ id: 'card', amount: 200, payment_method: 'card' }),
      transaction({ id: 'bank', amount: 300, payment_method: 'bank_transfer' }),
      transaction({ id: 'legacy', type: 'expense', amount: -10, payment_method: null }),
      transaction({ id: 'split', amount: 80, payment_method: null, cash_amount: 20 }),
      transaction({ id: 'usd', amount: 500, currency: 'USD' }),
    ],
  })

  assert.equal(result.closingBalanceMinor, 13000)
  assert.equal(result.excludedNonCashCount, 2)
  assert.equal(result.excludedCurrencyCount, 1)
  assert.equal(result.unclassifiedPaymentCount, 1)
})

test('uses title before description, reference, category and generic fallback', () => {
  assert.equal(getKassenbuchText(transaction({ title: 'Shell', description: 'Fuel' }), 'Transaction'), 'Shell')
  assert.equal(getKassenbuchText(transaction({ title: '', description: 'Fuel' }), 'Transaction'), 'Fuel')
  assert.equal(getKassenbuchText(transaction({ title: '', description: '', reference: 'INV-1' }), 'Transaction'), 'INV-1')
  assert.equal(getKassenbuchText(transaction({ title: '', description: '', reference: '', category: 'Other' }), 'Transaction'), 'Other')
  assert.equal(getKassenbuchText(transaction({ title: '', description: '', reference: '', category: '' }), 'Transaction'), 'Transaction')
})
