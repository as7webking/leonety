import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { isProductLowStock } from './product-workspace.ts'

test('stock state follows the existing quantity-at-or-below-threshold rule', () => {
  assert.equal(isProductLowStock(2, 3), true)
  assert.equal(isProductLowStock(3, 3), true)
  assert.equal(isProductLowStock(4, 3), false)
  assert.equal(isProductLowStock(0, 0), true)
  assert.equal(isProductLowStock(Number.NaN, 3), false)
})

