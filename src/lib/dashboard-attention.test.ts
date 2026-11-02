import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildDashboardAttentionItems } from './dashboard-attention.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { dashboardAttentionDictionaries } from './dashboard-attention-i18n.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('dashboard attention omits verified zero counts and links positive counts only to real destinations', () => {
  const items = buildDashboardAttentionItems({
    overdue_invoices: 2,
    low_stock_products: 0,
    woocommerce_sync_errors: 1,
    mailbox_reconnect: 0,
    integration_errors: 0,
  })
  assert.deepEqual(items, [
    { type: 'overdue_invoices', count: 2, href: '/app/invoices' },
    { type: 'woocommerce_sync_errors', count: 1, href: '/app/products' },
  ])
  assert.deepEqual(buildDashboardAttentionItems({
    overdue_invoices: Number.NaN,
    low_stock_products: -1,
    woocommerce_sync_errors: 0,
    mailbox_reconnect: 0,
    integration_errors: 0,
  }), [])
})

test('attention API verifies workspace ownership and returns independent source availability', () => {
  const route = read('../app/api/dashboard/attention/route.ts')
  assert.match(route, /\.eq\('id', companyId\)\.eq\('owner_id', data\.user\.id\)/)
  assert.match(route, /\.eq\('company_id', companyId\)/)
  assert.match(route, /\.select\('id', \{ count: 'exact', head: true \}\)/)
  assert.match(route, /status: hasUnavailable \? 'partial' : 'ok'/)
  assert.match(route, /maxProductRows/)
  assert.match(route, /data\.length !== expectedRows/)
  assert.doesNotMatch(route, /notification_read_states/)
})

test('dashboard renders loading, empty, partial and retrieval-error states distinctly', () => {
  const dashboard = read('../app/(app)/dashboard/page.tsx')
  for (const key of ['loading', 'none', 'partial', 'error']) {
    assert.ok(dashboard.includes(`dashboard.attention.${key}`))
  }
  assert.match(dashboard, /attention\.scope !== currentCompany\.id/)
  assert.match(dashboard, /attention\.items\.length === 0 && attention\.status === 'loaded'/)
})

test('dashboard attention messages are translated for all supported locales', () => {
  const keys = Object.keys(dashboardAttentionDictionaries.en)
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const) {
    for (const key of keys) assert.ok(dashboardAttentionDictionaries[locale][key as keyof typeof dashboardAttentionDictionaries.en])
  }
})
