import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildNotificationEvents } from './notification-center.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { getNotificationCenterText } from './notification-center-i18n.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('notification events derive only from active workspace records and link to existing destinations', () => {
  const events = buildNotificationEvents({
    workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    invoices: [{ id: '11111111-1111-4111-8111-111111111111', invoice_number: 'INV-8', client_id: 'c1', due_date: '2026-10-10', created_at: '2026-10-01' }],
    clients: [{ id: 'c1', name: 'Client' }],
    products: [
      { id: '22222222-2222-4222-8222-222222222222', name: 'Low item', current_stock: 1, low_stock_threshold: 2, updated_at: '2026-10-20T09:00:00Z' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Healthy item', current_stock: 8, low_stock_threshold: 2, updated_at: '2026-10-20T09:00:00Z' },
    ],
    failedWooSyncs: [{ product_id: '22222222-2222-4222-8222-222222222222', updated_at: '2026-10-21T09:00:00Z' }],
    mailboxes: [{ id: '44444444-4444-4444-8444-444444444444', provider: 'google', provider_account_email: 'mail@example.com', status: 'reconnect_required', updated_at: '2026-10-22T09:00:00Z' }],
    integrations: [{ id: '55555555-5555-4555-8555-555555555555', provider: 'shopify', store_name: 'Shop', updated_at: '2026-10-23T09:00:00Z' }],
  })

  assert.equal(events.length, 5)
  assert.ok(events.every((event) => event.workspaceId === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
  assert.ok(events.every((event) => event.read === false))
  assert.equal(events.find((event) => event.type === 'invoice_overdue')?.href, '/app/invoices?invoiceId=11111111-1111-4111-8111-111111111111')
  assert.equal(events.find((event) => event.type === 'low_stock')?.href, '/app/products/22222222-2222-4222-8222-222222222222')
  assert.equal(events.find((event) => event.type === 'product_sync_failed')?.href, '/app/products/22222222-2222-4222-8222-222222222222')
  assert.equal(events.find((event) => event.type === 'mailbox_reconnect')?.href, '/app/settings/mailbox')
  assert.equal(events.find((event) => event.type === 'integration_error')?.href, '/app/settings/integrations/55555555-5555-4555-8555-555555555555')
})

test('notification identities preserve read state for the same source event and distinguish new state', () => {
  const input = {
    workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    invoices: [],
    clients: [],
    products: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Item', current_stock: 1, low_stock_threshold: 2, updated_at: '2026-10-20T09:00:00Z' }],
    failedWooSyncs: [],
    mailboxes: [],
    integrations: [],
  }
  const first = buildNotificationEvents(input)
  const read = buildNotificationEvents({ ...input, readKeys: new Set([first[0].id]) })
  const changed = buildNotificationEvents({ ...input, products: [{ ...input.products[0], current_stock: 0 }] })
  assert.equal(read[0].read, true)
  assert.notEqual(changed[0].id, first[0].id)
  assert.equal(buildNotificationEvents({ ...input, products: [input.products[0], input.products[0]] }).length, 1)
})

test('notification data API requires current user workspace ownership and keeps source failures distinct from empty', () => {
  const route = read('../app/api/notification-center/route.ts')
  for (const source of ["from('invoices')", "from('products')", "from('product_syncs')", "from('mailbox_connections')", "from('store_integrations')"]) {
    assert.ok(route.includes(source))
  }
  assert.match(route, /\.eq\('owner_id', data\.user\.id\)/)
  assert.match(route, /\.eq\('company_id', companyId\)/)
  assert.match(route, /if \(error\) throw new Error\('notification_source_unavailable'\)/)
  assert.match(route, /notification_read_states/)
  assert.doesNotMatch(route, /select\('[^']*(?:api_key|api_secret|access_token|consumer_secret)/i)
})

test('notification center has localized labels for every supported language', () => {
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const) {
    assert.notEqual(getNotificationCenterText(locale, 'title'), 'title')
    assert.ok(getNotificationCenterText(locale, 'low_stock_message', 'Widget').includes('Widget'))
    assert.notEqual(getNotificationCenterText(locale, 'invoice_not_found'), 'invoice_not_found')
  }
})

test('notification navigation uses the center while push-device settings remain separate', () => {
  const navigation = read('../components/app-shell/navigation-items.ts')
  const center = read('../app/(app)/notifications/page.tsx')
  const invoices = read('../app/(app)/invoices/page.tsx')
  assert.match(navigation, /href: '\/app\/notifications', labelKey: 'nav\.notifications'/)
  assert.match(center, /href="\/app\/settings\/notifications"/)
  assert.match(invoices, /searchParams\.get\('invoiceId'\)/)
  assert.match(invoices, /handleEdit\(invoice\)/)
})
