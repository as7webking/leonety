import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { findLeonetyWooProduct, getWooImageWarning, persistPublishedWooMapping } from './woocommerce-sync-safety.ts'

const route = readFileSync(resolve('src/app/api/woocommerce/products/sync/route.ts'), 'utf8')

const remoteProduct = {
  id: 482,
  permalink: 'https://shop.example/product/item/',
  meta_data: [{ key: 'leonety_product_id', value: 'local-product-1' }],
}

test('WooCommerce success plus saved mapping is reported as persisted', async () => {
  let persistedId = 0
  const result = await persistPublishedWooMapping(remoteProduct, async (product) => {
    persistedId = product.id
  })

  assert.deepEqual(result, { status: 'mapped' })
  assert.equal(persistedId, remoteProduct.id)
})

test('provider failure does not attempt local mapping persistence', async () => {
  let persistenceCalled = false
  await assert.rejects(async () => {
    const product = await Promise.reject(new Error('provider failed'))
    await persistPublishedWooMapping(product, async () => { persistenceCalled = true })
  })
  assert.equal(persistenceCalled, false)
})

test('provider success plus mapping failure retains provider ID for reconciliation', async () => {
  const result = await persistPublishedWooMapping(remoteProduct, async () => {
    throw new Error('database write failed')
  })
  assert.deepEqual(result, { status: 'mapping_failed', reconciliationWooProductId: 482 })
})

test('retry identifies only the exact Leonety metadata match, never SKU alone', () => {
  const matching = { id: 12, sku: 'SHARED', meta_data: [{ key: 'leonety_product_id', value: 'local-product-1' }] }
  const unrelated = { id: 13, sku: 'SHARED', meta_data: [] }

  assert.deepEqual(findLeonetyWooProduct([unrelated, matching], 'local-product-1'), { product: matching, ambiguous: false })
  assert.deepEqual(findLeonetyWooProduct([unrelated], 'local-product-1'), { product: null, ambiguous: false })
  assert.deepEqual(findLeonetyWooProduct([matching, { ...matching, id: 14 }], 'local-product-1'), { product: null, ambiguous: true })
})

test('image inspection never makes server requests for valid, malicious, redirect, or timeout URLs', () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    throw new Error('image URL must not be fetched by this process')
  }) as typeof fetch

  try {
    const urls = [
      'https://project.supabase.co/storage/v1/object/public/product-images/company/products/item.jpg',
      'http://localhost/private.jpg',
      'http://127.0.0.1/admin.jpg',
      'http://192.168.1.1/private.jpg',
      'http://169.254.169.254/latest/meta-data.jpg',
      'https://public.example/redirect-to-private.jpg',
      'https://public.example/timeout.jpg',
    ]
    for (const url of urls) getWooImageWarning(url)
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('route checks mapping persistence and returns reconciliation identity after provider success', () => {
  assert.match(route, /const \{ error \} = await adminSupabase[\s\S]*if \(error\) throw new Error\('sync_mapping_persistence_failed'\)/)
  assert.match(route, /providerPublished: true[\s\S]*reconciliationWooProductId: mappingResult\.reconciliationWooProductId/)
  assert.match(route, /reconcileWooProductId/)
  assert.match(route, /isLeonetyWooProduct\(candidate, productId\)/)
  assert.match(route, /\/products\?sku=\$\{encodeURIComponent\(productRow\.sku\.trim\(\)\)\}/)
  assert.doesNotMatch(route, /method:\s*'HEAD'/)
  assert.doesNotMatch(route, /fetch\(imageUrl/)
})
