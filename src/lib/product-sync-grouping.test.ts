import assert from 'node:assert/strict'
import test from 'node:test'

const { groupProductSyncs } = await import(new URL('./product-sync-grouping.ts', import.meta.url).href)

test('groups product syncs while preserving order within each product', () => {
  const syncs = [
    { id: 'a-woo', product_id: 'a', channel: 'woocommerce' },
    { id: 'b-shop', product_id: 'b', channel: 'shopify' },
    { id: 'a-shop', product_id: 'a', channel: 'shopify' },
  ]

  assert.deepEqual(groupProductSyncs(syncs), {
    a: [syncs[0], syncs[2]],
    b: [syncs[1]],
  })
})

test('returns an empty grouping when no product syncs exist', () => {
  assert.deepEqual(groupProductSyncs([]), {})
})
