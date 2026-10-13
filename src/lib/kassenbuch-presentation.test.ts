import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildKassenbuch, type KassenbuchTransaction } from './kassenbuch.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildKassenbuchPresentation, getKassenbuchDays, kassenbuchTransactionKey, parseKassenbuchCustomOrder, parseKassenbuchPrintOrder } from './kassenbuch-presentation.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { kassenbuchDictionaries } from './kassenbuch-i18n.ts'

function transaction(overrides: Partial<KassenbuchTransaction>): KassenbuchTransaction {
  return {
    id: '1', type: 'income', date: '2026-10-11', amount: 100, currency: 'EUR',
    payment_method: 'cash', ...overrides,
  }
}

function fixture() {
  return buildKassenbuch({
    currency: 'EUR',
    openingTransactions: [transaction({ id: 'opening', date: '2026-10-01', amount: 1000 })],
    periodTransactions: [
      transaction({ id: 'income-a', amount: 40, created_at: '2026-10-11T09:00:00Z' }),
      transaction({ id: 'expense-a', type: 'expense', amount: 12, created_at: '2026-10-11T10:00:00Z' }),
      transaction({ id: 'income-b', amount: 25, created_at: '2026-10-11T11:00:00Z' }),
      transaction({ id: 'expense-b', type: 'expense', date: '2026-10-12', amount: 3, created_at: '2026-10-12T09:00:00Z' }),
      transaction({ id: 'nov-income', date: '2026-11-01', amount: 5 }),
    ],
  })
}

function transactionIds(rows: ReturnType<typeof fixture>['rows']) {
  return rows.filter((row) => row.kind === 'transaction').map((row) => row.transaction.id)
}

test('income-first and expenses-first reorder only within each date', () => {
  const result = fixture()
  const incomeFirst = buildKassenbuchPresentation(result, 'income-first')
  const expensesFirst = buildKassenbuchPresentation(result, 'expenses-first')
  assert.deepEqual(transactionIds(incomeFirst.months[0]!.rows), ['income-a', 'income-b', 'expense-a', 'expense-b'])
  assert.deepEqual(transactionIds(expensesFirst.months[0]!.rows), ['expense-a', 'income-a', 'income-b', 'expense-b'])
  assert.deepEqual(transactionIds(incomeFirst.months[1]!.rows), ['nov-income'])
})

test('custom ordering is date-scoped and reset returns the canonical rows', () => {
  const result = fixture()
  const day = getKassenbuchDays(result).find((entry) => entry.date === '2026-10-11')!
  const keys = day.transactions.map(kassenbuchTransactionKey)
  const custom = buildKassenbuchPresentation(result, 'custom', {
    '2026-10-11': [keys[2]!, keys[0]!, keys[1]!],
  })
  assert.deepEqual(transactionIds(custom.months[0]!.rows), ['income-b', 'income-a', 'expense-a', 'expense-b'])
  assert.deepEqual(transactionIds(custom.months[1]!.rows), ['nov-income'])
  assert.strictEqual(buildKassenbuchPresentation(result, 'chronological'), result)
  assert.deepEqual(transactionIds(result.rows), ['income-a', 'expense-a', 'income-b', 'expense-b', 'nov-income'])
})

test('all presentation modes preserve totals, daily closings, month closings and final balance', () => {
  const result = fixture()
  const expectedDaily = result.rows.filter((row) => row.kind === 'daily-closing').map((row) => [row.date, row.balanceMinor])
  const modes = [
    buildKassenbuchPresentation(result, 'chronological'),
    buildKassenbuchPresentation(result, 'income-first'),
    buildKassenbuchPresentation(result, 'expenses-first'),
    buildKassenbuchPresentation(result, 'custom', {
      '2026-10-11': ['expense:expense-a', 'income:income-b', 'income:income-a'],
    }),
  ]
  for (const presented of modes) {
    assert.equal(presented.openingBalanceMinor, result.openingBalanceMinor)
    assert.equal(presented.incomeTotalMinor, result.incomeTotalMinor)
    assert.equal(presented.expenseTotalMinor, result.expenseTotalMinor)
    assert.equal(presented.closingBalanceMinor, result.closingBalanceMinor)
    assert.deepEqual(presented.months.map((month) => month.closingBalanceMinor), result.months.map((month) => month.closingBalanceMinor))
    assert.deepEqual(presented.months.flatMap((month) => month.rows.filter((row) => row.kind === 'daily-closing').map((row) => [row.date, row.balanceMinor])), expectedDaily)
  }
})

test('order preferences and custom storage are validated', () => {
  assert.equal(parseKassenbuchPrintOrder('custom'), 'custom')
  assert.equal(parseKassenbuchPrintOrder('unexpected'), 'chronological')
  assert.deepEqual(parseKassenbuchCustomOrder('{"2026-10-11":["income:a"]}'), { '2026-10-11': ['income:a'] })
  assert.deepEqual(parseKassenbuchCustomOrder('{bad json'), {})
  assert.deepEqual(parseKassenbuchCustomOrder('x'.repeat(500_001)), {})
})

test('ordering controls are translated in every supported locale', () => {
  const keys = [
    'kassenbuch.preferredOrdering', 'kassenbuch.preferenceHint', 'kassenbuch.ordering',
    'kassenbuch.order.chronological', 'kassenbuch.order.income-first',
    'kassenbuch.order.expenses-first', 'kassenbuch.order.custom', 'kassenbuch.resetChronological',
    'kassenbuch.customOrderHint', 'kassenbuch.moveEarlier', 'kassenbuch.moveLater',
    'kassenbuch.nonChronologicalBalanceNote',
  ] as const
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const) {
    for (const key of keys) assert.ok(kassenbuchDictionaries[locale][key], `${locale}: ${key}`)
  }
})
