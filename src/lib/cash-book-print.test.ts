import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { appendCashBookEntry, buildCashBookBalance, type CashBookEntry, type CashBookRegister } from './cash-book.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildCashBookPrintModel } from './cash-book-print.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { cashBookModuleDictionaries } from './cash-book-module-i18n.ts'

const register: CashBookRegister = { id: 'register-1', workspaceId: 'workspace-1', currency: 'EUR', active: true }

function entry(overrides: Partial<CashBookEntry>): CashBookEntry {
  return {
    id: 'entry', registerId: register.id, workspaceId: register.workspaceId, kind: 'income',
    date: '2026-11-10', createdAt: '2026-11-10T09:00:00Z', createdBy: 'user-1', currency: 'EUR',
    amountMinor: 1000, description: 'Cash receipt', idempotencyKey: 'request', paymentMethod: 'cash',
    ...overrides,
  }
}

test('builds the five-column print model with period opening/closing and every in-range entry exactly once', () => {
  let entries: CashBookEntry[] = []
  entries = appendCashBookEntry(register, entries, entry({
    id: 'opening', kind: 'opening', date: '2026-11-01', amountMinor: 5000,
    paymentMethod: null, openingConfirmed: true, idempotencyKey: 'opening', description: 'Opening balance',
  }))
  entries = appendCashBookEntry(register, entries, entry({
    id: 'before', date: '2026-11-05', amountMinor: 2500, idempotencyKey: 'before',
  }))
  entries = appendCashBookEntry(register, entries, entry({
    id: 'in-period', date: '2026-11-10', amountMinor: 1000, idempotencyKey: 'income',
    receiptReference: 'R-12', description: 'Service payment',
  }))
  entries = appendCashBookEntry(register, entries, entry({
    id: 'expense', kind: 'expense', date: '2026-11-12', amountMinor: 400, idempotencyKey: 'expense',
    description: 'Cash purchase',
  }))
  entries = appendCashBookEntry(register, entries, entry({
    id: 'after', date: '2026-12-01', amountMinor: 700, idempotencyKey: 'after',
  }))

  const model = buildCashBookPrintModel({
    balance: buildCashBookBalance(register, entries), workspaceName: 'Leonety GmbH', registerName: 'Main cash desk',
    currency: 'eur', periodStart: '2026-11-10', periodEnd: '2026-11-30',
  })

  assert.equal(model.openingBalanceMinor, 7500)
  assert.equal(model.closingBalanceMinor, 8100)
  assert.deepEqual(model.rows.map((row) => row.id), ['in-period', 'expense'])
  assert.deepEqual(model.rows.map((row) => [row.incomeMinor, row.expenseMinor]), [[1000, null], [null, 400]])
  assert.equal(model.rows[0].text, 'Service payment')
  assert.equal(model.rows[0].receiptReference, 'R-12')
  assert.equal(model.currency, 'EUR')
})

test('keeps opening entries in the text/balance columns and does not count them as income', () => {
  const opening = entry({
    id: 'opening', kind: 'opening', amountMinor: 2500, paymentMethod: null,
    openingConfirmed: true, idempotencyKey: 'opening', description: 'Opening balance',
  })
  const model = buildCashBookPrintModel({
    balance: buildCashBookBalance(register, [opening]), workspaceName: 'Workspace', registerName: 'Register',
    currency: 'EUR', periodStart: opening.date, periodEnd: opening.date,
  })

  assert.equal(model.rows.length, 1)
  assert.equal(model.rows[0].incomeMinor, null)
  assert.equal(model.rows[0].expenseMinor, null)
  assert.equal(model.rows[0].balanceMinor, 2500)
})

test('rejects invalid and inverted print periods', () => {
  const base = {
    balance: buildCashBookBalance(register, []), workspaceName: 'Workspace', registerName: 'Register',
    currency: 'EUR', periodStart: '2026-11-30', periodEnd: '2026-11-01',
  }
  assert.throws(() => buildCashBookPrintModel(base))
  assert.throws(() => buildCashBookPrintModel({ ...base, periodStart: 'not-a-date', periodEnd: '2026-11-30' }))
})

test('new cash-book print labels are translated in every supported locale', () => {
  const keys = ['cashBook.moduleTitle', 'cashBook.register', 'cashBook.print', 'cashBook.opening', 'cashBook.closing', 'cashBook.receipt', 'cashBook.noEntries'] as const
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const) {
    for (const key of keys) {
      assert.ok(cashBookModuleDictionaries[locale][key], `${locale} is missing ${key}`)
    }
  }
})
