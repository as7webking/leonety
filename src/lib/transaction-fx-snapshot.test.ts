import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildHistoricalTransactionFxSnapshot, mapWithConcurrency, resolveHistoricalTransactionFxSnapshot, transactionFxInputsChanged } from './transaction-fx-snapshot.ts'

const requestedDate = '2026-09-30'
const quote = (from: string, to: string, rate: string, rateDate = requestedDate, forDate = requestedDate) => ({
  from,
  to,
  rate,
  rateDate,
  requestedDate: forDate,
  fetchedAt: '2026-10-01T08:00:00.000Z',
  provider: 'frankfurter',
})

test('same-currency EUR identity uses the transaction date without an external quote', () => {
  const result = buildHistoricalTransactionFxSnapshot('100.00', 'EUR', 'EUR', requestedDate)
  assert.equal(result.verified, true)
  assert.equal(result.snapshot.workspace_amount, '100.00')
  assert.equal(result.snapshot.exchange_rate_source, 'identity')
  assert.equal(result.snapshot.exchange_rate_date, requestedDate)
})

test('same-currency resolution never calls the rate provider', async () => {
  let called = false
  const result = await resolveHistoricalTransactionFxSnapshot('25.00', 'EUR', 'EUR', requestedDate, async () => {
    called = true
    throw new Error('must not request')
  })
  assert.equal(called, false)
  assert.equal(result.verified, true)
})

test('historical AZN to EUR stores the requested pair and calculated amount', () => {
  const result = buildHistoricalTransactionFxSnapshot('100.00', 'AZN', 'EUR', requestedDate, quote('AZN', 'EUR', '0.54'))
  assert.equal(result.verified, true)
  assert.equal(result.snapshot.workspace_amount, '54.00')
  assert.equal(result.snapshot.exchange_rate, '0.54000000')
})

test('historical EUR to AZN uses the reverse quote direction, not the forward rate', () => {
  const result = buildHistoricalTransactionFxSnapshot('100.00', 'EUR', 'AZN', requestedDate, quote('EUR', 'AZN', '1.85185185'))
  assert.equal(result.verified, true)
  assert.equal(result.snapshot.workspace_amount, '185.19')
})

test('USD to EUR historical amount uses decimal rounding', () => {
  const result = buildHistoricalTransactionFxSnapshot('1.01', 'USD', 'EUR', requestedDate, quote('USD', 'EUR', '0.8630123456'))
  assert.equal(result.verified, true)
  assert.equal(result.snapshot.exchange_rate, '0.86301235')
  assert.equal(result.snapshot.workspace_amount, '0.87')
})

test('weekend or holiday quote records the actual preceding published rate date', () => {
  const result = buildHistoricalTransactionFxSnapshot('10.00', 'USD', 'EUR', '2026-09-27', quote('USD', 'EUR', '0.9', '2026-09-25', '2026-09-27'))
  assert.equal(result.verified, true)
  assert.equal(result.snapshot.exchange_rate_date, '2026-09-25')
})

test('missing, unsupported, mismatched, invalid or future quotes remain unverified', () => {
  const invalid = [
    undefined,
    quote('AZN', 'EUR', '0.9'),
    quote('USD', 'EUR', '0', requestedDate),
    quote('USD', 'EUR', '1.2', '2026-10-01'),
    { ...quote('USD', 'EUR', '1'), rateDate: '2026-02-30' },
  ]
  for (const candidate of invalid) {
    const result = buildHistoricalTransactionFxSnapshot('5.00', 'USD', 'EUR', requestedDate, candidate)
    assert.equal(result.verified, false)
    assert.equal(result.snapshot.workspace_amount, null)
    assert.equal(result.snapshot.exchange_rate_source, null)
  }
})

test('FX inputs change only when amount, currency or date changes', () => {
  const original = { amount: '100.00', currency: 'EUR', date: requestedDate }
  assert.equal(transactionFxInputsChanged(original, { ...original, currency: 'eur' }), false)
  assert.equal(transactionFxInputsChanged(original, { ...original, amount: '101.00' }), true)
  assert.equal(transactionFxInputsChanged(original, { ...original, currency: 'AZN' }), true)
  assert.equal(transactionFxInputsChanged(original, { ...original, date: '2026-10-01' }), true)
})

test('provider failure preserves source values and produces an explicit unverified snapshot', async () => {
  const source = Object.freeze({ amount: '100.00', currency: 'AZN', date: requestedDate })
  const result = await resolveHistoricalTransactionFxSnapshot(
    source.amount,
    source.currency,
    'EUR',
    source.date,
    async () => { throw new Error('timeout') }
  )
  assert.deepEqual(source, { amount: '100.00', currency: 'AZN', date: requestedDate })
  assert.equal(result.verified, false)
  assert.equal(result.snapshot.workspace_amount, null)
  assert.equal(result.snapshot.workspace_currency, 'EUR')
  assert.equal(result.snapshot.exchange_rate_source, null)
  assert.equal(result.snapshot.exchange_rate_date, null)
})

test('large imports keep historical rate lookups bounded', async () => {
  let active = 0
  let peak = 0
  const result = await mapWithConcurrency(Array.from({ length: 12 }, (_, index) => index), 3, async (value) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active -= 1
    return value * 2
  })
  assert.equal(peak, 3)
  assert.deepEqual(result, Array.from({ length: 12 }, (_, index) => index * 2))
})

test('Income and Expense writes remain workspace-scoped and preserve snapshots when source inputs are unchanged', () => {
  const incomePage = readFileSync(new URL('../app/(app)/income/page.tsx', import.meta.url), 'utf8')
  const expensePage = readFileSync(new URL('../app/(app)/expenses/page.tsx', import.meta.url), 'utf8')
  for (const page of [incomePage, expensePage]) {
    assert.match(page, /company_id: currentCompany\.id/)
    assert.match(page, /\.eq\('company_id', currentCompany\.id\)/)
    assert.match(page, /!editingEntry \|\| financialFieldsChanged/)
    assert.match(page, /transactionFxInputsChanged\(editingEntry, validatedData\)/)
    assert.match(page, /mapWithConcurrency\(rows\.slice\(1\), 4/)
    assert.match(page, /currencySnapshot\.unverifiedCount/)
  }
})
