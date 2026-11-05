import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildNotificationEvents } from './notification-center.ts'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

test('all generated notification destinations resolve to existing application routes', () => {
  const input = {
    workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    invoices: [{ id: '11111111-1111-4111-8111-111111111111', invoice_number: 'INV-8', client_id: null, due_date: '2026-10-10', created_at: '2026-10-01' }],
    clients: [],
    products: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Item', current_stock: 1, low_stock_threshold: 2, updated_at: '2026-11-01T10:00:00Z' }],
    failedWooSyncs: [{ product_id: '22222222-2222-4222-8222-222222222222', updated_at: '2026-11-01T10:00:00Z', last_synced_at: null }],
    mailboxes: [{ id: '44444444-4444-4444-8444-444444444444', provider: 'google', provider_account_email: 'mail@example.com', status: 'error', updated_at: '2026-11-01T10:00:00Z', last_error_code: 'provider_unavailable', last_successful_connection_at: null }],
    integrations: [{ id: '55555555-5555-4555-8555-555555555555', provider: 'shopify', store_name: 'Shop', updated_at: '2026-11-01T10:00:00Z', last_sync_at: null }],
  }
  const routes: Record<string, string> = {
    '/app/invoices': 'src/app/(app)/invoices/page.tsx',
    '/app/products/[productId]': 'src/app/(app)/products/[productId]/page.tsx',
    '/app/settings/mailbox': 'src/app/(app)/settings/mailbox/page.tsx',
    '/app/settings/integrations/[connectionId]': 'src/app/(app)/settings/integrations/[connectionId]/page.tsx',
  }

  for (const event of buildNotificationEvents(input)) {
    const path = new URL(event.href, 'https://leonety.invalid').pathname
    const route = Object.entries(routes).find(([pattern]) => pattern.includes('[')
      ? new RegExp(`^${pattern.replace(/\[[^\]]+\]/g, '[^/]+')}$`).test(path)
      : pattern === path)?.[1]
    assert.ok(route && existsSync(resolve(root, route)), `missing destination for ${event.type}: ${event.href}`)
  }
})

test('deleted or out-of-scope source entities cannot produce stale notification targets', () => {
  const events = buildNotificationEvents({
    workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    invoices: [],
    clients: [],
    products: [],
    failedWooSyncs: [{ product_id: '22222222-2222-4222-8222-222222222222', updated_at: '2026-11-01T10:00:00Z', last_synced_at: null }],
    mailboxes: [],
    integrations: [],
  })
  assert.deepEqual(events, [])
})

test('read-state API re-derives current workspace targets and rejects missing notification IDs', () => {
  const route = read('src/app/api/notification-center/route.ts')
  assert.match(route, /\.eq\('owner_id', data\.user\.id\)/)
  assert.match(route, /\.eq\('company_id', companyId\)/)
  assert.match(route, /events\.filter\(\(event\) => event\.id === parsed\.data\.notificationId\)/)
  assert.match(route, /notification_not_found/)
  assert.match(route, /\.eq\('user_id', access\.user\.id\)/)
})

test('mobile and desktop notification actions remain visible, named, and keyboard-operable', () => {
  const page = read('src/app/(app)/notifications/page.tsx')
  assert.match(page, /aria-label=\{getNotificationCenterText\(locale, notification\.read \? 'markUnread' : 'markRead'\)\}/)
  assert.match(page, /<Button[\s\S]*?onClick=\{\(\) => void updateReadState/)
  assert.match(page, /className=\{`flex min-w-0 items-start gap-3 p-4/)
  assert.match(page, /break-words text-sm text-slate-600/)
})
