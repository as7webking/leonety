import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { buildAssistantPageRanges, buildAssistantUnpaidInvoices, calculateInvoiceOutstanding, isIssuedUnpaidInvoiceStatus, summarizeTransactionAmounts } from './assistant-data-math.ts'

test('fetch planning covers complete datasets beyond PostgREST default row limits', () => {
  const ranges = buildAssistantPageRanges(2_501, 400)
  assert.equal(ranges.length, 7)
  assert.deepEqual(ranges[0], { from: 0, to: 399 })
  assert.deepEqual(ranges.at(-1), { from: 2_400, to: 2_500 })
  assert.throws(() => buildAssistantPageRanges(100_001, 400))
})

test('financial sums use saved workspace-currency snapshots and exact decimal arithmetic', () => {
  const result = summarizeTransactionAmounts([
    { amount: '0.10', currency: 'EUR', workspace_amount: null, workspace_currency: 'EUR' },
    { amount: '0.20', currency: 'EUR', workspace_amount: null, workspace_currency: 'EUR' },
    { amount: '100.00', currency: 'USD', workspace_amount: '92.34', workspace_currency: 'EUR' },
  ], 'EUR')
  assert.deepEqual(result, { count: 3, amount: '92.64', complete: true, unconvertedCount: 0, currency: 'EUR' })
})

test('unconverted foreign amounts make the aggregate explicitly incomplete, never zero', () => {
  const result = summarizeTransactionAmounts([
    { amount: '20.00', currency: 'USD', workspace_amount: null, workspace_currency: 'EUR' },
  ], 'EUR')
  assert.equal(result.amount, null)
  assert.equal(result.complete, false)
  assert.equal(result.unconvertedCount, 1)
})

test('zero financial rows are a successful exact zero-record result', () => {
  assert.deepEqual(summarizeTransactionAmounts([], 'EUR'), {
    count: 0, amount: '0.00', complete: true, unconvertedCount: 0, currency: 'EUR',
  })
})

test('invoice outstanding uses exact partial-payment arithmetic and excludes drafts', () => {
  assert.equal(calculateInvoiceOutstanding('100.00', '35.25', 'EUR'), '64.75')
  assert.equal(calculateInvoiceOutstanding('100.00', '100.00', 'EUR'), '0')
  assert.equal(calculateInvoiceOutstanding('100.00', '101.00', 'EUR'), '0')
  assert.equal(isIssuedUnpaidInvoiceStatus('draft'), false)
  assert.equal(isIssuedUnpaidInvoiceStatus('sent'), true)
  assert.equal(isIssuedUnpaidInvoiceStatus('overdue'), true)
})

test('unpaid invoice answers preserve real invoice identities and partial balances', () => {
  const result = buildAssistantUnpaidInvoices([
    { id: 'draft-id', invoice_number: 'D-1', client_id: 'client-a', status: 'draft', total: '90.00', currency: 'EUR' },
    { id: 'sent-id', invoice_number: 'INV-2', client_id: 'client-b', status: 'sent', total: '100.00', currency: 'EUR' },
    { id: 'overdue-id', invoice_number: 'INV-1', client_id: 'client-c', status: 'overdue', total: '50.00', currency: 'EUR' },
    { id: 'paid-id', invoice_number: 'INV-3', client_id: 'client-d', status: 'sent', total: '20.00', currency: 'EUR' },
  ], [
    { invoice_id: 'sent-id', amount: '35.25', currency: 'EUR' },
    { invoice_id: 'paid-id', amount: '20.00', currency: 'EUR' },
  ])
  assert.equal(result?.count, 2)
  assert.deepEqual(result?.invoices.map(({ id, invoiceNumber, clientId, outstanding }) => ({ id, invoiceNumber, clientId, outstanding })), [
    { id: 'overdue-id', invoiceNumber: 'INV-1', clientId: 'client-c', outstanding: '50.00' },
    { id: 'sent-id', invoiceNumber: 'INV-2', clientId: 'client-b', outstanding: '64.75' },
  ])
})

test('invoice payment currency mismatch fails closed', () => {
  const result = buildAssistantUnpaidInvoices([
    { id: 'invoice-id', invoice_number: 'INV-1', client_id: null, status: 'sent', total: '50.00', currency: 'EUR' },
  ], [{ invoice_id: 'invoice-id', amount: '10.00', currency: 'USD' }])
  assert.equal(result, null)
})
