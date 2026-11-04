import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { getWooImportDecision } from './woocommerce-import-safety.ts'
// @ts-expect-error Node's native TypeScript runner requires the explicit extension.
import { woocommerceImportSummaryDictionaries } from './woocommerce-import-summary-i18n.ts'

const importRoute = readFileSync(new URL('../app/api/woocommerce/products/import/route.ts', import.meta.url), 'utf8')
const publishRoute = readFileSync(new URL('../app/api/woocommerce/products/sync/route.ts', import.meta.url), 'utf8')
const webhookRoute = readFileSync(new URL('../app/api/webhooks/woocommerce/orders/[connectionId]/route.ts', import.meta.url), 'utf8')
const orderServer = readFileSync(new URL('./order-notifications-server.ts', import.meta.url), 'utf8')
const stockPage = readFileSync(new URL('../app/(app)/stock-movements/page.tsx', import.meta.url), 'utf8')
const operationsMigration = readFileSync(new URL('../../supabase/migrations/20260919205522.sql', import.meta.url), 'utf8')
const orderMigration = readFileSync(new URL('../../supabase/migrations/20260919205522.sql', import.meta.url), 'utf8')

test('Woo import is create-only for new provider items and never overwrites a mapped or SKU-matched Leonety product', () => {
  assert.equal(getWooImportDecision({ hasMapping: false, hasSkuMatch: false }), 'create')
  assert.equal(getWooImportDecision({ hasMapping: true, hasSkuMatch: false }), 'skip_linked')
  assert.equal(getWooImportDecision({ hasMapping: false, hasSkuMatch: true }), 'skip_conflict')
  assert.match(importRoute, /if \(decision === 'skip_linked'\)[\s\S]*?continue/)
  assert.match(importRoute, /if \(decision === 'skip_conflict'\)[\s\S]*?continue/)
  assert.doesNotMatch(importRoute, /\.from\('products'\)\.update\(payload\)/)
})

test('Woo import persists mappings before reporting created and cleans up a newly inserted row on mapping failure', () => {
  assert.match(importRoute, /if \(syncError\) throw syncError/)
  assert.match(importRoute, /if \(mappingError\) \{[\s\S]*?\.from\('products'\)\.delete\(\)[\s\S]*?throw new Error\('product_import_mapping_failed'\)/)
  assert.match(importRoute, /if \(cleanup\.error \|\| !cleanup\.data\?\.length\)[\s\S]*?reconciliationRequired\.push/)
  assert.match(importRoute, /return NextResponse\.json\(\{ imported: created, created, skipped, conflicts, failed, reconciliationRequired \}\)/)
  assert.match(importRoute, /requireOwnedCompany\(companyId\)/)
  assert.match(importRoute, /\.eq\('company_id', companyId\)/)
})

test('Woo publication failures retain stable provider identity and never claim unmapped success', () => {
  assert.match(publishRoute, /if \(error\) throw new Error\('sync_mapping_persistence_failed'\)/)
  assert.match(publishRoute, /providerPublished: true[\s\S]*reconciliationWooProductId/)
  assert.match(publishRoute, /findLeonetyWooProduct\(skuCandidates, productId\)/)
  assert.match(publishRoute, /isLeonetyWooProduct\(candidate, productId\)/)
  assert.match(publishRoute, /More than one WooCommerce item matches this Leonety product/)
})

test('duplicate verified order webhooks are idempotently recognized before push work', () => {
  const eventInsertAt = orderServer.indexOf(".from('incoming_order_alert_events')")
  const duplicateCheckAt = orderServer.indexOf('if (isDuplicateOrderEventError(insertError))')
  const pushAt = orderServer.indexOf('await deliverIncomingOrderAlert({', duplicateCheckAt)
  assert.ok(eventInsertAt >= 0 && duplicateCheckAt > eventInsertAt && pushAt > duplicateCheckAt)
  assert.match(webhookRoute, /processVerifiedOrderCreatedEvent/)
  assert.match(orderMigration, /unique \(company_id, provider, external_order_id, event_type\)/)
})

test('order webhook does not deduct stock without supported line-item mapping; manual changes use canonical movement RPC', () => {
  assert.doesNotMatch(webhookRoute, /record_stock_movement|stock_movements|line_items/)
  assert.match(stockPage, /supabase\.rpc\('record_stock_movement'/)
  const rpcStart = operationsMigration.indexOf('create or replace function public.record_stock_movement')
  const rpcEnd = operationsMigration.indexOf('$$;', rpcStart)
  const rpc = operationsMigration.slice(rpcStart, rpcEnd)
  assert.match(rpc, /for update/)
  assert.match(rpc, /current_stock = current_quantity \+ quantity_change/)
  assert.match(rpc, /previous_quantity,[\s\S]*resulting_quantity/)
  assert.match(stockPage, /stockSyncFailed = !stockSyncResponse\.ok/)
  assert.match(stockPage, /if \(stockSyncFailed\) setError\(t\('stock\.syncFailedAfterMovement'\)\)/)
})

test('import and post-movement sync results are localized across supported locales', () => {
  const locales = Object.keys(woocommerceImportSummaryDictionaries) as Array<keyof typeof woocommerceImportSummaryDictionaries>
  const expectedKeys = Object.keys(woocommerceImportSummaryDictionaries.en).sort()
  for (const locale of locales) {
    assert.deepEqual(Object.keys(woocommerceImportSummaryDictionaries[locale]).sort(), expectedKeys, locale)
    for (const key of expectedKeys as Array<keyof typeof woocommerceImportSummaryDictionaries.en>) {
      assert.ok(woocommerceImportSummaryDictionaries[locale][key].trim(), `${locale}:${key}`)
    }
  }
})
