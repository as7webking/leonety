import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { formatAssistantDataAnswer, getAssistantDataFailureResponse, getUnsupportedAssistantResponse } from './assistant-data-format.ts'

test('zero results differ from retrieval failure and unsupported live facts', () => {
  assert.match(formatAssistantDataAnswer('en', 'product_count', { count: 0 }), /No products/)
  assert.match(getAssistantDataFailureResponse('en'), /couldn.t retrieve/)
  assert.match(getUnsupportedAssistantResponse('en', 'live_data'), /can.t verify/)
})

test('invoice answer displays only retrieved identities and actual outstanding balances', () => {
  const answer = formatAssistantDataAnswer('en', 'unpaid_invoice_summary', {
    count: 1,
    invoices: [{ id: 'real-id', invoiceNumber: 'INV-42', customer: 'Actual Client', status: 'sent', currency: 'EUR', outstanding: '65.00' }],
  })
  assert.match(answer, /INV-42/)
  assert.match(answer, /Actual Client/)
  assert.match(answer, /€65\.00/)
  assert.doesNotMatch(answer, /draft/i)
})

test('unverified feature response does not invent a route', () => {
  assert.match(getUnsupportedAssistantResponse('en', 'feature'), /won.t invent a route or setting/)
})
