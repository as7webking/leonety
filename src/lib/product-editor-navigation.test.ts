import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { buildProductEditorHref, getSafeProductReturnPath } from './product-editor-navigation.ts'

test('allows only canonical product list and inventory return routes', () => {
  assert.equal(getSafeProductReturnPath('/app/products?q=tea&status=active'), '/app/products?q=tea&status=active')
  assert.equal(getSafeProductReturnPath('/app/inventory?q=milk&stock=low'), '/app/inventory?q=milk&stock=low')
  assert.equal(getSafeProductReturnPath('/app/profile'), '/app/products')
  assert.equal(getSafeProductReturnPath('//example.com/app/products'), '/app/products')
  assert.equal(getSafeProductReturnPath('https://example.com/app/products'), '/app/products')
})

test('builds one canonical product editor URL with encoded return context', () => {
  assert.equal(
    buildProductEditorHref('product-id', '/app/inventory?q=ice tea&stock=low'),
    '/app/products/product-id/edit?returnTo=%2Fapp%2Finventory%3Fq%3Dice%2520tea%26stock%3Dlow',
  )
})
