import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { appendCashBookEntry, buildCashBookBalance, CashBookDomainError, type CashBookEntry, type CashBookRegister } from './cash-book.ts'

const register: CashBookRegister = {
  id: 'register-1',
  workspaceId: 'workspace-1',
  currency: 'EUR',
  active: true,
}

function entry(overrides: Partial<CashBookEntry> = {}): CashBookEntry {
  return {
    id: 'entry-1',
    registerId: register.id,
    workspaceId: register.workspaceId,
    kind: 'income',
    date: '2026-11-20',
    createdAt: '2026-11-20T10:00:00.000Z',
    createdBy: 'user-1',
    currency: 'EUR',
    amountMinor: 1250,
    description: 'Cash sale',
    idempotencyKey: 'request-1',
    paymentMethod: 'cash',
    ...overrides,
  }
}

function assertDomainError(code: string, action: () => unknown) {
  assert.throws(action, (error) => error instanceof CashBookDomainError && error.code === code)
}

test('accepts explicitly classified cash and rejects missing, unknown or non-cash methods', () => {
  assert.equal(appendCashBookEntry(register, [], entry()).length, 1)
  for (const paymentMethod of [null, undefined, 'card', 'bank_transfer', 'unknown']) {
    assertDomainError('cash_not_confirmed', () => appendCashBookEntry(register, [], entry({ paymentMethod })))
  }
})

test('requires an explicitly confirmed opening balance and only permits it as the first posting', () => {
  assertDomainError('opening_not_confirmed', () => appendCashBookEntry(register, [], entry({
    kind: 'opening', paymentMethod: null, openingConfirmed: false, amountMinor: 0,
  })))

  const opening = entry({
    kind: 'opening', paymentMethod: null, openingConfirmed: true, amountMinor: 10000,
    idempotencyKey: 'opening-1',
  })
  const withOpening = appendCashBookEntry(register, [], opening)
  assertDomainError('opening_not_first', () => appendCashBookEntry(register, withOpening, entry({ id: 'later-opening', kind: 'opening', openingConfirmed: true })))
})

test('calculates stable chronological balances in integer minor units', () => {
  const opening = entry({
    id: 'opening', kind: 'opening', amountMinor: 10000, paymentMethod: null,
    openingConfirmed: true, date: '2026-11-01', createdAt: '2026-11-01T08:00:00.000Z',
    idempotencyKey: 'opening',
  })
  const income = entry({
    id: 'income', amountMinor: 505, date: '2026-11-03', createdAt: '2026-11-03T10:00:00.000Z',
    idempotencyKey: 'income',
  })
  const expense = entry({
    id: 'expense', kind: 'expense', amountMinor: 1200, date: '2026-11-03',
    createdAt: '2026-11-03T11:00:00.000Z', idempotencyKey: 'expense',
  })

  const result = buildCashBookBalance(register, [expense, income, opening])
  assert.deepEqual(result.rows.map((row) => row.entry.id), ['opening', 'income', 'expense'])
  assert.deepEqual(result.rows.map((row) => row.balanceMinor), [10000, 10505, 9305])
  assert.equal(result.closingBalanceMinor, 9305)
})

test('detects negative chronological balances and rejects a posting that creates one', () => {
  const expense = entry({ kind: 'expense', paymentMethod: 'cash', amountMinor: 500, idempotencyKey: 'expense' })
  assert.deepEqual(buildCashBookBalance(register, [expense]).negativeBalanceEntryIds, ['entry-1'])
  assertDomainError('negative_balance', () => appendCashBookEntry(register, [], expense))
})

test('keeps register balances and currencies isolated', () => {
  const secondRegister: CashBookRegister = { id: 'register-2', workspaceId: register.workspaceId, currency: 'USD', active: true }
  const eurIncome = entry({ id: 'eur', idempotencyKey: 'eur', amountMinor: 2500 })
  const usdIncome: CashBookEntry = {
    ...eurIncome, id: 'usd', idempotencyKey: 'usd', registerId: secondRegister.id,
    currency: 'USD', amountMinor: 5000,
  }

  assert.equal(buildCashBookBalance(register, [eurIncome]).closingBalanceMinor, 2500)
  assert.equal(buildCashBookBalance(secondRegister, [usdIncome]).closingBalanceMinor, 5000)
  assertDomainError('workspace_mismatch', () => buildCashBookBalance(register, [usdIncome]))
})

test('corrections preserve the original and require a full linked reversal plus replacement', () => {
  const original = entry({ kind: 'expense', amountMinor: 5000, id: 'original', idempotencyKey: 'original' })
  const reversal = entry({
    kind: 'reversal', id: 'reversal', idempotencyKey: 'reversal', paymentMethod: null,
    amountMinor: 5000, reversesEntryId: 'original', correctionReason: 'Corrected amount',
    createdAt: '2026-11-20T11:00:00.000Z',
  })
  const replacement = entry({
    kind: 'expense', id: 'replacement', idempotencyKey: 'replacement', amountMinor: 6000,
    createdAt: '2026-11-20T12:00:00.000Z', sourceKey: 'expense:replacement-source',
  })
  const result = buildCashBookBalance(register, [replacement, reversal, original])

  assert.equal(result.closingBalanceMinor, -6000)
  assert.equal(result.rows.find((row) => row.entry.id === 'original')?.signedAmountMinor, -5000)
  assert.equal(result.rows.find((row) => row.entry.id === 'reversal')?.signedAmountMinor, 5000)
  assert.throws(() => appendCashBookEntry(register, [original], { ...reversal, amountMinor: 3000 }))
  assertDomainError('already_reversed', () => appendCashBookEntry(register, [original, reversal], {
    ...reversal, id: 'second-reversal', idempotencyKey: 'second-reversal',
  }))
})

test('rejects duplicate source postings and makes exact retries idempotent', () => {
  const first = entry({ sourceKey: 'invoice_payment:payment-1' })
  const saved = appendCashBookEntry(register, [], first)
  assert.deepEqual(appendCashBookEntry(register, saved, { ...first, createdAt: '2026-11-20T10:05:00.000Z' }), saved)
  assertDomainError('idempotency_conflict', () => appendCashBookEntry(register, saved, { ...first, amountMinor: 2000 }))
  assertDomainError('duplicate_source', () => appendCashBookEntry(register, saved, {
    ...first, id: 'duplicate-source', idempotencyKey: 'different-request',
  }))
})

test('preserves optional receipt references and treats them as part of an idempotent request', () => {
  const withReceipt = entry({ receiptReference: 'Beleg-17' })
  const saved = appendCashBookEntry(register, [], withReceipt)
  assert.equal(saved[0].receiptReference, 'Beleg-17')
  assertDomainError('idempotency_conflict', () => appendCashBookEntry(register, saved, {
    ...withReceipt, receiptReference: 'Beleg-18',
  }))
})

test('rejects cross-workspace entries and reversal targets', () => {
  assertDomainError('workspace_mismatch', () => appendCashBookEntry(register, [], entry({ workspaceId: 'other-workspace' })))
  assertDomainError('workspace_mismatch', () => appendCashBookEntry(register, [entry({ workspaceId: 'other-workspace' })], entry({ id: 'new-entry', idempotencyKey: 'new-entry' })))
  assertDomainError('workspace_mismatch', () => buildCashBookBalance(register, [entry({ workspaceId: 'other-workspace' })]))

  const otherRegister = { ...register, id: 'register-2' }
  const original = entry({ registerId: otherRegister.id, id: 'foreign', idempotencyKey: 'foreign' })
  const reversal = entry({ kind: 'reversal', paymentMethod: null, reversesEntryId: 'foreign', correctionReason: 'Wrong register' })
  assertDomainError('workspace_mismatch', () => appendCashBookEntry(register, [original], reversal))
})

test('rejects currency mismatch instead of converting or changing the source value', () => {
  const foreign = entry({ currency: 'USD', amountMinor: 10000 })
  assertDomainError('currency_mismatch', () => appendCashBookEntry(register, [], foreign))
  assert.equal(foreign.amountMinor, 10000)
  assert.equal(foreign.currency, 'USD')
})

test('allows reading a closed register but prevents adding new entries to it', () => {
  const closedRegister = { ...register, active: false }
  const existing = entry()
  assert.equal(buildCashBookBalance(closedRegister, [existing]).closingBalanceMinor, 1250)
  assert.deepEqual(appendCashBookEntry(closedRegister, [existing], existing), [existing])
  assertDomainError('register_inactive', () => appendCashBookEntry(closedRegister, [], entry({ id: 'new-entry' })))
})
