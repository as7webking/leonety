import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { buildClientInvoicesHref, filterInvoicesForClient } from './client-invoice-navigation.ts'

test('builds a restorable client invoice filter from the stable client id', () => {
  assert.equal(
    buildClientInvoicesHref('client-a'),
    '/app/invoices?clientId=client-a'
  )
})

test('keeps create intent separate from list filtering', () => {
  assert.equal(
    buildClientInvoicesHref('client-a', { create: true }),
    '/app/invoices?clientId=client-a&create=1'
  )
  assert.notEqual(buildClientInvoicesHref('client-a'), buildClientInvoicesHref('client-b'))
})

test('scopes zero, one or many invoices by client id rather than client name', () => {
  const invoices = [
    { id: 'a-1', client_id: 'client-a', clientName: 'Same name' },
    { id: 'b-1', client_id: 'client-b', clientName: 'Same name' },
    { id: 'a-2', client_id: 'client-a', clientName: 'Different display name' },
  ]

  assert.deepEqual(filterInvoicesForClient(invoices, 'missing'), [])
  assert.deepEqual(filterInvoicesForClient(invoices, 'client-b').map((invoice) => invoice.id), ['b-1'])
  assert.deepEqual(filterInvoicesForClient(invoices, 'client-a').map((invoice) => invoice.id), ['a-1', 'a-2'])
})
