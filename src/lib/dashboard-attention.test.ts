import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { buildDashboardAttentionItems, getDashboardAttentionDisplayState } from './dashboard-attention.ts'
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
  assert.match(route, /result\.error \|\| result\.count === null/)
  assert.match(route, /catch \{ return \[type, \{ count: null, status: 'unavailable'/)
  assert.match(route, /countResult\.count > maxProductRows/)
  assert.doesNotMatch(route, /notification_read_states/)
})

test('dashboard renders loading, empty, partial and retrieval-error states distinctly', () => {
  const dashboard = read('../app/(app)/dashboard/page.tsx')
  for (const key of ['loading', 'partial', 'error']) {
    assert.ok(dashboard.includes(`dashboard.attention.${key}`))
  }
  assert.match(dashboard, /attentionDisplayState === 'loading'/)
  assert.match(dashboard, /attentionDisplayState === 'error'/)
  assert.doesNotMatch(dashboard, /dashboard\.attention\.none/)
})

test('attention data refreshes on return to the app without polling or duplicate in-flight requests', () => {
  const dashboard = read('../app/(app)/dashboard/page.tsx')
  assert.match(dashboard, /window\.addEventListener\('focus', refreshAttention\)/)
  assert.match(dashboard, /document\.addEventListener\('visibilitychange', refreshWhenVisible\)/)
  assert.match(dashboard, /if \(cancelled \|\| inFlight \|\| Date\.now\(\) - lastStartedAt < 1500\) return/)
  assert.doesNotMatch(dashboard, /setInterval\s*\(/)
})

test('dashboard attention messages are translated for all supported locales', () => {
  const keys = Object.keys(dashboardAttentionDictionaries.en)
  for (const locale of ['en', 'de', 'ru', 'tr', 'uk', 'pl', 'fr'] as const) {
    for (const key of keys) assert.ok(dashboardAttentionDictionaries[locale][key as keyof typeof dashboardAttentionDictionaries.en])
  }
})

test('dashboard attention remains readable and actionable on narrow screens', () => {
  const dashboard = read('../app/(app)/dashboard/page.tsx')
  assert.match(dashboard, /className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"/)
  assert.match(dashboard, /className="min-w-0"/)
  assert.match(dashboard, /className="break-words text-sm text-slate-600"/)
  assert.match(dashboard, /<Link href=\{item\.href\} className="shrink-0"><Button/)
  assert.match(dashboard, /const action = item\.type === 'overdue_invoices' \|\| item\.type === 'low_stock_products' \? 'view' : 'fix'/)
})

test('attention display hides empty success and keeps loading, errors, partial and issues distinct', () => {
  const base = { workspaceId: 'workspace-a', scope: 'workspace-a', items: [] as const }
  assert.equal(getDashboardAttentionDisplayState({ ...base, status: 'loaded' }), 'empty')
  assert.equal(getDashboardAttentionDisplayState({ ...base, status: 'loaded', items: [{ type: 'overdue_invoices', count: 1, href: '/app/invoices' }] }), 'issues')
  assert.equal(getDashboardAttentionDisplayState({ ...base, status: 'loaded', items: [
    { type: 'overdue_invoices', count: 1, href: '/app/invoices' },
    { type: 'low_stock_products', count: 2, href: '/app/inventory?stock=low' },
  ] }), 'issues')
  assert.equal(getDashboardAttentionDisplayState({ ...base, scope: 'workspace-b', status: 'loaded' }), 'loading')
  assert.equal(getDashboardAttentionDisplayState({ ...base, status: 'loading' }), 'loading')
  assert.equal(getDashboardAttentionDisplayState({ ...base, status: 'error' }), 'error')
  assert.equal(getDashboardAttentionDisplayState({ ...base, status: 'partial' }), 'partial')
  assert.equal(getDashboardAttentionDisplayState({ ...base, status: 'partial', items: [{ type: 'mailbox_reconnect', count: 1, href: '/app/settings/mailbox' }] }), 'issues_partial')
})

test('historical conversion warnings stay informational and separate from actionable attention', () => {
  const dashboard = read('../app/(app)/dashboard/page.tsx')
  assert.match(dashboard, /unconvertedRecordCount > 0[\s\S]*?currencySnapshot\.incompleteTotal/)
  assert.match(dashboard, /getDashboardAttentionDisplayState\(\{[\s\S]*workspaceId: currentCompany\.id/)
  const attentionSection = dashboard.slice(dashboard.indexOf("attentionDisplayState === 'issues'"), dashboard.indexOf("t('dashboard.businessTools')"))
  assert.doesNotMatch(attentionSection, /unconvertedRecordCount|currencySnapshot/)
})
