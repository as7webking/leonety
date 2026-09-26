import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { createIncomingOrderPushPayload, detectAudioType, isPermanentPushFailure } from './order-notifications.ts'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { getWooOrderIdentity, isWooNewOrderTopic, verifyWooWebhookSignature } from './order-webhook.ts'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { createOrderCreatedEvent, isDuplicateOrderEventError } from './order-events.ts'

const wooWebhookRoute = readFileSync(new URL('../app/api/webhooks/woocommerce/orders/[connectionId]/route.ts', import.meta.url), 'utf8')
const pushServer = readFileSync(new URL('./order-notifications-server.ts', import.meta.url), 'utf8')

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

test('normalizes safe order.created metadata and recognizes provider retries', () => {
  const event = createOrderCreatedEvent({
    workspaceId: 'workspace',
    provider: 'woocommerce',
    externalOrderId: '1842',
    providerDeliveryId: 'delivery-1',
    createdAt: '2026-09-26T10:00:00.000Z',
    display: { orderNumber: '1842', amount: '73.50', currency: 'EUR' },
  })

  assert.deepEqual(event, {
    type: 'order.created',
    workspaceId: 'workspace',
    provider: 'woocommerce',
    externalOrderId: '1842',
    createdAt: '2026-09-26T10:00:00.000Z',
    providerDeliveryId: 'delivery-1',
    display: { orderNumber: '1842', amount: '73.50', currency: 'EUR' },
  })
  assert.equal(JSON.stringify(event).includes('customer'), false)
  assert.equal(isDuplicateOrderEventError({ code: '23505' }), true)
  assert.equal(isDuplicateOrderEventError({ code: '500' }), false)
})

test('emits order.created only after connection and signature verification', () => {
  const connectionCheck = wooWebhookRoute.indexOf("!connection?.active || !connection.order_webhook_secret")
  const signatureCheck = wooWebhookRoute.indexOf('if (!verifyWooWebhookSignature')
  const eventProcessing = wooWebhookRoute.indexOf('const result = await processVerifiedOrderCreatedEvent({')

  assert.ok(connectionCheck > -1)
  assert.ok(signatureCheck > connectionCheck)
  assert.ok(eventProcessing > signatureCheck)
  assert.match(wooWebhookRoute, /isWooNewOrderTopic/)
})

test('deduplicates before push and respects the selected enabled device', () => {
  const eventInsert = pushServer.indexOf(".from('incoming_order_alert_events')")
  const pushDelivery = pushServer.indexOf('await deliverIncomingOrderAlert({')

  assert.ok(eventInsert > -1)
  assert.ok(pushDelivery > eventInsert)
  assert.match(pushServer, /isDuplicateOrderEventError\(insertError\)/)
  assert.match(pushServer, /select\('enabled, active_device_id'\)/)
  assert.match(pushServer, /!settings\?\.enabled \|\| !settings\.active_device_id/)
  assert.match(pushServer, /\.eq\('id', settings\.active_device_id\)/)
})

test('validates MP3 and WAV content signatures, not MIME alone', () => {
  assert.equal(detectAudioType(Uint8Array.from([0x49,0x44,0x33,0,0,0]), 'audio/mpeg'), 'audio/mpeg')
  assert.equal(detectAudioType(Uint8Array.from([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x41,0x56,0x45]), 'audio/wav'), 'audio/wav')
  assert.equal(detectAudioType(Uint8Array.from([1,2,3,4]), 'audio/mpeg'), null)
})
