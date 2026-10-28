import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { getChannelPublicationCounts, getProductChannelPresentation } from './integration-presentation.ts'

test('publication counts require both successful status and external ID', () => {
  const counts = getChannelPublicationCounts(7, [
    { external_product_id: '1', sync_status: 'synced', last_synced_at: '2026-10-15T09:00:00.000Z' },
    { external_product_id: null, sync_status: 'synced' },
    { external_product_id: '3', sync_status: 'failed' },
    { external_product_id: null, sync_status: 'pending' },
  ])
  assert.deepEqual(counts, { published: 1, errors: 1, pending: 1, notPublished: 4, lastSuccessfulSync: '2026-10-15T09:00:00.000Z' })
})

test('product channel presentation does not show stale failed mappings as published', () => {
  assert.equal(getProductChannelPresentation({ external_product_id: '9', sync_status: 'failed' }), 'error')
  assert.equal(getProductChannelPresentation({ external_product_id: null, sync_status: 'pending' }), 'pending')
  assert.equal(getProductChannelPresentation({ external_product_id: '9', sync_status: 'pending' }), 'update_pending')
  assert.equal(getProductChannelPresentation({ external_product_id: null, sync_status: 'synced' }), 'not_published')
  assert.equal(getProductChannelPresentation({ external_product_id: '9', sync_status: 'synced' }), 'published')
  const localeSource = readFileSync(resolve('src/lib/i18n.ts'), 'utf8')
  assert.equal(localeSource.match(/'products\.channelStatus\.updatePending':/g)?.length, 7)
})

test('WooCommerce links use the returned permalink and failed syncs preserve the last mapping', () => {
  const route = readFileSync(resolve('src/app/api/woocommerce/products/sync/route.ts'), 'utf8')
  assert.match(route, /safeExternalHttpUrl\(wooProduct\.permalink\)/)
  assert.match(route, /if \(payload\.woo_product_id !== undefined\)/)
  assert.match(route, /if \(payload\.sync_status === 'synced'\) row\.last_synced_at/)
})

test('product views only render validated provider URLs with safe external-link attributes', () => {
  const detail = readFileSync(resolve('src/app/(app)/products/[productId]/page.tsx'), 'utf8')
  const edit = readFileSync(resolve('src/app/(app)/products/[productId]/edit/page.tsx'), 'utf8')
  for (const source of [detail, edit]) {
    assert.match(source, /safeExternalHttpUrl\(sync(?:\?\.|\.)external_url\)/)
    assert.match(source, /target="_blank" rel="noopener noreferrer"/)
  }
})
