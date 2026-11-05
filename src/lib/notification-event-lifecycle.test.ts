import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildNotificationEvents } from './notification-center.ts'

const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const productId = '22222222-2222-4222-8222-222222222222'

function sources() {
  return {
    workspaceId,
    invoices: [],
    clients: [],
    products: [{ id: productId, name: 'Item', current_stock: 10, low_stock_threshold: 2, updated_at: '2026-11-01T09:00:00Z' }],
    failedWooSyncs: [{ product_id: productId, updated_at: '2026-11-01T10:00:00Z', last_synced_at: '2026-10-31T10:00:00Z' }],
    mailboxes: [{ id: '44444444-4444-4444-8444-444444444444', provider: 'google', provider_account_email: 'mail@example.com', status: 'error', updated_at: '2026-11-01T10:00:00Z', last_error_code: 'provider_unavailable', last_successful_connection_at: '2026-10-31T10:00:00Z' }],
    integrations: [{ id: '55555555-5555-4555-8555-555555555555', provider: 'shopify', store_name: 'Shop', updated_at: '2026-11-01T10:00:00Z', last_sync_at: '2026-10-31T10:00:00Z' }],
  }
}

test('repeated processing keeps one stable active alert and preserves its read state', () => {
  const initial = sources()
  const events = buildNotificationEvents(initial)
  const repeated = buildNotificationEvents({
    ...initial,
    failedWooSyncs: [{ ...initial.failedWooSyncs[0], updated_at: '2026-11-01T11:00:00Z' }],
    mailboxes: [{ ...initial.mailboxes[0], updated_at: '2026-11-01T11:00:00Z' }],
    integrations: [{ ...initial.integrations[0], updated_at: '2026-11-01T11:00:00Z' }],
    readKeys: new Set(events.map((event) => event.id)),
  })

  assert.deepEqual(repeated.map((event) => event.id), events.map((event) => event.id))
  assert.ok(repeated.every((event) => event.read))
  assert.equal(
    buildNotificationEvents({ ...initial, failedWooSyncs: [initial.failedWooSyncs[0], initial.failedWooSyncs[0]] })
      .filter((event) => event.type === 'product_sync_failed').length,
    1
  )
})

test('resolved issues disappear and later recurrence gets a new identity when recovery data exists', () => {
  const active = sources()
  const first = buildNotificationEvents(active)
  const resolved = buildNotificationEvents({ ...active, failedWooSyncs: [], mailboxes: [], integrations: [] })
  assert.equal(resolved.length, 0)

  const laterFailure = buildNotificationEvents({
    ...active,
    failedWooSyncs: [{ ...active.failedWooSyncs[0], last_synced_at: '2026-11-01T12:00:00Z' }],
    mailboxes: [{ ...active.mailboxes[0], last_successful_connection_at: '2026-11-01T12:00:00Z' }],
    integrations: [{ ...active.integrations[0], last_sync_at: '2026-11-01T12:00:00Z' }],
  })
  assert.ok(laterFailure.every((event, index) => event.id !== first[index].id))
})

test('derived low-stock and overdue identities do not invent a new recurrence without persisted transition data', () => {
  const base = {
    workspaceId,
    invoices: [{ id: '11111111-1111-4111-8111-111111111111', invoice_number: 'INV-8', client_id: null, due_date: '2026-10-10', created_at: '2026-10-01' }],
    clients: [],
    products: [{ id: productId, name: 'Item', current_stock: 1, low_stock_threshold: 2, updated_at: '2026-11-01T10:00:00Z' }],
    failedWooSyncs: [],
    mailboxes: [],
    integrations: [],
  }
  const first = buildNotificationEvents(base)
  const recovered = buildNotificationEvents({ ...base, invoices: [], products: [] })
  const recurred = buildNotificationEvents(base)

  assert.equal(recovered.length, 0)
  assert.deepEqual(recurred.map((event) => event.id), first.map((event) => event.id))
})

test('event identity and payload stay scoped to the requested workspace', () => {
  const event = buildNotificationEvents(sources())[0]
  assert.equal(event.workspaceId, workspaceId)
  assert.match(event.id, /^[a-z_]+:[^:]+:/)
})
