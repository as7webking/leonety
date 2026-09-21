import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { createIncomingOrderPushPayload, detectAudioType, isPermanentPushFailure } from './order-notifications.ts'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { getWooOrderIdentity, isWooNewOrderTopic, verifyWooWebhookSignature } from './order-webhook.ts'

test('verifies WooCommerce HMAC signatures against the exact raw body', () => {
  const body = JSON.stringify({ id: 1842, total: '73.50' })
  const secret = 'local-test-secret'
  const signature = createHmac('sha256', secret).update(body).digest('base64')
  assert.equal(verifyWooWebhookSignature(body, signature, secret), true)
  assert.equal(verifyWooWebhookSignature(`${body} `, signature, secret), false)
  assert.equal(verifyWooWebhookSignature(body, 'invalid', secret), false)
})

test('accepts only order.created and extracts no customer details', () => {
  assert.equal(isWooNewOrderTopic('order.created'), true)
  assert.equal(isWooNewOrderTopic('order.updated'), false)
  assert.deepEqual(getWooOrderIdentity({ id: 1842, number: '1842', total: '73.50', currency: 'EUR', billing: { phone: 'private' } }), {
    id: '1842', number: '1842', total: '73.50', currency: 'EUR',
  })
})

test('creates localized minimal payloads and identifies permanent push failures', () => {
  const payload = createIncomingOrderPushPayload({ locale:'de', companyId:'company', orderId:'1842', orderNumber:'1842', amount:'73.50', currency:'EUR' })
  assert.equal(payload.title, 'Neue Bestellung')
  assert.match(payload.body, /WooCommerce.*1842.*73\.50 EUR/)
  assert.equal(JSON.stringify(payload).includes('customer'), false)
  assert.equal(isPermanentPushFailure(404), true)
  assert.equal(isPermanentPushFailure(410), true)
  assert.equal(isPermanentPushFailure(500), false)
})

test('validates MP3 and WAV content signatures, not MIME alone', () => {
  assert.equal(detectAudioType(Uint8Array.from([0x49,0x44,0x33,0,0,0]), 'audio/mpeg'), 'audio/mpeg')
  assert.equal(detectAudioType(Uint8Array.from([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x41,0x56,0x45]), 'audio/wav'), 'audio/wav')
  assert.equal(detectAudioType(Uint8Array.from([1,2,3,4]), 'audio/mpeg'), null)
})
