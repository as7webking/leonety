import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { productChannelComparisonDictionaries } from './product-channel-i18n.ts'
import { buildProductChannelComparison, classifyChannelProviderError, type CanonicalChannelProduct, type ExternalChannelProduct } from './product-channel-comparison.ts'

const localBase: CanonicalChannelProduct = { id:'local-1',name:'Espresso',sku:'SKU-1',barcode:'4001',price:3.5,stock:8,category:'Coffee',image:'https://example.com/espresso.jpg' }
const externalBase: ExternalChannelProduct = { id:'101',name:'Espresso',sku:'SKU-1',barcode:'4001',price:3.5,stock:8,category:'Coffee',image:'https://example.com/espresso.jpg',description:null,status:'active',supportedFields:['name','sku','barcode','price','stock','category','image'] }

test('uses an existing external mapping before identifiers and reports equal products as linked', () => {
  const rows = buildProductChannelComparison([localBase], [externalBase], [{ productId:localBase.id,externalProductId:externalBase.id,syncStatus:'synced',errorMessage:null }])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'linked')
  assert.equal(rows[0].matchReason, 'mapping')
  assert.deepEqual(rows[0].differences, [])
})

test('reports controlled field differences without changing either product', () => {
  const external = { ...externalBase, price:4, stock:3 }
  const rows = buildProductChannelComparison([localBase], [external], [{ productId:localBase.id,externalProductId:external.id,syncStatus:'synced',errorMessage:null }])
  assert.equal(rows[0].status, 'different')
  assert.deepEqual(rows[0].differences, ['price', 'stock'])
  assert.equal(localBase.price, 3.5)
})

test('matches unmapped products by SKU, then barcode, but never silently links them', () => {
  const skuRows = buildProductChannelComparison([localBase], [externalBase], [])
  assert.equal(skuRows[0].status, 'not_linked')
  assert.equal(skuRows[0].matchReason, 'sku')
  const barcodeLocal = { ...localBase, sku:null }
  const barcodeExternal = { ...externalBase, sku:null }
  const barcodeRows = buildProductChannelComparison([barcodeLocal], [barcodeExternal], [])
  assert.equal(barcodeRows[0].matchReason, 'barcode')
})

test('keeps provider-only and Leonety-only products separate', () => {
  const local = { ...localBase, sku:null, barcode:null, name:'Local only' }
  const external = { ...externalBase, sku:null, barcode:null, name:'Provider only' }
  const rows = buildProductChannelComparison([local], [external], [])
  assert.deepEqual(rows.map((row) => row.status).sort(), ['only_leonety', 'only_provider'])
})

test('treats duplicate SKU candidates as conflict and name similarity only as a suggestion', () => {
  const duplicate = { ...externalBase, id:'102' }
  const conflictRows = buildProductChannelComparison([localBase], [externalBase, duplicate], [])
  assert.equal(conflictRows[0].status, 'conflict')
  assert.deepEqual(conflictRows[0].candidateExternalIds, ['101', '102'])
  const suggestedLocal = { ...localBase, sku:null, barcode:null, name:'Premium Coffee Beans' }
  const suggestedExternal = { ...externalBase, sku:null, barcode:null, name:'Premium Coffee Beans' }
  const suggestionRows = buildProductChannelComparison([suggestedLocal], [suggestedExternal], [])
  assert.equal(suggestionRows[0].status, 'not_linked')
  assert.equal(suggestionRows[0].matchReason, 'name_suggestion')
})

test('treats SKU and barcode pointing at different provider listings as a conflict', () => {
  const skuMatch = { ...externalBase, id:'101',barcode:'other-barcode' }
  const barcodeMatch = { ...externalBase, id:'102',sku:'other-sku' }
  const rows = buildProductChannelComparison([localBase], [skuMatch, barcodeMatch], [])
  assert.equal(rows[0].status, 'conflict')
  assert.deepEqual(rows[0].candidateExternalIds, ['101', '102'])
})

test('surfaces provider sync failures without losing the existing mapping', () => {
  const rows = buildProductChannelComparison([localBase], [externalBase], [{ productId:localBase.id,externalProductId:externalBase.id,syncStatus:'failed',errorMessage:'timeout' }])
  assert.equal(rows[0].status, 'sync_error')
  assert.equal(rows[0].syncError, 'timeout')
})

test('classifies provider timeout and rate-limit failures for retryable UI states', () => {
  assert.equal(classifyChannelProviderError('WooCommerce request timed out.'), 504)
  assert.equal(classifyChannelProviderError('429 Too Many Requests'), 429)
  assert.equal(classifyChannelProviderError('provider_not_connected'), 400)
})

test('channel API authorizes workspace, keeps credentials server-only and unlink deletes only mapping', () => {
  const route = readFileSync(new URL('../app/api/products/channel-comparison/route.ts', import.meta.url), 'utf8')
  const server = readFileSync(new URL('./product-channel-server.ts', import.meta.url), 'utf8')
  const dialog = readFileSync(new URL('../components/products/product-channel-comparison-dialog.tsx', import.meta.url), 'utf8')
  assert.match(route, /requireOwnedCompany\(companyId\)/)
  assert.match(server, /decryptSecret/)
  assert.doesNotMatch(route, /consumer_key|consumer_secret|access_token/)
  assert.match(route, /\.from\('product_syncs'\)[\s\S]*?\.delete\(\)/)
  assert.doesNotMatch(route, /\.from\('products'\)\s*\.delete\(\)[\s\S]*?action === 'unlink'/)
  assert.match(route, /if \(fields\.length === 0\) throw new Error\('product_fields_required'\)/)
  assert.match(server, /stock !== null \? \['stock' as const\] : \[\]/)
  assert.match(server, /variants\.length === 1 \? variants\[0\] : null/)
  assert.match(dialog, /pullAvailableFields\.map/)
})

test('push adapters update mapped external ids instead of creating an automatic sync loop', () => {
  const wooRoute = readFileSync(new URL('../app/api/woocommerce/products/sync/route.ts', import.meta.url), 'utf8')
  const storeProducts = readFileSync(new URL('./store-products.ts', import.meta.url), 'utf8')
  assert.match(wooRoute, /existingWooId[\s\S]*?method: 'PUT'/)
  assert.match(storeProducts, /externalProductId[\s\S]*?method: externalProductId \? 'PUT' : 'POST'/)
  assert.match(wooRoute, /external_product_id/)
})

test('channel UI labels cover all seven locales', () => {
  const expected = Object.keys(productChannelComparisonDictionaries.en).sort()
  for (const [locale, dictionary] of Object.entries(productChannelComparisonDictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), expected, locale)
    for (const key of expected) assert.ok(dictionary[key]?.trim(), `${locale}:${key}`)
  }
})
