import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node's native TypeScript runner requires explicit extensions.
import { safeExternalHttpUrl } from './external-url.ts'

test('accepts public HTTP(S) URLs and normalizes them', () => {
  assert.equal(safeExternalHttpUrl('https://shop.example/product/1'), 'https://shop.example/product/1')
  assert.equal(safeExternalHttpUrl('http://shop.example/product/1'), 'http://shop.example/product/1')
})

test('rejects unsafe, malformed, and credential-bearing URLs', () => {
  for (const value of [null, '', 'javascript:alert(1)', 'data:text/html,hi', 'ftp://shop.example/item', 'not a url', 'https://user:pass@shop.example/item']) {
    assert.equal(safeExternalHttpUrl(value), null)
  }
})
